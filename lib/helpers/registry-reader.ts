import {readFileSync, readdirSync, existsSync} from 'fs';
import {basename, join} from 'path';

/**
 * Registry snapshot representing the current state of the domain registries.
 * Used by the planner to determine what already exists.
 */
export type RegistrySnapshot = {
  contexts: Set<string>;                      // PascalCase names that exist; derived from folder names (kebab -> compare via toKebab(name))
  commands: Set<string>;                      // "Ctx.Name"
  events: Set<string>;
  queries: Set<string>;
  informationFolders: Set<string>;            // "Ctx.Name" derived from folder name
  jobs: Map<string, { todoList: string }>;    // automation FQCN -> todoList
  eventApply: Map<string, Set<string>>;       // event FQCN -> information FQCNs
  eventAutomate: Map<string, Set<string>>;    // event FQCN -> automation FQCNs
};

/**
 * Converts a PascalCase name to kebab-case
 * Example: "TaskManagement" -> "task-management", "Crm" -> "crm"
 */
export function toKebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Reads the entire registry snapshot from a domain directory.
 * This includes all registry files and information folders.
 */
export function readRegistrySnapshot(domainPath: string): RegistrySnapshot {
  const snapshot: RegistrySnapshot = {
    contexts: new Set(),
    commands: new Set(),
    events: new Set(),
    queries: new Set(),
    informationFolders: new Set(),
    jobs: new Map(),
    eventApply: new Map(),
    eventAutomate: new Map()
  };

  if (!existsSync(domainPath)) {
    return snapshot;
  }

  // Read context folders (PascalCase)
  const contextFolders = getDirectoryEntries(domainPath);
  for (const folderName of contextFolders) {
    if (!folderName.startsWith('.')) {
      const pascalCaseName = toPascalCase(folderName);
      snapshot.contexts.add(pascalCaseName);

      const contextPath = join(domainPath, folderName);
      readContextRegistry(snapshot, contextPath, pascalCaseName);
    }
  }

  return snapshot;
}

/**
 * Reads registry files for a specific context
 */
function readContextRegistry(snapshot: RegistrySnapshot, contextPath: string, contextName: string): void {
  // Read commands.ts
  const commandsFile = join(contextPath, 'commands.ts');
  if (existsSync(commandsFile)) {
    const content = readFileSync(commandsFile, 'utf-8');
    const commandNames = parseRegistryKeys(content, 'commands');
    for (const name of commandNames) {
      snapshot.commands.add(name);
    }
  }

  // Read events.ts
  const eventsFile = join(contextPath, 'events.ts');
  if (existsSync(eventsFile)) {
    const content = readFileSync(eventsFile, 'utf-8');
    const eventNames = parseRegistryKeys(content, 'events');
    for (const name of eventNames) {
      snapshot.events.add(name);
    }

    // Also parse apply and automate mappings
    const registry = parseEventsRegistry(content);
    for (const [eventName, eventConfig] of Object.entries(registry)) {
      // Parse apply mappings (event -> information)
      const applySet = new Set<string>();
      for (const apply of eventConfig.apply) {
        applySet.add(apply.information);
      }
      if (applySet.size > 0) {
        snapshot.eventApply.set(eventName, applySet);
      }

      // Parse automate mappings (event -> automation)
      const automateSet = new Set<string>();
      for (const automate of eventConfig.automate) {
        automateSet.add(automate.automation);
      }
      if (automateSet.size > 0) {
        snapshot.eventAutomate.set(eventName, automateSet);
      }
    }
  }

  // Read queries.ts
  const queriesFile = join(contextPath, 'queries.ts');
  if (existsSync(queriesFile)) {
    const content = readFileSync(queriesFile, 'utf-8');
    const queryNames = parseRegistryKeys(content, 'queries');
    for (const name of queryNames) {
      snapshot.queries.add(name);
    }
  }

  // Read job-automations.ts
  const jobsFile = join(contextPath, 'job-automations.ts');
  if (existsSync(jobsFile)) {
    const content = readFileSync(jobsFile, 'utf-8');
    const jobs = parseJobAutomations(content);
    for (const jobName of jobs.keys()) {
      const jobConfig = jobs.get(jobName);
      if (jobConfig) {
        snapshot.jobs.set(jobName, jobConfig);
      }
    }
  }

  // Read information folders
  const informationPath = join(contextPath, 'information');
  if (existsSync(informationPath)) {
    const infoFolders = getDirectoryEntries(informationPath);
    for (const folderName of infoFolders) {
      if (!folderName.startsWith('.')) {
        const pascalCaseName = toPascalCase(folderName);
        snapshot.informationFolders.add(`${contextName}.${pascalCaseName}`);
      }
    }
  }
}

