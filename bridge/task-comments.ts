// Task comment templates for the bridge module
// Generates comments for implementation agents based on action types

import type { Action, BoardElement } from './model.js';

/**
 * The product owner's wording for known elements (typo fixed: "necessary" not "neccessary")
 */
export const KNOWN_ELEMENT_SENTENCE =
  'Element is known in the app. Compare the information in the Event Model with the implementation and make necessary changes to the implementation when needed.';

/**
 * Shared "where to look" block appended to every generated-code comment
 */
export const WHERE_TO_LOOK_BLOCK = `Before implementing:
- Read this element's description and details on prooph board.
- Check the element's play type and play function.
- If needed, look at the other elements of this slice, the chapter, and the chapter scenarios.
Board reference: chapter {chapterName} ({chapterId}), slice {sliceLabel} ({sliceId}), element {elementId}.
When done, resolve this task.`;

/**
 * Builds a task comment for an action
 * @param action - The action to generate a comment for
 * @param ctx - Context information (element, chapter, slice)
 * @returns The complete comment text
 */
export function buildComment(action: Action, ctx: { element: BoardElement; chapterName: string; sliceLabel: string }): string {
  const { element, chapterName, sliceLabel } = ctx;
  const { sliceId, id: elementId } = element;

  let text = '';

  switch (action.kind) {
    case 'known':
      text = buildKnownComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'command':
      text = buildCommandComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'event':
      text = buildEventComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'information':
      text = buildInformationComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'prjcase':
      text = buildPrjcaseComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'on':
      text = buildOnComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'job':
      text = buildJobComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'blocked':
      text = buildBlockedComment(action, chapterName, sliceLabel, sliceId, elementId);
      break;
    case 'context':
      // Context actions don't get task comments (the first element in a new context does)
      text = '';
      break;
  }

  return text;
}

/**
 * Builds a comment for known elements
 */
