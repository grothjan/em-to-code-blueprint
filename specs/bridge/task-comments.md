# Task comments

Task comments are instructions to implementation agents. Agents have their own skills
for working with prooph board (reading element docs, `playType`/`playFunction`, other
elements of the slice/chapter, chapter scenarios), so comments say **what was done, where
to look, and what is left** - not how to implement.

All comments are posted with `is_task: true`.

## Marker and idempotency

Every comment starts with a one-line marker, followed by a blank line:

```
[em-to-code-blueprint:<action-key>]
```

e.g. `[em-to-code-blueprint:command:Crm.CreateUser]`, `[em-to-code-blueprint:known:Crm.CreateUser]`.

Before posting, the bridge checks the element's current `comments` for a **task** comment
whose text starts with the same marker; if present (and open, once the resolved
representation is verified - see api-contracts 2.3), nothing is posted. Re-triggering a slice
therefore never duplicates; a *resolved* "known" task is re-posted on the next trigger, which
is intended (the slice changed again, so compare again).

Comment text is built by pure functions in `bridge/task-comments.ts`:
`buildComment(action, ctx): string`. No I/O. Snapshot-tested.

## Shared "where to look" block

Appended to every generated-code comment:

```
Before implementing:
- Read this element's description and details on prooph board.
- Check the element's play type and play function.
- If needed, look at the other elements of this slice, the chapter, and the chapter scenarios.
Board reference: chapter <chapterName> (<chapterId>), slice <sliceLabel> (<sliceId>), element <elementId>.
When done, resolve this task.
```

## Templates

`{files}` lists real paths computed from naming rules (kebab-case) so the agent can open them directly.

### known
```
[em-to-code-blueprint:known:{FQCN}]

Element is known in the app. Compare the information in the Event Model with the implementation and make necessary changes to the implementation when needed.

Implementation: {files}
Registered in: {registryFile}
```
The first sentence is the product owner's wording with the typo fixed ("necessary", confirmed). Keep it in one exported constant `KNOWN_ELEMENT_SENTENCE`.

Wording of all other templates is a proposal (Q4): the implementing agent may improve phrasing, but must keep the marker line, the file paths, the registration location and the "where to look" block.

### command
```
[em-to-code-blueprint:command:{FQCN}]

Boilerplate for command {FQCN} was generated with `npx app codegen command {Ctx} {Name}`.
Finalize it:
- src/domain/{ctx}/commands/{name}/payload.ts: payload type
- .../prepare.ts: load/prepare state
- .../handle.ts: decision logic, returns events
- .../state.ts: state needed for the decision
Registered in src/domain/{ctx}/commands.ts.
{context-note}
```

### event
```
[em-to-code-blueprint:event:{FQCN}]

Boilerplate for event {FQCN} was generated with `npx app codegen event {Ctx} {Cmd} {Name}` (emitted by command {Ctx}.{Cmd}).
Finalize it:
- src/domain/{ctx}/commands/{cmd}/events/{name}.ts: event payload type
- make command {Ctx}.{Cmd} return this event where appropriate
Registered in src/domain/{ctx}/events.ts.
{other-command-sources-note}
```

### information
```
[em-to-code-blueprint:information:{FQCN}]

Boilerplate for information {FQCN} was generated with `npx app codegen information {Ctx} {Name}`.
Finalize it:
- src/domain/{ctx}/information/{name}/{name}.ts: information type
- .../query.ts and resolve.ts: query payload and resolution
- .../projection/: filled by projection cases (see separate tasks)
Registered in src/domain/{ctx}/queries.ts.
```

### prjcase (comment on the information element)
```
[em-to-code-blueprint:prjcase:{InfoFQCN}<-{EvtFQCN}]

Projection case for event {EvtFQCN} was generated with `npx app codegen prjcase {Ctx} {Info} {Evt}`.
Finalize it:
- src/domain/{ctx}/information/{info}/projection/{evt}/apply.ts: update the information from the event
- .../prepare.ts, .../state.ts: what state apply needs
Defaults: inline projection, no todo job. Decide whether it should run async (`--async`) or add a todo job (`--adds-todo`); regenerate or edit the registration in src/domain/{ctx}/events.ts accordingly.
```

### on (comment on the automation element)
```
[em-to-code-blueprint:on:{AutoFQCN}<-{EvtFQCN}]

Event automation {AutoFQCN} reacting to event {EvtFQCN} was generated with `npx app codegen on {Ctx} {Evt} {Auto}`.
Finalize it:
- src/domain/{ctx}/automations/events/{auto}/on.ts: what to do on the event (typically dispatch a command)
- .../prepare.ts, .../state.ts
Registered in src/domain/{ctx}/events.ts (inline by default; decide on `--async`).
```

### job (comment on the automation element)
```
[em-to-code-blueprint:job:{AutoFQCN}<-{InfoFQCN}]

Job automation {AutoFQCN} working off todo list {InfoFQCN} was generated with `npx app codegen job {Ctx} {Info} {Auto}`.
Finalize it:
- src/domain/{ctx}/automations/jobs/{auto}/process.ts: process one todo item
- .../prepare.ts, .../state.ts
Registered in src/domain/{ctx}/job-automations.ts.
The projection that fills the todo list must set addsTodoJob (see the information's projection cases).
```

### blocked
```
[em-to-code-blueprint:blocked:{FQCN-or-name}]

The bridge did not generate code for this element: {reason}.
Decide how to proceed: {hint}
```
Reasons/hints: invalid name for codegen; event without command source (hint: add the command
to the Event Model or implement the external event manually); cross-context link
(hint: codegen requires event, information and automation in the same context; see README todo
"External Events"); automation without event or information source.

### context note
When the action chain created a new context, the comment of the first element in that context
adds: `Context {Ctx} was created (src/domain/{ctx}). Review its services.ts and index.ts.`
