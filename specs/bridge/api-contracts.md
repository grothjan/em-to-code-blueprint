# API contracts consumed by the bridge

Sources read while writing this spec:
`eventflow-designer/supabase/functions/api/index.ts` (routes),
`.../_shared/tools.ts` (tool params/handlers),
`.../_shared/dependencyGraphUtils.ts`, `.../_shared/connectionRules.ts`,
`spec-stream/docs/{config-schema,command-context,event-reference,authentication}.md`.

## 1. spec-stream -> bridge (process contract)

Config rule (file `proophboard.spec-stream.json` in blueprint root):

```jsonc
{
  "endpoint": "https://flow.prooph-board.com/api",
  "env": { "PROOPHBOARD_API_ENDPOINT": "https://flow.prooph-board.com/api" },
  "rules": [
    {
      "id": "slice-to-blueprint",
      "on": "slice-status-changed",
      "when": { "data": { "newValue.status": ["planned"] } },   // Q1
      "run": "npx tsx bridge/index.ts \"$SPEC_STREAM_SLICE_ID\"",
      "timeout": 600000,
      "concurrency": { "key": "global", "mode": "queue" }
    }
  ]
}
```

- The `endpoint` is not passed to commands by spec-stream, so it is duplicated in `env.PROOPHBOARD_API_ENDPOINT`. The bridge reads that variable (and fails fast with a clear message if missing).
- API key: `PROOPHBOARD_API_KEY` is inherited from the spec-stream process environment. Never log it.
- Inputs the bridge reads, in this precedence:
  - `sliceId`: argv[2], else `SPEC_STREAM_SLICE_ID`
  - `chapterId`: `SPEC_STREAM_CHAPTER_ID`, else stdin JSON `event.chapterId`
  - `workspaceId` is NOT needed: the REST API injects it from the key.
- Missing sliceId or chapterId -> exit 2 with message (no API calls).
- stdin is JSON `{ mode: "single", event: {...}, row: {...} }`; read it only if the env var for chapter is missing (stdin may be empty/closed when run manually).
- Exit codes: 0 ok, 1 at least one action failed, 2 invalid invocation/config. spec-stream marks non-zero as failed but keeps running.

## 2. prooph board REST API

Base: `PROOPHBOARD_API_ENDPOINT` (already ends with `/api`).
Auth header: `Authorization: Bearer pb_...`. Responses: JSON; errors `{ error: string }` with HTTP status.

**Verified in Step 2**:
- Error response format: `{ error: string }` via `errorResponse()` in `eventflow-designer/supabase/functions/api/index.ts`
- HTTP status codes: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limit), 500 (server error)
- Retry behavior: 429 and 5xx trigger retry with exponential backoff (250ms, 1s, 4s); 4xx (except 429) do not retry

### 2.1 Load slice with elements

`GET {base}/chapters/{chapterId}?slice_ids={sliceId}&structure_only=true`

Response (from `get_chapter` tool):

```ts
{
  id, name, index, context, mode,            // chapter.context = default context
  lanes: [...], 
  slices: [{ id, label, width, index, details?, status, comments }],
  elements: [{                              // only elements of the requested slice(s)
    id, type, name, description, details, icon,
    laneId, sliceId, index,
    comments: Comment[],
    context: string                          // element context; "App" when unset
  }]
}
```

- `structure_only=true` omits `playFunction`/`playType` (large). The bridge does not need them; implementation agents read them later.
- Bridge keeps elements with `type in {command, event, information, automation}`. Everything else (`ui`, `hotspot`, lanes) is ignored.
- Slice not found in `slices` -> exit 1 with message.

### 2.2 Dependency graph per element

`GET {base}/chapters/{chapterId}/elements/{elementId}/dependency-graph`

```ts
{
  element: { id, type, name, context, sliceId, chapterId, chapterName, ... },
  sources: Array<{ id, type, name, description, details, laneId, sliceId, context, chapterId, chapterName, sliceStatus }>,
  targets: Array<same>
}
```

Semantics (from `buildDependencyGraph` + `getConnections`):

- Arrows come from Event Modeling connection rules; the graph also includes the same logical element (same type+name+context) in **other chapters**, so cross-slice and cross-chapter flows appear.
- Relevant arrow combinations for the bridge:
  - command -> event (event's `sources` contain the command)
  - event -> information (projection)
  - event -> automation (event automation)
  - information -> automation (job automation; also information -> ui, ignored)
- Sources/targets are deduped per chapter by type+name+context, not by id. Always key bridge logic on `(context, type, name)`, never on element id, except when posting a comment (needs the id + chapterId of the element being commented).
- Call it only for `event`, `information`, `automation` elements of the slice. Commands need no graph.
- Failure for one element (404/5xx) -> record error for that element, continue with others.

### 2.3 Add task comment

`POST {base}/chapters/{chapterId}/elements/{elementId}/comments`
Body: `{ "text": string, "is_task": true }`
Response: `{ commentId, text, createdAt, isTask }`

- `chapterId` must be the chapter that owns the element. For dependency counterparts in another chapter use `source/target.chapterId` from the graph response.
- Comment objects as read back (`comments` on elements) carry at least `id, text, author, userId, createdAt, isTask` (see `element-comment-added` event).
- **Verified in Step 2**:
  - Task comments have `isTask: true` (boolean) in the changelog event's `newValue`
  - Resolving a task comment (`POST {base}/chapters/{chapterId}/elements/{elementId}/comments/{commentId}/resolve`) **removes** the comment from the element's comments array entirely
  - Attempting to resolve a non-task comment throws `ValidationError`
  - Resolved comments are audited as "Task resolved" in the changelog
  - Idempotency: Resolve throws `ValidationError` if comment not found, so safe to retry

### 2.4 Rate limits / retries

- Retry network errors and HTTP 429/5xx up to 3 times with exponential backoff (250ms, 1s, 4s); no retry on 4xx. Backoff delays injectable for tests.
- Per-request timeout 15s (`AbortSignal.timeout`).

**Verified in Step 2**:
- Rate limit: 120 req/min, 1000 req/hr per API key (returns 429 with `Retry-After: 60` header)
- Backoff delays: 250ms, 1s, 4s
- Retry on: 429 (rate limit), 5xx (server errors)
- No retry on: 4xx (client errors, except 429)
