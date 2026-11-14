# em-to-code-blueprint
Blueprint to translate an Event Model into a Functional Core

## What you get

The blueprint provides a starting point for organizing your code around an Event Model. It includes a basic structure for handling commands, events, automations and queries, as well as a context for organizing request handling with your favorite framework.

It is pseudo-code based on TypeScript and can be used as a starting point for your own implementation. It just communicates the general structure and flow of the code, but does not enforce the usage of a specific framework, library or language.

Pick your favorite language and framework/libraries. For example, you can use TypeScript with Express.js for a Node.js backend, or Python with Flask for a Python backend.

## Implementation Guidance

Let your favorite LLM inspect the blueprint and ask it to provide guidance on how to implement the blueprint in your chosen language and framework.

## Template Syntax

`__placeholder__` in folder and file names as well as in the source code indicate a dynamic structure, based on information derived from the Event Model. For example, if the Event Model has a command called `Crm.CreateUser`, the corresponding folder and file names might be `crm/commands/create-user`.

For agentic pipelines, it is a good idea to mix code generation for the fixed structure with clear placeholder replacements, and your LLM to fill the individual files with the actual implementation details.

> This minimizes the blast radius of errors and makes it easier to understand and maintain the code.

## Your Choices

You'll find `@todo: Discuss ...` throughout the blueprint. These are areas where you should discuss with your team and LLM how to implement the blueprint in your chosen language and framework, e.g. how to deal with concurrency, error handling, and security.

## Need Help?

The structure shown here might be unusual for many devs. No entities, no aggregates, no application or domain services, no ORM, you name it. That is expected. 

If you struggle with the blueprint, you can always ask for help on [GitHub Issues](https://github.com/proophboard/em-to-code-blueprint/issues).


## Code Generation CLI

The project includes a `codegen` command for generating new elements from the blueprint template.

### Installation

```bash
npm install
```

### Usage

```bash
npx app codegen <command> [arguments]
```

### Help

Get help for the codegen command:

```bash
npx app codegen --help
npx app codegen -h
```

Get help for a specific subcommand:

```bash
npx app codegen context --help
npx app codegen command --help
npx app codegen information --help
```

## CLI Playground

You can also execute commands and queries.

### Commands

#### `list`

List all available commands and queries grouped by context:

```bash
npx app list
```
For details on how to execute commands and queries, see the [CLI documentation](docs/cli.md).

## FAQ

### Where does the approach come from?

Originally developed for, and used for many years in the [Cody Engine](docs/background.md).

### Why are all functions split into `prepare` and `execute`?

[Functional Approach](docs/fucntional-approach.md)

### Why no entities?

Entities do exist in the data model - the `information` part, when you give an object an identifier. However, entities are not used to perform data changes. All changes go through `command -> handle() -> events -> apply() -> state` flows.

See [Functional Approach](docs/fucntional-approach.md) for details.

### Your question here?

Open a [GitHub Issue](https://github.com/proophboard/em-to-code-blueprint/issues).

## Todo

- [ ] Codegen remove commands
- [ ] Test Scenario Runner
- [ ] Frontend Guidance
- [ ] External Events
- [ ] Public context method to consume external events
- [ ] [spec-stream](https://github.com/proophboard/spec-stream) config
