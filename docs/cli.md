# CLI for Code Generation and Execution

The project includes a unified CLI tool `app` for generating boilerplate code and running commands and queries.

## Code Generation

### Commands

#### `context <name> [--event-sourced]`

Generate a new context with the specified name:

```bash
npx app codegen context TaskManagement
npx app codegen context TaskManagement --event-sourced
```

**Arguments:**
- `name` - Context name in PascalCase (e.g., `TaskManagement`, `CrmUserManagement`)

**Options:**
- `--event-sourced` - Enable event sourcing mode (uses `index.es.ts.tpl` template)

The command:
1. Creates a directory in `src/domain/` using kebab-case (e.g., `task-management`)
2. Copies all blueprint files except `index.*`
3. Creates empty subdirectories (`commands/`, `events/`, `automations/`, `information/`)
4. Copies the appropriate index template (`index.es.ts.tpl` or `index.no-es.ts.tpl`)
5. Replaces `__context__` placeholders:
    - snake_case (`task_management`) in `index.ts`
    - PascalCase (`TaskManagement`) in `services.ts`

#### `command <context> <name>`

Generate a new command in an existing context:

```bash
npx app codegen command TaskManagement AddTodo
npx app codegen command TaskManagement TaskManagement.UpdateTodo
```

**Arguments:**
- `context` - Context name in PascalCase (e.g., `TaskManagement`)
- `name` - Command name in PascalCase (e.g., `AddTodo`) or fully qualified name (e.g., `TaskManagement.AddTodo`)

The command:
1. Validates that the context exists (suggests `app codegen context` if not)
2. Validates that the command is not already registered
3. Creates a new folder `src/domain/[context]/commands/[command-name]`
4. Copies blueprint files (`prepare.ts`, `handle.ts`, `payload.ts`, `state.ts`)
5. Creates an empty `events/` folder (blueprint events are not copied)
6. Adds the command to `commands.ts` with proper imports and registration

#### `information <context> <name> [--no-query] [--no-projection]`

Generate a new information in an existing context:

```bash
npx app codegen information TaskManagement TodoList
npx app codegen information TaskManagement TodoList --no-query --no-projection
npx app codegen information TaskManagement TaskManagement.TodoList
```

**Arguments:**
- `context` - Context name in PascalCase (e.g., `TaskManagement`)
- `name` - Information name in PascalCase (e.g., `TodoList`) or fully qualified name (e.g., `TaskManagement.TodoList`)

**Options:**
- `--no-query` - Omit query.ts and resolve.ts files
- `--no-projection` - Omit projection folder

The command:
1. Validates that the context exists (suggests `app codegen context` if not)
2. Validates that the information is not already registered
3. Creates a new folder `src/domain/[context]/information/[information-name]`
4. Copies blueprint files (`__information__.ts`, `query.ts`, `resolve.ts`) and creates `projection/` folder
5. Renames `__information__.ts` to the information name in kebab-case (e.g., `todo-list.ts`)
6. Replaces placeholders in files:
    - `__Information__` with PascalCase information name (without context)
    - `__information__` with kebab-case information name
7. Adds the information to `queries.ts` with proper imports and registration (unless `--no-query`)

#### `event <context> <command> <name>`

Generate a new event for an existing command in a context:

```bash
npx app codegen event TaskManagement AddTodo TodoAdded
npx app codegen event TaskManagement TaskManagement.AddTodo TodoAdded
npx app codegen event TaskManagement TaskManagement.AddTodo TaskManagement.TodoAdded
```

**Arguments:**
- `context` - Context name in PascalCase (e.g., `TaskManagement`)
- `command` - Command name in PascalCase (e.g., `AddTodo`) or fully qualified name (e.g., `TaskManagement.AddTodo`)
- `name` - Event name in PascalCase (e.g., `TodoAdded`) or fully qualified name (e.g., `TaskManagement.TodoAdded`)

The command:
1. Validates that the context exists (suggests `app codegen context` if not)
2. Validates that the command exists in the context (suggests `app codegen command` if not)
3. Validates that the event is not already registered
4. Creates a new folder `src/domain/[context]/commands/[command]/events/[event-name]`
5. Copies blueprint file (`__event__.ts`) into the event folder
6. Renames `__event__.ts` to the event name in kebab-case (e.g., `todo-added.ts`)
7. Replaces `__Event__` placeholder with PascalCase event name (without context)
8. Adds the event to `events.ts` with proper imports and registration


#### `prjcase <context> <information> <event>`

Generate a new projection case for an existing information and event in a context:

```bash
npx app codegen prjcase TaskManagement TodoList TodoAdded
npx app codegen prjcase TaskManagement TodoList TaskManagement.TodoAdded
npx app codegen prjcase TaskManagement TaskManagement.TodoList TodoAdded
npx app codegen prjcase TaskManagement TaskManagement.TodoList TaskManagement.TodoAdded
```

