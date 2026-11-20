# Planning rules (pure logic)

`plan(input): Plan` where

```ts
type PlanInput = {
  slice: { id: string; chapterId: string };
  elements: BoardElement[];                         // relevant types only, with context, comments
  graphs: Map<string /*elementId*/, DependencyGraph>; // for event/information/automation
  registry: RegistrySnapshot;
};
type Plan = { actions: Action[]; notes: Note[] };
```

No I/O, no clock, no randomness. Deterministic ordering.

## Names

- Board names are free text ("Place Order", "order-placed", "Crm.CreateUser").
- `toPascalCase(name)`: split on non-alphanumerics and camelCase boundaries, capitalise each word, strip leftovers. If the result does not match `^[A-Z][a-zA-Z0-9]*$` (e.g. empty, starts with a digit) -> the element is **unresolvable** (Note + explanatory task comment, no codegen).
- Context: `element.context` (falls back to `"App"` as the API does) -> `toPascalCase`. Codegen requires `^[A-Z][a-zA-Z0-9]*$`.
- FQCN = `${Context}.${Name}`. Always pass **short names** plus context to the CLI, except where noted; the CLI accepts both.
- Same normalisation is used for graph counterparts, so identity is `(Context, type, Name)`.

## Action kinds

| Kind | CLI | Comment goes to |
|------|-----|-----------------|
| `context` | `codegen context <Ctx> [--event-sourced]` | none (a context has no element); mentioned in the comment of the element that required it |
| `command` | `codegen command <Ctx> <Cmd>` | the command element |
| `event` | `codegen event <Ctx> <Cmd> <Evt>` | the event element |
| `information` | `codegen information <Ctx> <Info>` | the information element |
| `prjcase` | `codegen prjcase <Ctx> <Info> <Evt>` | the information element |
| `on` | `codegen on <Ctx> <Evt> <Auto>` | the automation element |
| `job` | `codegen job <Ctx> <Info> <Auto>` | the automation element |
| `known` | none | the element (comment: "known in the app") |
| `blocked` | none | the element (comment explains why nothing was generated) |

Each action has a stable `key` (e.g. `command:Crm.CreateUser`, `prjcase:Crm.UserList<-Crm.UserCreated`) used for de-duplication and for the comment marker.

## Rules

### R1. Element relevance
Only `command | event | information | automation`.

### R2. Registered vs. new (per slice element)
Apply `registry-contract.md`. If registered -> action `known` for that element and **no** codegen for the element itself. (Its dependency links are still evaluated by R5-R7; a missing link is generated even when both ends are known.)

### R3. Context first
For every element that needs codegen (and every counterpart needed by a link): if `registry.contexts` lacks the context, emit a single `context` action per context, ordered before anything in that context.

### R4. Per-type generation for new elements
- **command**: `command` action.
- **event**: needs its command. Find the command in `graph.sources` with `type === "command"`: prefer one in the same slice, else the first in graph order. If found and same context -> `command` (if not registered, ordered first) then `event` action. If none found, or contexts differ -> `blocked` (reason: "no command source in the Event Model" / "command is in another context, which codegen does not support"). If several command sources exist, use the chosen one and mention the others in the comment.
- **information**: `information` action (query + projection enabled, the default). Information that is a lookup (no event source) still gets the default.
- **automation**: decided by R6/R7 from its sources. No source at all -> `blocked` (reason: cannot tell event automation from job automation; needs a human/agent).

### R5. Event -> Information (projection case)
For every `event E` in the slice and every `target` of type `information`; and for every `information I` in the slice and every `source` of type `event` (both directions yield the same link, de-duplicated by key):
- Requires E and I in the **same context**; else `blocked` on the information element.
- Ensure prerequisites: context, command+event for E (R4), information I (R4) - emitted before.
- If `eventApply[E]` lacks I -> `prjcase` action.
- Default flags: none (`--async`/`--adds-todo` are not inferable from the board; mentioned in the comment as choices for the implementer).

### R6. Event -> Automation (event automation)
For every `event E` in the slice with a `target` of type `automation A`, and every `automation A` in the slice with a `source` of type `event E`:
- Same-context requirement as R5, else `blocked` on the automation.
- Prerequisites: context, command+event for E.
- If `eventAutomate[E]` lacks A **and** A is not registered as a job -> `on` action.

### R7. Information -> Automation (job automation)
For every `information I` with a `target` of type `automation A`, and every `automation A` with a `source` of type `information I`:
- Same-context requirement, else `blocked`.
- Prerequisites: context, information I.
- If `jobs[A]` is missing -> `job` action. Note: `job` requires I to have a projection folder (CLI validation); I generated by R4 has it, an I that exists with `--no-projection` makes the CLI fail -> recorded as failed action, comment explains.
- An automation with both an event source and an information source gets both forms (R6 and R7) - each is a separate action and key.

### R8. Ordering and de-duplication
1. De-duplicate by `key`.
2. Sort by phase: `context` < `command` < `event` < `information` < `prjcase` < `on` < `job` < `known`/`blocked`.
3. Inside a phase keep first-seen order from `elements` sorted by `index` (the API order), then graph order. This keeps output stable for snapshot tests.
4. A prerequisite action pulled in by a link is placed in its normal phase, not next to the link.

### R9. Slice-local scope for "known"
`known` is emitted only for elements **in the triggering slice**. Counterparts from other slices/chapters get a comment only when a codegen action targeted them (the comment goes to the counterpart, using its own `chapterId`).

### R10. Skips
- Event/information/automation elements whose graph call failed: planner receives no graph -> only R2/R4 for the element itself (command/information), links skipped, Note recorded; executor exit code 1.

## Executor semantics

For each action in order:
1. Re-read registry snapshot; if the action's effect already exists (key satisfied) -> skip silently.
2. Run CLI (subprocess, arg array, `cwd` = blueprint root, timeout 60s). Non-zero exit -> action `failed` (stderr captured, truncated to 2k chars in logs); no comment; dependants of this action are `skipped` (e.g. `event` failed -> its `prjcase`/`on` skipped).
3. On success -> post task comment (see `task-comments.md`) unless an open task comment with the same marker already exists on the element.
4. Comment POST failure -> retried per api-contracts; if still failing, action counts as `failed-comment` (code is generated, exit code 1, logged with element id so a human can add it).

`--dry-run` flag: run steps 1-4 of the main flow (load, graph, plan) and print the plan as JSON; do not run codegen and do not post comments.
