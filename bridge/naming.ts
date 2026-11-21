// Naming helpers for the bridge module
// Converts between PascalCase (FQCN, context names) and kebab-case (folder names)

import type { AutomationType } from './model.js';

/**
 * Converts a PascalCase or mixed case string to kebab-case
 * e.g., "TaskManagement" -> "task-management"
 *       "AddTodo" -> "add-todo"
 *       "Crm.CreateUser" -> "crm-create-user"
 */
export function toKebab(name: string): string {
  // Insert hyphens before uppercase letters that follow lowercase letters
  const withHyphens = name.replace(/([a-z])([A-Z])/g, '$1-$2');
  // Also handle sequences of uppercase letters followed by lowercase
  // e.g., "JSONParser" -> "json-parser"
  const withDoubleHyphens = withHyphens.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  // Split on non-alphanumeric and convert to lowercase
  const parts = withDoubleHyphens.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.join('-').toLowerCase();
}

/**
 * Converts a free-text board name to PascalCase.
 *
 * Rules (per planning-rules.md):
 * - Split on non-alphanumeric characters (spaces, hyphens, underscores, dots …)
 * - Split on camelCase boundaries (lowercase→uppercase transitions), so
 *   "UserCreated" and "user-created" both yield "UserCreated".
 * - Capitalise the first character of each word; keep the rest as-is to
 *   preserve intentional caps inside a word (e.g. "TodoID" → "TodoID").
 * - Strip empty parts.
 *
 * Examples:
 *   "task-management"  → "TaskManagement"
 *   "Todo Management"  → "TodoManagement"
 *   "user-created"     → "UserCreated"
 *   "UserCreated"      → "UserCreated"   (camelCase boundary preserved)
 *   "TASK"             → "TASK"          (all-caps word kept as-is)
 *   "add todo"         → "AddTodo"
 */
export function toPascalCase(name: string): string {
  // 1. Insert a separator before every lowercase→uppercase transition so that
  //    "UserCreated" splits the same way as "user-created".
  const withBoundaries = name.replace(/([a-z])([A-Z])/g, '$1-$2');
  // 2. Split on any run of non-alphanumeric characters.
  const parts = withBoundaries.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  // 3. Capitalise first character of each part; leave the rest as-is.
  return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/**
 * Validates that a name matches the CLI pattern: ^[A-Z][a-zA-Z0-9]*$
 * Returns true if valid, false otherwise.
 */
export function isValidPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Builds a Fully Qualified Class Name (FQCN) from context and name
 * e.g., toFqcn("Crm", "CreateUser") -> "Crm.CreateUser"
 */
export function toFqcn(context: string, name: string): string {
  return `${context}.${name}`;
}

/**
 * Parses a FQCN into context and name parts
 * e.g., fromFqcn("Crm.CreateUser") -> { context: "Crm", name: "CreateUser" }
 *       fromFqcn("CreateUser") -> { context: "App", name: "CreateUser" }
 */
export function fromFqcn(fqcn: string): { context: string; name: string } {
  // Handle empty, dot-only, or whitespace-only inputs
  if (!fqcn || fqcn.trim() === '' || fqcn === '.') {
    return { context: 'App', name: '' };
  }

  const parts = fqcn.split('.');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { context: parts[0], name: parts[1] };
  }
  // If no context provided, use default "App" and the whole string as name
  return { context: 'App', name: fqcn };
}

/**
 * Normalizes a name by converting to PascalCase
 * Handles various input formats:
 * - "CreateUser" -> "CreateUser" (already PascalCase)
 * - "create-user" -> "CreateUser" (kebab-case)
 * - "Create user" -> "CreateUser" (space-separated)
 * - "CreateUserCmd" -> "CreateUserCmd" (mixed)
 */
export function normalizeName(name: string): string {
  // If already valid PascalCase, return as-is
  if (isValidPascalCase(name)) {
    return name;
  }
  // If it looks like FQCN, extract the name part
  const parts = name.split('.');
  if (parts.length > 1) {
    const namePart = parts[parts.length - 1];
    if (isValidPascalCase(namePart)) {
      return namePart;
    }
  }
  // Otherwise convert kebab-case to PascalCase (handles spaces too)
  return toPascalCase(name);
}

/**
 * Normalizes a context name
 * Handles various input formats:
 * - "Crm" -> "Crm" (already PascalCase)
 * - "crm" -> "Crm" (lowercase)
 * - "crm-user" -> "CrmUser" (kebab-case)
 */
export function normalizeContext(context: string): string {
  // If already valid PascalCase, return as-is
  if (isValidPascalCase(context)) {
    return context;
  }
  // Otherwise convert to PascalCase (handles spaces too)
  return toPascalCase(context);
}

/**
 * Gets the file path for a context folder
 * e.g., getContextPath("Crm") -> "src/domain/crm"
 */
export function getContextPath(context: string): string {
  const kebabContext = toKebab(context);
  return `src/domain/${kebabContext}`;
}

/**
 * Gets the file path for a command
 * e.g., getCommandPath("Crm", "CreateUser") -> "src/domain/crm/commands/create-user"
 */
export function getCommandPath(context: string, command: string): string {
  const kebabContext = toKebab(context);
  const kebabCommand = toKebab(command);
  return `src/domain/${kebabContext}/commands/${kebabCommand}`;
}

/**
 * Gets the file path for an event
 * e.g., getEventPath("Crm", "UserCreated") -> "src/domain/crm/events/user-created"
 */
export function getEventPath(context: string, event: string): string {
  const kebabContext = toKebab(context);
  const kebabEvent = toKebab(event);
  return `src/domain/${kebabContext}/events/${kebabEvent}`;
}

/**
 * Gets the file path for an information
 * e.g., getInformationPath("Crm", "UserList") -> "src/domain/crm/information/user-list"
 */
export function getInformationPath(context: string, information: string): string {
  const kebabContext = toKebab(context);
  const kebabInformation = toKebab(information);
  return `src/domain/${kebabContext}/information/${kebabInformation}`;
}

/**
 * Gets the registry file path for a type
 */
export function getRegistryFilePath(context: string, type: 'command' | 'event' | 'query' | 'job'): string {
  const kebabContext = toKebab(context);
  const fileName = type === 'query' ? 'queries' : type === 'job' ? 'job-automations' : `${type}s`;
  return `src/domain/${kebabContext}/${fileName}.ts`;
}

/**
 * Gets the folder name for automation (event or job)
 */
export function getAutomationFolder(automationType: AutomationType): string {
  return automationType === 'event' ? 'automations/events' : 'automations/jobs';
}

/**
 * Gets the file path for an automation
 * e.g., getAutomationPath("Crm", "SendNotification", "event") -> "src/domain/crm/automations/events/send-notification"
 */
export function getAutomationPath(context: string, automation: string, automationType: AutomationType): string {
  const kebabContext = toKebab(context);
  const kebabAutomation = toKebab(automation);
  const folder = getAutomationFolder(automationType);
  return `src/domain/${kebabContext}/${folder}/${kebabAutomation}`;
}

/**
 * Gets the file path for a projection case
 * e.g., getProjectionCasePath("Crm", "UserList", "UserCreated") -> "src/domain/crm/information/user-list/projection/user-created"
 */
export function getProjectionCasePath(context: string, information: string, event: string): string {
  const kebabContext = toKebab(context);
  const kebabInformation = toKebab(information);
  const kebabEvent = toKebab(event);
  return `src/domain/${kebabContext}/information/${kebabInformation}/projection/${kebabEvent}`;
}
