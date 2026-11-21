# Bridge: prooph board → Blueprint

The bridge watches your prooph board event model and generates blueprint boilerplate automatically whenever a slice reaches a chosen status (default: `planned`).

When triggered, it:
1. Fetches the slice's elements from the prooph board API.
2. Fetches dependency graphs for events, information, and automations.
3. Runs the blueprint's own `codegen` CLI as a subprocess to create missing files.
4. Posts a task comment on each affected element so an implementation agent knows exactly what was generated and what it still needs to do.

## Flow

```
prooph board
  └─ slice status changed to "planned"
        │
        ▼
  @proophboard/spec-stream  (reads proophboard.spec-stream.json)
        │  env: PROOPHBOARD_API_KEY, SPEC_STREAM_SLICE_ID, SPEC_STREAM_CHAPTER_ID
        ▼
  bridge/index.ts
        │
        ├─ 1. GET /chapters/{id}?slice_ids=…&structure_only=true  → elements
        ├─ 2. GET /chapters/{id}/elements/{id}/dependency-graph    → graphs (per event/info/auto)
        ├─ 3. plan(elements, graphs, registry)                     → ordered Action[]
        └─ 4. for each action:
               ├─ npx tsx bin/app.ts codegen …   (subprocess, no shell)
               └─ POST /chapters/{id}/elements/{id}/comments       → task comment
```

## Setup

### 1. Install dependencies

```bash
npm install
```

spec-stream is a separate CLI and does not need to be a project dependency.
Run it with `npx`:

```bash
npx @proophboard/spec-stream --help
```

Or install it globally if you prefer:

```bash
npm install -g @proophboard/spec-stream
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```dotenv
PROOPHBOARD_API_KEY=pb_your_write_enabled_key_here
PROOPHBOARD_API_ENDPOINT=https://flow.prooph-board.com/api
```

### 3. API key permissions — write access is required

The bridge posts task comments on board elements. This requires a **write-enabled API key**.

spec-stream's own documentation recommends read-only keys by default; the bridge is an exception. Create a dedicated write key in prooph board under **Settings → API Keys** and use that key exclusively for the bridge. Do not use the same key for read-only integrations — keep the blast radius small.

**Never commit your API key.** `.env` is git-ignored; `.env.example` (which you should commit) contains only placeholder values.

### 4. Start the bridge

```bash
npx @proophboard/spec-stream run
```

spec-stream reads `proophboard.spec-stream.json` from the current directory, connects to prooph board, and runs `tsx bridge/index.ts <sliceId>` whenever a slice status changes to `planned`.

The bridge uses `cwd` = the blueprint root (the directory where you run spec-stream) so that generated files land in `./src/domain` and `codegen` can find the registries.

## Dry run

Run the bridge with `--dry-run` (or set `BRIDGE_DRY_RUN=true`) to print the plan as JSON without executing any codegen or posting any comments:

```bash
# Manual dry run against a specific slice
PROOPHBOARD_API_KEY=pb_... \
PROOPHBOARD_API_ENDPOINT=https://flow.prooph-board.com/api \
tsx bridge/index.ts --dry-run --chapter-id <chapterId> --slice-id <sliceId>
```

Or via the npm script:

```bash
npm run bridge -- --dry-run --chapter-id <chapterId> --slice-id <sliceId>
```

The output is a JSON object with `dryRun: true` and the full `plan`, including every action and its kind, key, and arguments.

## Configuration

`proophboard.spec-stream.json` controls which status triggers the bridge. The default is `planned`:

```json
"when": {
  "data": {
    "newValue.status": ["planned"]
  }
}
```

To trigger on a different status (e.g. `"in progress"`), change the array value. To trigger on multiple statuses, add more entries to the array.

The `concurrency` setting uses a global queue, which prevents two bridge runs from modifying shared registry files (`events.ts`, `commands.ts`, etc.) at the same time:

```json
"concurrency": {
  "key": "global",
  "mode": "queue"
}
```

Do not change this to `parallel` — concurrent codegen writes will corrupt registries.

## Event-sourced contexts

By default, `codegen context` generates a standard (non-event-sourced) context. Set `BRIDGE_EVENT_SOURCED=true` in your `.env` to pass `--event-sourced` to every new context:

```dotenv
BRIDGE_EVENT_SOURCED=true
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | All actions completed or were skipped (already up to date). |
| `1`  | At least one action failed; others may have succeeded. The slice should be re-triggered after fixing the cause. |
| `2`  | Invalid invocation (missing required argument or environment variable). No API calls were made. |

spec-stream marks non-zero exits as failed but keeps running for subsequent events.

## Limitations

### Cross-context links (Q5)

The blueprint's codegen CLI requires the command, event, information, and automation for a given slice to all share the same context name. When the bridge detects a dependency link that crosses context boundaries (e.g. an event in context `Orders` triggers an automation in context `Shipping`), it cannot generate the automation and instead posts a `blocked` task comment on the element, explaining the reason.

The README lists "External Events" and "Public context method to consume external events" as open todos. Until those features exist, cross-context links must be wired manually.

### Counterpart elements in other slices (Q3)

When a dependency counterpart (e.g. the information read by an automation) lives in a different slice that has not yet been planned, the bridge generates only the parts it can and leaves a task comment explaining what is missing. The counterpart slice will get its own run when its status changes to `planned`.

### Idempotency

Running the bridge twice for the same slice is safe. The bridge re-reads the registry before each action and skips anything already generated. Task comments with the same marker are not re-posted unless the previous one was resolved (which signals that the element changed and needs to be compared again).

### Comment resolution and re-trigger loop

spec-stream's self-event filtering (enabled by default) prevents the bridge's own comment POSTs from re-triggering rules. The rule only listens to `slice-status-changed` anyway, so comment events never loop.

## Manual invocation

You can run the bridge manually against any slice without spec-stream:

```bash
export PROOPHBOARD_API_KEY=pb_...
export PROOPHBOARD_API_ENDPOINT=https://flow.prooph-board.com/api

tsx bridge/index.ts --chapter-id <chapterId> --slice-id <sliceId>
```

Alternatively via environment variables (the same way spec-stream passes them):

```bash
SPEC_STREAM_CHAPTER_ID=<chapterId> \
SPEC_STREAM_SLICE_ID=<sliceId> \
tsx bridge/index.ts
```

## Troubleshooting

**Exit 2 / "Missing API key"**: `PROOPHBOARD_API_KEY` is not set in the environment. Make sure `.env` is present and spec-stream (or your shell) is loading it.

**Exit 2 / "Missing chapter ID"**: spec-stream injects `SPEC_STREAM_CHAPTER_ID` automatically; if you are running manually you must provide `--chapter-id` or the env var.

**Codegen failed for `<action>`**: Check the logged stderr. Common causes are invalid element names on the board (names that cannot be converted to `PascalCase`) or a context that codegen cannot create. The bridge posts a `blocked` task comment on the element.

**Comment POST failed**: The API key does not have write permission, or the rate limit was hit. The bridge retries three times with backoff (250 ms, 1 s, 4 s). If all retries fail, the action is recorded as `failed-comment`: the code was generated but no comment was posted. The log includes the element ID so you can post the comment manually.
