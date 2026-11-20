# Architecture and test strategy

## Layout (inside `em-to-code-blueprint`)

```
bridge/
  index.ts                 # entry: parse argv/env/stdin, wire real deps, call run(), set exit code
  run.ts                   # run(deps, input): orchestration (load -> graphs -> plan -> execute)
  config.ts                # parseInvocation(argv, env, stdinText) -> Invocation | error
  naming.ts                # toPascalCase, toKebab, fqcn, file path helpers
  model.ts                 # BoardElement, DependencyGraph, Action, Plan, RegistrySnapshot types
  planner.ts               # plan(): pure, see planning-rules.md
  task-comments.ts         # buildComment(): pure, see task-comments.md
  prooph-client.ts         # interface ProophClient + fetch implementation (+ retry)
  codegen-runner.ts        # interface CodegenRunner + subprocess implementation
  executor.ts              # execute(plan, deps): ordering, skip-on-failure, comments, result
  *.test.ts                # next to sources (repo convention: lib/helpers/*.test.ts)
  testing/
    fake-prooph-server.ts  # node:http server serving fixtures, recording POSTs
    sandbox-project.ts     # temp project copy with real codegen
    fixtures/              # JSON from real API shapes
lib/helpers/registry-reader.ts (+ .test.ts)   # shared with bin/scanner.ts
proophboard.spec-stream.json
docs/bridge.md
```

Interfaces (the seams):

```ts
interface ProophClient {
  getSliceElements(chapterId: string, sliceId: string): Promise<{ slice: Slice; elements: BoardElement[]; chapterName: string }>;
  getDependencyGraph(chapterId: string, elementId: string): Promise<DependencyGraph>;
  addTaskComment(chapterId: string, elementId: string, text: string): Promise<void>;
}
interface CodegenRunner {
  run(args: string[]): Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string }>;
}
interface RegistryReader { read(): RegistrySnapshot }
```

`run(deps, input)` receives `{ prooph, codegen, registry, logger, options: { dryRun, eventSourced } }`.
No module under `bridge/` reads `process.env`, the clock or the filesystem except `index.ts`,
`codegen-runner.ts`, `registry-reader` and the sandbox helpers.

## Test layers (all with vitest, existing runner)

Target: every rule in `planning-rules.md` and every template in `task-comments.md` has at
least one test; every failure path in the executor has a test.

### L1 Unit (no I/O, fast)
- `naming.test.ts`: PascalCase from `"Place Order"`, `"order-placed"`, `"Crm.CreateUser"`, `"3d view"` (unresolvable), unicode, empty; kebab; FQCN; context default `App`.
- `config.test.ts`: argv vs env precedence; chapterId from env vs stdin; missing values -> exit 2; missing endpoint/key.
- `task-comments.test.ts`: snapshot per template; known sentence verbatim; marker format; context note.
- `registry-reader.test.ts`: multi-entry `commands.ts`/`queries.ts`/`job-automations.ts`, nested braces, empty registries, events with several `apply`/`automate` entries, missing files, folder-only information; regression test for the `scanDomain` bug.
- `planner.test.ts` (table-driven, one case per bullet):
  - R2: each element type registered -> `known`, not registered -> generation; automation registered as job or as event automation.
  - R3: context missing -> one `context` action ordered first, shared by several elements.
  - R4: event with command in same slice; command in other chapter; two command sources; none -> `blocked`; command in other context -> `blocked`; command already registered -> no `command` action.
  - R5: event->information both directions give one `prjcase`; link already exists -> none; information not registered -> `information` + `prjcase`; cross-context -> `blocked`.
  - R6/R7: event->automation gives `on`; information->automation gives `job`; automation with both; automation without sources -> `blocked`; automation already registered as job suppresses `on`.
  - R8: ordering and de-duplication; stable output (snapshot).
  - R9: counterparts of other chapters receive comment targets with their own `chapterId`.
  - R10: missing graph -> degraded plan + note.
  - Property test (optional, hand-rolled generator, no new dependency): planning twice with the registry after applying the first plan yields an empty action list except `known` (idempotency).

