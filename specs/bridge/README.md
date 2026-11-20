# Bridge: Event Model (prooph board) -> Blueprint

Goal: when a slice changes status on prooph board, a script inside the blueprint
reads the slice, generates missing boilerplate with the blueprint's own `codegen`
CLI, and leaves precise **task comments** on the elements so implementation agents
know what to do.

The blueprint stays a *recommendation*, not a product. The bridge is a small,
readable, replaceable module plus a ready-to-use `proophboard.spec-stream.json`.

## Documents

| File | Content |
|------|---------|
| [`api-contracts.md`](./api-contracts.md) | What the bridge consumes: spec-stream process contract, prooph board REST API |
| [`registry-contract.md`](./registry-contract.md) | How the bridge decides "already registered" in the blueprint |
| [`planning-rules.md`](./planning-rules.md) | Element/dependency -> codegen action rules (the core logic) |
| [`task-comments.md`](./task-comments.md) | Exact task comment templates and idempotency |
| [`architecture-and-tests.md`](./architecture-and-tests.md) | Module layout, seams for testing, test layers |
| [`implementation-steps.md`](./implementation-steps.md) | Ordered, checkable steps for an agent |

## End-to-end flow

```
prooph board ──changelog──> spec-stream ──(rule: slice-status-changed)──> bridge script
                                                   env: PROOPHBOARD_API_KEY, SPEC_STREAM_SLICE_ID, SPEC_STREAM_CHAPTER_ID, ...
bridge script
  1. GET chapter (only this slice)                      -> elements of the slice
  2. read blueprint registries (src/domain/**)          -> what exists
  3. GET dependency graph per event/information/automation element
  4. PLAN (pure function): ordered list of actions
  5. EXECUTE: run `app codegen ...` as subprocess, then POST task comment per action
  6. exit 0 (all ok) / 1 (some action failed, others still ran)
```

## Decisions already made

1. Lives in the blueprint: `bridge/` (code + tests), `proophboard.spec-stream.json` (root), `docs/bridge.md`.
2. Language/runtime: TypeScript, run with `tsx` like `bin/app.ts`. Node >= 18, uses global `fetch`. No new runtime dependency.
3. Codegen is invoked as a **subprocess** (`npx tsx bin/app.ts codegen ...`, argument array, no shell). Reason: the codegen functions call `process.exit(1)` on validation errors and print to stdout, so they cannot be called in-process safely. An argument array also keeps untrusted element names out of any shell.
4. The bridge runs with cwd = blueprint root (spec-stream default `cwd` = config dir). `getDomainPath()` uses `process.cwd()`, so generated code lands in `./src/domain`.
5. The planner is a **pure function** `(sliceElements, graphs, registrySnapshot) -> Action[]`. All I/O sits behind interfaces. This is what makes the logic fully testable.
6. Idempotent: running twice for the same slice produces no duplicate codegen and no duplicate task comments.
7. spec-stream rule uses `concurrency: { key: "global", mode: "queue" }` because codegen edits shared registry files (`events.ts` etc.); parallel runs for different slices could corrupt them.
8. API key: the bridge writes comments, so the key must be a **write** key. spec-stream docs recommend read-only keys by default; `docs/bridge.md` must say this explicitly.
9. Self-event filtering of spec-stream (default on) prevents the bridge's own comments from re-triggering rules. The rule only listens to `slice-status-changed` anyway.

## Decisions confirmed by the owner

| # | Question | Decision |
|---|----------|----------|
| Q1 | Which slice status triggers the bridge? | `planned` only, via `when.data["newValue.status"]`; configurable in the JSON |
| Q2 | Event-sourced contexts? `codegen context` has `--event-sourced` | env `BRIDGE_EVENT_SOURCED=true` enables it; default off |
| Q3 | A dependency counterpart lives in another slice that is not ready (e.g. information in a `draft` slice). Generate prerequisites anyway? | Yes, generate only what the link needs; the counterpart gets its own task comment |
| Q4 | Wording of task comments | Free choice of the implementing agent, as long as they follow the templates' intent (what was done, where to look, what is left). The typo in the known-element sentence is fixed ("necessary") |

## Further defaults (not yet discussed, change if wrong)

| # | Question | Default |
|---|----------|---------|
| Q5 | Cross-context links (event in context A, automation/information in context B). The CLI requires event/information/automation to share the `<context>` argument | No codegen; add an explanatory "blocked" task comment on the dependent element. README lists "External Events" as a todo, so this is out of scope |
| Q6 | When an action cannot be performed (invalid name, event without command, cross-context) post a comment? | Yes, a task comment explaining why, so a human/agent decides |
