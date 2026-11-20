# Specs

Plans for agents working on this repository. Each folder is one piece of work.

| Folder | Topic |
|--------|-------|
| [`bridge/`](./bridge/README.md) | Bridge from the prooph board Event Model to the blueprint via spec-stream |

Rules for agents following a plan:

- Work through `implementation-steps.md` in order. Each step lists files, tests and an acceptance check.
- Do not start a step before the previous step's tests pass (`npx vitest run` and `npm run ts:check`).
- If reality differs from a spec (an API shape, a CLI behaviour), stop, record it in the step's "Findings" line and adjust the spec before continuing.