### L2 Client tests (`prooph-client.test.ts`)
Run against `fake-prooph-server` (real HTTP, real `fetch`), not mocks of fetch:
- correct URLs, query params (`slice_ids`, `structure_only=true`), headers (`Authorization: Bearer`), JSON body for comments (`is_task: true`).
- retries on 429/500 then success; no retry on 400/401/404; timeout; error message includes status but never the key.
- maps real response shape (fixtures copied from actual `get_chapter` and dependency-graph output) to `BoardElement`/`DependencyGraph`, drops irrelevant element types.

### L3 Executor tests (`executor.test.ts`) with fakes
- happy path: action order, comment text posted per action, comment targets (element + chapter id).
- codegen failure: no comment, dependants skipped, others continue, result `failed`.
- comment failure after codegen: result `failed-comment`, exit code 1.
- idempotency: marker present on the element -> not re-posted; registry re-read between actions skips already-satisfied actions.
- dry-run: no runner calls, no POSTs, plan printed.

### L4 Codegen integration (`codegen-runner.test.ts`, slower)
`sandbox-project.ts` creates a temp dir containing copies of `bin/`, `codegen/`, `lib/`,
`blueprint/`, `tsconfig.json`, `package.json` and a symlink to `node_modules`, with an empty
`src/domain/`. The real subprocess runner runs with `cwd` = sandbox. Asserts:
- real `context -> command -> event -> information -> prjcase -> on -> job` chain succeeds and registries contain the keys read back by `registry-reader` (contract test: reader and codegen agree).
- CLI validation failures (duplicate, missing context) produce `ok: false` with stderr, no throw.
- argument array safety: a hostile name (`"Foo; rm -rf /"`) is rejected by naming before reaching the CLI; additionally a direct runner test passes `$(touch pwned)` as an argument and asserts that no file is created.
Never run codegen against the real `src/domain` in tests.

### L5 End-to-end (`bridge.e2e.test.ts`)
`fake-prooph-server` + sandbox + real runner + real client, invoking `run()` (and one test that
spawns `bridge/index.ts` as a subprocess with env vars exactly as spec-stream sets them, plus
stdin JSON). Scenarios from fixtures:
1. Fresh app: slice with command, event, information (event->information) -> all generated, comments recorded for command, event, information (+prjcase).
2. Same slice again -> zero codegen, only `known` comments; third run -> no new comments (idempotent).
3. Slice with event -> automation in another slice, and information -> automation (job) -> `on` and `job` generated; comments on automation.
4. Cross-context link -> `blocked` comment, other elements still generated.
5. Dependency endpoint returns 500 for one element -> others processed, exit code 1.
6. Missing env (`PROOPHBOARD_API_KEY`) -> exit 2, no HTTP traffic.

### L6 Config tests (`spec-stream-config.test.ts`)
Parse `proophboard.spec-stream.json`: `on === "slice-status-changed"`, `when.data["newValue.status"]` set, `run` references `bridge/index.ts` and `$SPEC_STREAM_SLICE_ID` quoted, `concurrency.key === "global"` and `mode === "queue"`, `env.PROOPHBOARD_API_ENDPOINT` equals `endpoint`. If spec-stream exposes a config validator usable offline, call it too (check `spec-stream/src/config/schema.ts` in step 9); otherwise keep structural asserts.

### Coverage gate
Add `vitest --coverage` only if a coverage provider is already installed (do not add a
dependency just for this). Otherwise rely on the rule->test mapping above; step 10 has a
checklist for it.

## Logging
`logger` interface with `info/warn/error`; default writes lines to stdout/stderr (spec-stream
captures them per command). Plan summary is logged as one JSON line. The API key and any `pb_...`
value are redacted by a `redact()` helper used by the logger (unit tested).
