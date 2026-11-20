# Prooph Board API Contracts - Step 2 Verification Summary

## Verified Contracts

### 1. Error Response Shape

**Confirmed**: `errorResponse(message: string, status = 400)` returns `{ error: message }`

- Location: `eventflow-designer/supabase/functions/api/index.ts`
- HTTP Status Codes:
  - 400: Validation errors (invalid input, missing required field)
  - 401: Unauthorized (invalid or missing API key)
  - 403: Forbidden (not authorized for this operation)
  - 404: Not found (chapter/element/slice does not exist)
  - 429: Too Many Requests (rate limit exceeded)
  - 500: Server error (internal failure)

**Retry Behavior**:
- 429 and 5xx: Retry with exponential backoff (250ms, 1s, 4s)
- 4xx (except 429): Do not retry

---

### 2. Task Comment Resolution

**Confirmed**: Tasks use `isTask: true` (boolean) field and are removed when resolved.

**Create Task Comment**:
- Endpoint: `POST /api/chapters/{chapter_id}/elements/{element_id}/comments`
- Body: `{ text: string, is_task: true }`
- Response: `{ commentId, text, createdAt, isTask }`
- The changelog event includes `newValue: { id, text, author, userId, createdAt, isTask: true }`

**Resolve Task**:
- Endpoint: `POST /api/chapters/{chapter_id}/elements/{element_id}/comments/{comment_id}/resolve`
- Behavior: Removes the comment from the element's comments array entirely
- Audit: Recorded as "Task resolved" in changelog
- Validation: Throws ValidationError if comment's `isTask !== true`
- **Idempotency**: Resolving a non-existent comment throws ValidationError, so safe to retry

---

### 3. GET /chapters/:id?slice_ids=&structure_only=true

**Confirmed**: `get_chapter` tool handles both parameters correctly.

**Endpoint**: `GET /api/chapters/{chapter_id}?slice_ids={slice_id}&structure_only=true`

**Parameters**:
- `slice_ids`: Array of slice IDs
  - Supports repeated params: `slice_ids=id1&slice_ids=id2`
  - Supports comma-separated: `slice_ids=id1,id2`
- `structure_only`: Boolean (coerced via `value === "true"`)

**Behavior**:
- `structure_only=true`:
  - Lanes: `details` field omitted
  - Slices: `details` field omitted
  - Elements: `playFunction` and `playType` omitted
- Elements are filtered to only those in the specified `slice_ids` (if provided)
- Lanes and slices are always returned in full

**Relevant Element Types**:
- command, event, information, automation (processed by bridge)
- hotspot, ui (present but ignored by bridge)

---

## Fixtures Created

```
bridge/testing/fixtures/
├── error-response.json           # Error response format and retry behavior
├── chapter-response.json         # Full chapter response example
├── dependency-graph-response.json # Dependency graph structure
├── task-comment.json             # Task comment create/resolve behavior
└── api-contracts-summary.md      # This file
```

---

## Implementation Notes

1. **API Key Permissions**: Must be a **write** key (for posting comments)
2. **Rate Limiting**: 120 req/min, 1000 req/hr per API key
3. **Timeout**: 15s per request (use `AbortSignal.timeout`)
4. **Boolean Coercion**: Query params use `value === "true"` (string comparison)
5. **Array Query Params**: Both `slice_ids=id1&slice_ids=id2` and `slice_ids=id1,id2` are supported

---

## Next Steps

After this verification, proceed to Step 3 (Model, naming, config) with confirmed accuracy of:
- Error response format
- Task comment resolution behavior
- Chapter query parameter handling
