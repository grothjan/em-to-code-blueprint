# Registry contract: "is it already in the app?"

All paths are relative to the blueprint root; `<ctx>` is the kebab-case context folder
under `src/domain/` (`Crm` -> `crm`, `TaskManagement` -> `task-management`; same rule the
codegen uses: `/([a-z])([A-Z])/g -> '$1-$2'` lowercased).

Names in registries are fully qualified: `Context.Name` (PascalCase both parts).

| Element type | Registered when | Source |
|--------------|-----------------|--------|
| context | folder `src/domain/<ctx>` exists | filesystem |
| command | key `Ctx.Name` in `src/domain/<ctx>/commands.ts` | `export const commands` |
| event | key `Ctx.Name` in `src/domain/<ctx>/events.ts` | `export const events` |
| information | key `Ctx.Name` in `queries.ts` **or** folder `information/<kebab-name>` exists (information may be generated with `--no-query`) | `export const queries` / filesystem |
| automation (event automation) | an `automate[].automation === "Ctx.Name"` entry under some event in `events.ts` | `events.ts` |
| automation (job) | key `Ctx.Name` in `job-automations.ts` | `export const jobs` |

An element of type `automation` is "registered" if **either** automation form contains it.

Link-level checks (needed by planning, not by "known element" comments):

| Link | Exists when |
|------|-------------|
| projection case (event -> information) | `events.ts[Event].apply[]` contains `information === "Ctx.Info"` |
| event automation (event -> automation) | `events.ts[Event].automate[]` contains `automation === "Ctx.Auto"` |
| job automation (information -> automation) | `job-automations.ts[Auto].todoList === "Ctx.Info"` |

## Parsing

DO NOT use `scanDomain()` from `bin/scanner.ts` for this.

Verified bug: `parseRegistryFile` uses `export const X: T = \{([^}]*)\}` which ends at the
first `}`. For a `commands.ts` with two entries (`"Ctx.A": { prepare, exec }, "Ctx.B": {...}`)
it returns only `Ctx.A`. `app list` and `app handle` are affected too.

Plan:

1. Add `lib/helpers/registry-reader.ts` with brace-counting parsing (reuse the approach of `parseEventsRegistry` in `lib/helpers/event-registry.ts`, which already parses `events.ts` with brace tracking and has 45 tests).
2. Provide: `readRegistrySnapshot(domainPath): RegistrySnapshot`.
3. Fix `bin/scanner.ts` to use the same reader (separate small step with its own regression test: two-entry `commands.ts` returns both keys).

`RegistrySnapshot` (all plain data, serializable, used by the planner):

```ts
type RegistrySnapshot = {
  contexts: Set<string>;                      // PascalCase names that exist; derive from folder names (kebab -> compare via toKebab(name))
  commands: Set<string>;                      // "Ctx.Name"
  events: Set<string>;
  queries: Set<string>;
  informationFolders: Set<string>;            // "Ctx.Name" derived from folder name
  jobs: Map<string, { todoList: string }>;    // automation FQCN -> todoList
  eventApply: Map<string, Set<string>>;       // event FQCN -> information FQCNs
  eventAutomate: Map<string, Set<string>>;    // event FQCN -> automation FQCNs
};
```

Context folder -> PascalCase: folders are kebab-case, so existence is checked with
`toKebab(contextName)`, not by reverse-converting folder names.

The snapshot is taken once before planning and **re-read before each action** in the executor
(cheap, avoids acting on stale state if codegen of an earlier action already created something).