export function buildKnownComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { key, files, registryFile } = action;
  const fqcn = key.split(':')[1]; // Extract FQCN from "known:FQCN"

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : '- No files generated (element already exists)';

  const registryBlock = registryFile ? `\nRegistered in: ${registryFile}` : '';

  return buildCommentText(
    `known:${fqcn}`,
    `${KNOWN_ELEMENT_SENTENCE}\n\nImplementation:\n${fileBlock}${registryBlock}`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for new commands
 */
export function buildCommandComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { context, command, files, registryFile } = action;
  const fqcn = context && command ? `${context}.${command}` : '';
  const ctxKebab = context ? toKebab(context) : '';
  const cmdKebab = command ? toKebab(command) : '';

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : `- src/domain/${ctxKebab}/commands/${cmdKebab}/payload.ts: payload type\n` +
      `- .../prepare.ts: load/prepare state\n` +
      `- .../handle.ts: decision logic, returns events\n` +
      `- .../state.ts: state needed for the decision`;

  const contextNote = action.context ? `\nContext ${action.context} was created (src/domain/${ctxKebab}). Review its services.ts and index.ts.` : '';

  return buildCommentText(
    `command:${fqcn}`,
    `Boilerplate for command ${fqcn} was generated with \`npx app codegen command ${context} ${command}\`.\n` +
    `Finalize it:\n${fileBlock}\nRegistered in src/domain/${ctxKebab}/commands.ts.${contextNote}`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for new events
 */
export function buildEventComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { context, command, event, files, registryFile } = action;
  const fqcn = context && event ? `${context}.${event}` : '';
  const ctxKebab = context ? toKebab(context) : '';
  const cmdKebab = command ? toKebab(command) : '';

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : `- src/domain/${ctxKebab}/commands/${cmdKebab}/events/${toKebab(event!)}.ts: event payload type\n` +
      `- make command ${context}.${command} return this event where appropriate`;

  return buildCommentText(
    `event:${fqcn}`,
    `Boilerplate for event ${fqcn} was generated with \`npx app codegen event ${context} ${command} ${event}\` (emitted by command ${context}.${command}).\n` +
    `Finalize it:\n${fileBlock}\nRegistered in src/domain/${ctxKebab}/events.ts.`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for new information
 */
export function buildInformationComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { context, information, files, registryFile } = action;
  const fqcn = context && information ? `${context}.${information}` : '';
  const ctxKebab = context ? toKebab(context) : '';
  const infoKebab = information ? toKebab(information) : '';

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : `- src/domain/${ctxKebab}/information/${infoKebab}/${infoKebab}.ts: information type\n` +
      `- .../query.ts and resolve.ts: query payload and resolution\n` +
      `- .../projection/: filled by projection cases (see separate tasks)`;

  return buildCommentText(
    `information:${fqcn}`,
    `Boilerplate for information ${fqcn} was generated with \`npx app codegen information ${context} ${information}\`.\n` +
    `Finalize it:\n${fileBlock}\nRegistered in src/domain/${ctxKebab}/queries.ts.`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for projection cases
 */
export function buildPrjcaseComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { context, information, event, files, registryFile } = action;
  const infoFqcn = context && information ? `${context}.${information}` : '';
  const evtFqcn = context && event ? `${context}.${event}` : '';
  const ctxKebab = context ? toKebab(context) : '';
  const infoKebab = information ? toKebab(information) : '';
  const evtKebab = event ? toKebab(event) : '';

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : `- src/domain/${ctxKebab}/information/${infoKebab}/projection/${evtKebab}/apply.ts: update the information from the event\n` +
      `- .../prepare.ts, .../state.ts: what state apply needs`;

  return buildCommentText(
    `prjcase:${infoFqcn}<-${evtFqcn}`,
    `Projection case for event ${evtFqcn} was generated with \`npx app codegen prjcase ${context} ${information} ${event}\`.\n` +
    `Finalize it:\n${fileBlock}\nDefaults: inline projection, no todo job. Decide whether it should run async (\`--async\`) or add a todo job (\`--adds-todo\`); regenerate or edit the registration in src/domain/${ctxKebab}/events.ts accordingly.`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for event automations (on)
 */
export function buildOnComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { context, automation, event, files, registryFile } = action;
  const autoFqcn = context && automation ? `${context}.${automation}` : '';
  const evtFqcn = context && event ? `${context}.${event}` : '';
  const ctxKebab = context ? toKebab(context) : '';
  const autoKebab = automation ? toKebab(automation) : '';
  const evtKebab = event ? toKebab(event) : '';

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : `- src/domain/${ctxKebab}/automations/events/${autoKebab}/on.ts: what to do on the event (typically dispatch a command)\n` +
      `- .../prepare.ts, .../state.ts`;

  return buildCommentText(
    `on:${autoFqcn}<-${evtFqcn}`,
    `Event automation ${autoFqcn} reacting to event ${evtFqcn} was generated with \`npx app codegen on ${context} ${event} ${automation}\`.\n` +
    `Finalize it:\n${fileBlock}\nRegistered in src/domain/${ctxKebab}/events.ts (inline by default; decide on \`--async\`).`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for job automations
 */
export function buildJobComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { context, automation, information, files, registryFile } = action;
  const autoFqcn = context && automation ? `${context}.${automation}` : '';
  const infoFqcn = context && information ? `${context}.${information}` : '';
  const ctxKebab = context ? toKebab(context) : '';
  const autoKebab = automation ? toKebab(automation) : '';
  const infoKebab = information ? toKebab(information) : '';

  const fileBlock = files && files.length > 0
    ? files.map(f => `- ${f}`).join('\n')
    : `- src/domain/${ctxKebab}/automations/jobs/${autoKebab}/process.ts: process one todo item\n` +
      `- .../prepare.ts, .../state.ts`;

  return buildCommentText(
    `job:${autoFqcn}<-${infoFqcn}`,
    `Job automation ${autoFqcn} working off todo list ${infoFqcn} was generated with \`npx app codegen job ${context} ${information} ${automation}\`.\n` +
    `Finalize it:\n${fileBlock}\nRegistered in src/domain/${ctxKebab}/job-automations.ts.\nThe projection that fills the todo list must set addsTodoJob (see the information's projection cases).`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds a comment for blocked actions
 */
export function buildBlockedComment(
  action: Action,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const { key, reason, hint } = action;
  const name = key ? key.split(':')[1] : 'this element';

  const reasonText = reason || 'an unknown error occurred';
  const hintText = hint ? `\nDecide how to proceed: ${hint}` : '';

  return buildCommentText(
    `blocked:${name}`,
    `The bridge did not generate code for this element: ${reasonText}.${hintText}`,
    chapterName,
    sliceLabel,
    sliceId,
    elementId
  );
}

/**
 * Builds the complete comment text with marker and where-to-look block
 */
function buildCommentText(
  marker: string,
  mainContent: string,
  chapterName: string,
  sliceLabel: string,
  sliceId: string,
  elementId: string
): string {
  const whereToLook = WHERE_TO_LOOK_BLOCK
    .replace('{chapterName}', chapterName)
    .replace('{chapterId}', '...') // Will be filled by caller
    .replace('{sliceLabel}', sliceLabel)
    .replace('{sliceId}', sliceId)
    .replace('{elementId}', elementId);

  // Replace placeholder chapterId if passed in mainContent (not currently used)
  const fullContent = mainContent.replace('{chapterId}', '...');

  return `[em-to-code-blueprint:${marker}]\n\n${fullContent}\n\n${whereToLook}`;
}

/**
 * Converts a PascalCase string to kebab-case for path generation
 */
function toKebab(name: string): string {
  // Insert hyphens before uppercase letters that follow lowercase letters
  const withHyphens = name.replace(/([a-z])([A-Z])/g, '$1-$2');
  // Also handle sequences of uppercase letters followed by lowercase
  const withDoubleHyphens = withHyphens.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  // Split on non-alphanumeric and convert to lowercase
  const parts = withDoubleHyphens.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.join('-').toLowerCase();
}