**Arguments:**
- `context` - Context name in PascalCase (e.g., `TaskManagement`)
- `information` - Information name in PascalCase (e.g., `TodoList`) or fully qualified name (e.g., `TaskManagement.TodoList`)
- `event` - Event name in PascalCase (e.g., `TodoAdded`) or fully qualified name (e.g., `TaskManagement.TodoAdded`)

**Options:**
- `--async` - Set `inline: false` in the projection case config
- `--adds-todo` - Set `addsTodoJob: true` in the projection case config

The command:
1. Validates that the context exists (suggests `app codegen context` if not)
2. Validates that the information exists with a projection folder (suggests `app codegen information` if not)
3. Validates that the event is registered in a command (suggests `app codegen event` if not)
4. Validates that the projection case folder does not exist yet
5. Creates a new folder `src/domain/[context]/information/[information]/projection/[event-name]`
6. Copies blueprint files (`apply.ts`, `prepare.ts`, `state.ts`) into the event folder
7. Replaces `__Event__` placeholder with PascalCase event name
8. Replaces `__command__` and `__event__` in import paths with the actual command and event kebab-case names
9. Adds the projection case to `events.ts` with proper imports and registration

#### `job <context> <information> <automation>`

Generate a new job automation for an existing information in a context:

```bash
npx app codegen job TaskManagement TodoList SendNotification
npx app codegen job TaskManagement TodoList TaskManagement.SendNotification
```

**Arguments:**
- `context` - Context name in PascalCase (e.g., `TaskManagement`)
- `information` - Information name in PascalCase (e.g., `TodoList`) or fully qualified name (e.g., `TaskManagement.TodoList`)
- `automation` - Automation name in PascalCase (e.g., `SendNotification`) or fully qualified name (e.g., `TaskManagement.SendNotification`)

The command:
1. Validates that the context exists (suggests `app codegen context` if not)
2. Validates that the information exists with a projection folder (suggests `app codegen information` if not)
3. Validates that the automation folder does not exist yet
4. Creates a new folder `src/domain/[context]/automations/jobs/[automation-name]`
5. Copies blueprint files (`prepare.ts`, `state.ts`, `process.ts`) into the automation folder
6. Replaces `__Automation__` placeholder with PascalCase automation name (without context)
7. Adds the job automation to `job-automations.ts` with proper imports and registration

#### `on <context> <event> <automation> [--async]`

Generate a new event automation for an existing event in a context:

```bash
npx app codegen on TaskManagement TodoAdded SendNotification
npx app codegen on TaskManagement TaskManagement.TodoAdded TaskManagement.SendNotification
npx app codegen on TaskManagement TodoAdded SendNotification --async
```

**Arguments:**
- `context` - Context name in PascalCase (e.g., `TaskManagement`)
- `event` - Event name in PascalCase (e.g., `TodoAdded`) or fully qualified name (e.g., `TaskManagement.TodoAdded`)
- `automation` - Automation name in PascalCase (e.g., `SendNotification`) or fully qualified name (e.g., `TaskManagement.SendNotification`)

**Options:**
- `--async` - Set `inline: false` in the event automation config

The command:
1. Validates that the context exists (suggests `app codegen context` if not)
2. Validates that the event is registered in the context (suggests `app codegen event` if not)
3. Validates that the automation folder does not exist yet in the `automations/events/` folder
4. Creates a new folder `src/domain/[context]/automations/events/[automation-name]`
5. Copies blueprint files (`on.ts`, `prepare.ts`, `state.ts`) into the automation folder
6. Replaces `__Event__` placeholder with PascalCase event name
7. Replaces `__command__` and `__event__` in import paths with the actual command and event kebab-case names
8. Adds the event automation to `events.ts` with proper imports and registration

## Execution

You can also execute commands and queries.

### Commands

#### `list`

List all available commands and queries grouped by context:

```bash
npx app list
```

The command dynamically scans `src/domain/*/commands.ts` and `src/domain/*/queries.ts` to discover all registered commands and queries.

#### `handle <command-name> <json-payload>`

Execute a command in a context:

```bash
npx app handle TaskManagement.AddTodo '{"title":"Test Todo","owner":"Alex"}'
```

The command searches for the command name in available contexts, validates the payload against TypeScript type definitions, loads the context module, and invokes `module.handle(command)`.

**Arguments:**
- `command-name` - The fully qualified command name (e.g., `TaskManagement.AddTodo`)
- `json-payload` - JSON object with command payload

The command displays:
- The command message being executed
- Command preparation and execution logs
- Success/failure status

If the command is not found, it shows available commands per context.

#### `resolve <query-name> <json-payload>`

Execute a query in a context:

```bash
npx app resolve TaskManagement.TodoList '{"status": "open"}'
```

The command searches for the query name in available contexts, validates the payload against TypeScript type definitions, loads the context module, and invokes `module.resolve(query)`.

**Arguments:**
- `query-name` - The fully qualified query name (e.g., `TaskManagement.TodoList`)
- `json-payload` - JSON object with query payload

The command displays:
- The query message being executed
- Query execution logs
- Success/failure status

If the query is not found, it shows available queries per context.

### Help

Get help for the CLI:

```bash
npx app --help
npx app -h
```