/**
 * Converts kebab-case to PascalCase
 * Example: "task-management" -> "TaskManagement", "crm" -> "Crm"
 */
function toPascalCase(kebab: string): string {
  return kebab.split('-').map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

/**
 * Reads all directory entries (folder names)
 */
function getDirectoryEntries(dirPath: string): string[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries.filter((dirent: any) => dirent.isDirectory()).map((dirent: any) => dirent.name);
  } catch {
    return [];
  }
}

/**
 * Parse a registry file and extract all keys (e.g., "Ctx.Name" from "Ctx.Name": {...})
 * Works with brace-aware parsing
 */
function parseRegistryKeys(content: string, exportName: string): string[] {
  try {
    // Extract the export content with brace tracking
    const exportMatch = extractExportObject(content, exportName);
    if (!exportMatch) {
      return [];
    }

    const objStr = exportMatch.trim();
    const keys: string[] = [];

    // Find all keys by tracking braces
    let i = 0;
    while (i < objStr.length) {
      // Find the next key (quoted or unquoted)
      const quoteStart = objStr.indexOf('"', i);
      const quoteStartSingle = objStr.indexOf("'", i);
      const keyStart = objStr.indexOf('[', i);

      // Determine which comes first
      let foundQuote = -1;
      let quoteChar = '"';

      if (quoteStart !== -1 && (foundQuote === -1 || quoteStart < foundQuote)) {
        foundQuote = quoteStart;
        quoteChar = '"';
      }
      if (quoteStartSingle !== -1 && (foundQuote === -1 || quoteStartSingle < foundQuote)) {
        foundQuote = quoteStartSingle;
        quoteChar = "'";
      }
      if (keyStart !== -1 && (foundQuote === -1 || keyStart < foundQuote)) {
        foundQuote = keyStart;
        quoteChar = '';
      }

      if (foundQuote === -1) break;

      // Extract the key name
      let keyEnd = -1;
      if (quoteChar === '"') {
        keyEnd = objStr.indexOf('"', foundQuote + 1);
      } else if (quoteChar === "'") {
        keyEnd = objStr.indexOf("'", foundQuote + 1);
      } else {
        // Bracket notation - find closing bracket
        keyEnd = objStr.indexOf(']', foundQuote);
        if (keyEnd !== -1) {
          // Skip whitespace and find colon
          let colonPos = objStr.indexOf(':', keyEnd + 1);
          if (colonPos !== -1) {
            i = colonPos + 1;
            continue;
          }
        }
      }

      if (keyEnd === -1) break;

      let keyName = objStr.substring(foundQuote + 1, keyEnd);
      if (quoteChar === '') {
        // Bracket notation, remove brackets
        keyName = keyName.replace(/["']/g, '');
      }

      // Validate key format (should contain at least one dot for Context.Name)
      if (keyName.includes('.')) {
        keys.push(keyName);
      }

      // Find the opening brace for this entry
      const openBrace = objStr.indexOf('{', keyEnd);
      if (openBrace === -1) break;

      // Find the matching closing brace
      let braceCount = 0;
      let closeBrace = -1;
      for (let j = openBrace; j < objStr.length; j++) {
        if (objStr[j] === '{') {
          braceCount++;
        } else if (objStr[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            closeBrace = j;
            break;
          }
        }
      }

      if (closeBrace === -1) break;

      // Move past this entry
      i = closeBrace + 1;
    }

    return keys;
  } catch (error) {
    return [];
  }
}

/**
 * Extracts the object content from an export statement with brace tracking
 */
function extractExportObject(content: string, exportName: string): string | null {
  // Match: export const <name>: Type = { ... }
  const regex = new RegExp(`export\\s+const\\s+${exportName}\\s*:\\s*\\w+\\s*=\\s*\\{`);
  const match = content.match(regex);

  if (!match) {
    return null;
  }

  const start = match.index! + match[0].length; // Start after the opening brace
  let braceCount = 1; // Start counting with 1 because we're inside the outer object
  let i = start;

  // Find matching closing brace
  while (i < content.length) {
    if (content[i] === '{') {
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        return content.substring(start, i).trim();
      }
    }
    i++;
  }

  return null;
}

/**
 * Parse events.ts file content into an EventRegistryModel object
 * Reuses the parsing logic from event-registry.ts
 */
type ApplyMappingModel = {
  information: string;
  inline: boolean;
  addsTodoJob: boolean;
  prepare: string;
  exec: string;
};

type AutomationMappingModel = {
  automation: string;
  inline: boolean;
  prepare: string;
  exec: string;
};

type EventRegistryModel = {
  [eventName: string]: {
    apply: ApplyMappingModel[];
    automate: AutomationMappingModel[];
  };
};

function parseEventsRegistry(content: string): EventRegistryModel {
  try {
    // Extract the events object content
    const match = content.match(/export const events:\s*EventRegistry\s*=\s*({[\s\S]*});?\s*$/m);
    if (!match) {
      return {};
    }

    const objStr = match[1].trim();
    const registry: EventRegistryModel = {};

    // Find all event entries by tracking braces
    let i = 0;
    while (i < objStr.length) {
      // Find the next event name
      const eventStart = objStr.indexOf('"', i);
      if (eventStart === -1) break;

      // Find the event name after the quote
      const eventQuoteEnd = objStr.indexOf('"', eventStart + 1);
      if (eventQuoteEnd === -1) break;

      const eventName = objStr.substring(eventStart + 1, eventQuoteEnd);

      // Find the opening brace of this event entry
      const openBrace = objStr.indexOf('{', eventQuoteEnd);
      if (openBrace === -1) break;

      // Find the matching closing brace by counting braces
      let braceCount = 0;
      let closeBrace = -1;
      for (let j = openBrace; j < objStr.length; j++) {
        if (objStr[j] === '{') {
          braceCount++;
        } else if (objStr[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            closeBrace = j;
            break;
          }
        }
      }

      if (closeBrace === -1) break;

      // Extract the event content between braces
      const eventContent = objStr.substring(openBrace + 1, closeBrace);

      // Parse apply and automate arrays
      const applyArray = parseApplyArray(eventContent);
      const automateArray = parseAutomateArray(eventContent);

      registry[eventName] = {
        apply: applyArray,
        automate: automateArray
      };

      // Move past this event entry
      i = closeBrace + 1;
    }

    return registry;
  } catch (error) {
    return {};
  }
}

function parseApplyArray(content: string): ApplyMappingModel[] {
  const match = content.match(/apply:\s*\[\s*([\s\S]*?)\s*\]/);
  if (!match) return [];

  const arrayContent = match[1];
  const entries: ApplyMappingModel[] = [];

  // Parse each entry in the apply array - find entries by tracking braces
  let i = 0;
  while (i < arrayContent.length) {
    // Find the start of an object
    const objStart = arrayContent.indexOf('{', i);
    if (objStart === -1) break;

    // Find the matching closing brace
    let braceCount = 0;
    let closeBrace = -1;
    for (let j = objStart; j < arrayContent.length; j++) {
      if (arrayContent[j] === '{') {
        braceCount++;
      } else if (arrayContent[j] === '}') {
        braceCount--;
        if (braceCount === 0) {
          closeBrace = j;
          break;
        }
      }
    }

    if (closeBrace === -1) break;

    const entryContent = arrayContent.substring(objStart + 1, closeBrace);
    const applyEntry: ApplyMappingModel = {
      information: extractStringValue(entryContent, 'information'),
      inline: extractBooleanValue(entryContent, 'inline', true),
      addsTodoJob: extractBooleanValue(entryContent, 'addsTodoJob', false),
      prepare: extractStringValue(entryContent, 'prepare'),
      exec: extractStringValue(entryContent, 'exec')
    };
    entries.push(applyEntry);

    // Move past this entry
    i = closeBrace + 1;
  }

  return entries;
}

function parseAutomateArray(content: string): AutomationMappingModel[] {
  const match = content.match(/automate:\s*\[\s*([\s\S]*?)\s*\]/);
  if (!match) return [];

  const arrayContent = match[1];
  const entries: AutomationMappingModel[] = [];

  // Parse each entry in the automate array - find entries by tracking braces
  let i = 0;
  while (i < arrayContent.length) {
    // Find the start of an object
    const objStart = arrayContent.indexOf('{', i);
    if (objStart === -1) break;

    // Find the matching closing brace
    let braceCount = 0;
    let closeBrace = -1;
    for (let j = objStart; j < arrayContent.length; j++) {
      if (arrayContent[j] === '{') {
        braceCount++;
      } else if (arrayContent[j] === '}') {
        braceCount--;
        if (braceCount === 0) {
          closeBrace = j;
          break;
        }
      }
    }

    if (closeBrace === -1) break;

    const entryContent = arrayContent.substring(objStart + 1, closeBrace);
    const automateEntry: AutomationMappingModel = {
      automation: extractStringValue(entryContent, 'automation'),
      inline: extractBooleanValue(entryContent, 'inline', true),
      prepare: extractStringValue(entryContent, 'prepare'),
      exec: extractStringValue(entryContent, 'exec')
    };
    entries.push(automateEntry);

    // Move past this entry
    i = closeBrace + 1;
  }

  return entries;
}

function extractStringValue(objStr: string, key: string): string {
  // Keys may be quoted ("key":) or unquoted (key:) in TypeScript object literals
  const keyPattern = `(?:"${key}"|${key})\\s*:`;

  // Try matching quoted/single-quoted string values first: key: "value" or key: 'value'
  const quotedRegex = new RegExp(`${keyPattern}\\s*["']([^"']+)["']`);
  const quotedMatch = objStr.match(quotedRegex);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  // Try matching function names: key: FunctionName (unquoted identifier)
  const identifierRegex = new RegExp(`${keyPattern}\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)`);
  const identifierMatch = objStr.match(identifierRegex);
  if (identifierMatch) {
    return identifierMatch[1];
  }

  return '';
}

function extractBooleanValue(objStr: string, key: string, defaultValue: boolean): boolean {
  // Keys may be quoted ("key":) or unquoted (key:) in TypeScript object literals
  const regex = new RegExp(`(?:"${key}"|${key})\\s*:\\s*(true|false)`);
  const match = objStr.match(regex);
  if (match) {
    return match[1] === 'true';
  }
  return defaultValue;
}

/**
 * Parse job-automations.ts file and extract job definitions
 */
export function parseJobAutomations(content: string): Map<string, { todoList: string }> {
  const jobs = new Map<string, { todoList: string }>();

  try {
    // Extract the jobs object content using brace-aware parsing
    const objStr = extractExportObject(content, 'jobs');
    if (!objStr) {
      return jobs;
    }

    // Find all job entries by tracking braces
    let i = 0;
    while (i < objStr.length) {
      // Find the next job name
      const jobStart = objStr.indexOf('"', i);
      if (jobStart === -1) break;

      // Find the job name after the quote
      const jobQuoteEnd = objStr.indexOf('"', jobStart + 1);
      if (jobQuoteEnd === -1) break;

      const jobName = objStr.substring(jobStart + 1, jobQuoteEnd);

      // Find the opening brace of this job entry
      const openBrace = objStr.indexOf('{', jobQuoteEnd);
      if (openBrace === -1) break;

      // Find the matching closing brace by counting braces
      let braceCount = 0;
      let closeBrace = -1;
      for (let j = openBrace; j < objStr.length; j++) {
        if (objStr[j] === '{') {
          braceCount++;
        } else if (objStr[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            closeBrace = j;
            break;
          }
        }
      }

      if (closeBrace === -1) break;

      // Extract the job content between braces
      const jobContent = objStr.substring(openBrace + 1, closeBrace);

      // Parse todoList value
      const todoList = extractStringValue(jobContent, 'todoList');

      if (todoList) {
        jobs.set(jobName, { todoList });
      }

      // Move past this job entry
      i = closeBrace + 1;
    }
  } catch (error) {
    // Return empty map on error
  }

  return jobs;
}
