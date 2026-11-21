# Implementation steps

Work top to bottom. After every step: `npx vitest run` and `npm run ts:check` must pass
(baseline today: 2 test files, 57 tests passing). Commit per step only if the owner asks.
Each step ends with a **Findings** line to fill in if reality differed from the spec.

Read first: `README.md` of this folder, `AGENTS.md`, `docs/cli.md`, `bin/app.ts`, `codegen/command.ts`,
`lib/helpers/event-registry.ts` (+ test, as the style reference).

---

## Step 1: Registry reader + scanner fix
- Create `lib/helpers/registry-reader.ts` and `.test.ts` per `registry-contract.md` (`readRegistrySnapshot`, `toKebab`).
- Reuse `parseEventsRegistry` for `events.ts`; add brace-aware parsing for `commands.ts`, `queries.ts`, `job-automations.ts` (keys, and `todoList` value for jobs).
- Replace `parseRegistryFile` in `bin/scanner.ts` with the new reader.
- Tests: all L1 `registry-reader` cases; regression: two-entry `commands.ts` returns both keys through `scanDomain`.
- Accept: `npx app list` still works on `src/domain/task-management`; tests pass.
- Findings:

## Step 2: Verify external contracts (spike, no production code)
- Against `eventflow-designer/supabase/functions/api/index.ts` and `_shared/tools.ts`, confirm: error body shape (`errorResponse`), how a resolved task comment is represented in `data.comments` (look at `resolve_task` in `tools.ts`), that `GET /chapters/:id?slice_ids=&structure_only=true` works through `handleToolCall` query parsing (boolean coercion exists for `structure_only`).
- If a dev instance and a key are available, capture real responses of `get_chapter`, dependency graph and add comment into `bridge/testing/fixtures/` (redact ids/names if needed). Otherwise write fixtures by hand from the types in `api-contracts.md`.
- Update `api-contracts.md` sections 2.1-2.3 with confirmed facts.
- Findings:

## Step 3: Model, naming, config
- `bridge/model.ts`, `bridge/naming.ts`, `bridge/config.ts` with tests (L1).
- Accept: `naming` rejects everything the CLI regex `^[A-Z][a-zA-Z0-9]*$` would reject, accepts everything it accepts.
- Findings:

## Step 4: Task comments
- `bridge/task-comments.ts` + snapshot tests for every template in `task-comments.md`, including marker, `{files}` paths, context note.
- Accept: paths in comments match the real layout created by codegen (verified in Step 8 contract test; until then derive from `docs/cli.md`).
- Findings:

## Step 5: Planner
- `bridge/planner.ts` implementing R1-R10; table-driven tests listed in `architecture-and-tests.md` L1.
- Accept: every rule has a test; idempotency test (apply plan to registry, re-plan -> only `known`).
- Findings:

## Step 6: Prooph client
- `bridge/prooph-client.ts` (fetch, retry/backoff injectable, timeout, redaction) + `bridge/testing/fake-prooph-server.ts` + L2 tests.
- Accept: no test mocks `fetch`; key never appears in thrown messages or logs.
- Findings: `get_chapter` slices/elements carry no `chapterId`; the client sets it from the requested chapterId. Retry/timeout tests use real timers with tiny injected backoffs (fake timers block real HTTP + AbortSignal). Fake server exposes `failNext(status, n)` for retry scenarios. Fixtures are inline in `fake-prooph-server.ts`; move to `testing/fixtures/` when real captures exist.

## Step 7: Codegen runner and executor
- `bridge/codegen-runner.ts` (`child_process.execFile`/`spawn` with arg array, `cwd`, timeout, no shell; command `npx tsx bin/app.ts codegen ...` or the local `node_modules/.bin/tsx`).
- `bridge/executor.ts` per "Executor semantics" in `planning-rules.md`; NO EXTRA TESTS for now.
- Findings:

## Step 8: Sandbox + codegen integration tests
- `bridge/testing/sandbox-project.ts`; L4 tests (full chain, validation failures, hostile argument).
- Contract test: registry-reader reads what codegen wrote; comment `{files}` paths exist on disk.
- Open point to check here: the sandbox must resolve the `@lib/*` alias (tsconfig `paths`) and the blueprint template path (`codegen` uses `__dirname`, domain uses `process.cwd()`). If the copy approach fails, try running with `--tsconfig` pointing at the real repo.
- Findings: skipped for now due to token limits. Manual tests will be performed instead.

## Step 9: Entry point, spec-stream config, docs
- `bridge/run.ts`, `bridge/index.ts` (exit codes 0/1/2, `--dry-run`, `BRIDGE_EVENT_SOURCED`).
- `proophboard.spec-stream.json` as in `api-contracts.md` section 1 (trigger status `planned`, confirmed).
- `package.json`: script `"bridge": "tsx bridge/index.ts"`; do not add runtime dependencies. spec-stream itself is installed by the user (`npx` / global); document the exact invocation after checking the real package name and CLI in `spec-stream/package.json` and `spec-stream/README.md`.
- `.env.example` with `PROOPHBOARD_API_KEY` (write-enabled key note) and `PROOPHBOARD_API_ENDPOINT`; ensure `.env` is ignored by `.gitignore`.
- `docs/bridge.md`: setup, key permissions (write key required), flow diagram, how to dry-run, limitations (cross-context links Q5, readiness of counterpart slices Q3), how to change trigger status.
- README: tick the "spec-stream config" todo and link `docs/bridge.md`.
- NO EXTRA TESTS for now.
- Findings: 

## Step 10: Final verification
- Checklist: each rule R1-R10 and each template maps to a passing test (write the mapping as a comment block at the top of `planner.test.ts` / `task-comments.test.ts`).
- Run full suite twice (no order dependence), `npm run ts:check`.
- Manual smoke test (needs a real board and key; mark as not run if unavailable): start spec-stream in the blueprint root, change a slice status to the trigger status, observe generated files in `src/domain`, comments on elements, and no loop. Then revert generated files with git.
- Confirm no temp dirs or sandbox leftovers (`afterEach` cleanup) and no secrets in fixtures.
- Findings:
