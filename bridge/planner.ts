import {
  RegistrySnapshot,
  BoardElement,
  DependencyGraph,
  Plan,
  Action,
  ActionKind,
  Note,
  DependencyNode
} from './model.js';
import { toPascalCase } from './naming.js';

/**
 * Plan input for the planner
 */
export type PlanInput = {
  slice: {id: string; chapterId: string};
  elements: BoardElement[];
  graphs: Map<string /*elementId*/, DependencyGraph>;
  registry: RegistrySnapshot;
};

/**
 * Main planner function - pure, deterministic
 * Implements rules R1-R10 from planning-rules.md
 */
export function plan(input: PlanInput): Plan {
  const {slice, elements, graphs, registry} = input;

  const actions: Action[] = [];
  const notes: Note[] = [];
  const seenKeys = new Set<string>();

  // R10: Skip elements whose graph call failed (no graph entry)
  // These will still be processed by R2/R4 but links are skipped

  // Sort elements by index (API order) for stable output
  const sortedElements = [...elements].sort((a, b) => a.index - b.index);

  for (const element of sortedElements) {
    // R1: Element relevance - only command | event | information | automation
    if (!isRelevantType(element.type)) {
      continue;
    }

    const fqcn = toFqcn(element.context || 'App', element.name);
    const contextPascal = toPascalCase(element.context || 'App');
    const namePascal = toPascalCase(element.name);

    // R10: If graph failed, skip links but process element itself
    const graph = graphs.get(element.id);

    // R2: Registered vs new
    const isRegistered = isElementRegistered(element, registry);

    if (isRegistered) {
      // Emit 'known' action for elements in this slice (R9)
      if (element.chapterId === slice.chapterId) {
        const key = `known:${fqcn}`;
        if (!seenKeys.has(key)) {
          actions.push({
            kind: 'known',
            key,
            context: contextPascal,
            name: namePascal
          });
          seenKeys.add(key);
        }
      }
      continue;
    }

    // R3: Context first - check if context exists
    const contextAction = ensureContext(actions, seenKeys, contextPascal, registry);
    if (contextAction) {
      actions.push(contextAction);
      seenKeys.add(contextAction.key);
    }

    // R4: Generate for new elements based on type
    const elementActions = generateForElement(element, graph, registry, slice.chapterId);
    for (const elemAction of elementActions) {
      if (!seenKeys.has(elemAction.key)) {
        actions.push(elemAction);
        seenKeys.add(elemAction.key);
      }
    }

    // R5-R7: Process links (event->information, event->automation, information->automation)
    if (graph) {
      const linkActions = generateForLinks(graph, registry, slice.chapterId);
      for (const linkAction of linkActions) {
        if (!seenKeys.has(linkAction.key)) {
          actions.push(linkAction);
          seenKeys.add(linkAction.key);
        }
      }
    }
  }

  // R8: Order and deduplicate
  const orderedActions = orderActions(actions);

  return {actions: orderedActions, notes};
}

/**
 * Check if element type is relevant (R1)
 */
function isRelevantType(type: string): type is 'command' | 'event' | 'information' | 'automation' {
  return ['command', 'event', 'information', 'automation'].includes(type);
}

/**
 * Check if element is registered (R2)
 */
function isElementRegistered(element: BoardElement, registry: RegistrySnapshot): boolean {
  const fqcn = toFqcn(element.context || 'App', element.name);

  switch (element.type) {
    case 'command':
      return registry.commands.has(fqcn);
    case 'event':
      return registry.events.has(fqcn);
    case 'information':
      return registry.informationFolders.has(fqcn);
    case 'automation':
      // Automation can be registered as job or event automation
      if (registry.jobs.has(fqcn)) {
        return true;
      }
      // Check if registered as event automation
      for (const [eventFqcn, automateSet] of registry.eventAutomate) {
        if (automateSet.has(fqcn)) {
          return true;
        }
      }
      return false;
  }
}

/**
 * Generate actions for a new element (R4)
 */
function generateForElement(
  element: BoardElement,
  graph: DependencyGraph | undefined,
  registry: RegistrySnapshot,
  currentChapterId: string
): Action[] {
  const actions: Action[] = [];
  const contextPascal = toPascalCase(element.context || 'App');
  const namePascal = toPascalCase(element.name);
  const fqcn = toFqcn(contextPascal, namePascal);

  switch (element.type) {
    case 'command':
      actions.push({
        kind: 'command',
        key: `command:${fqcn}`,
        context: contextPascal,
        name: namePascal
      });
      break;

    case 'event':
      // R4: Event needs its command
      const commandSource = findCommandSource(graph, registry, currentChapterId);
      if (commandSource) {
        if (commandSource.chapterId === currentChapterId) {
          // Command in same chapter
          const cmdFqcn = toFqcn(commandSource.context, commandSource.name);
          const cmdContextPascal = toPascalCase(commandSource.context);
          const cmdNamePascal = toPascalCase(commandSource.name);

          // Check if command is already registered
          if (!registry.commands.has(cmdFqcn)) {
            actions.push({
              kind: 'command',
              key: `command:${cmdFqcn}`,
              context: cmdContextPascal,
              name: cmdNamePascal
            });
          }

          actions.push({
            kind: 'event',
            key: `event:${fqcn}`,
            context: contextPascal,
            name: namePascal,
            targetType: 'command',
            targetName: cmdNamePascal,
            eventFqcn: fqcn
          });
        } else {
          // Command in different chapter
          actions.push({
            kind: 'blocked',
            key: `blocked:${fqcn}`,
            context: contextPascal,
            name: namePascal,
            reason: 'command is in another chapter, which codegen does not support',
            hint: 'Add the command to the Event Model or implement the external event manually'
          });
        }
      } else {
        // No command source found
        actions.push({
          kind: 'blocked',
          key: `blocked:${fqcn}`,
          context: contextPascal,
          name: namePascal,
          reason: 'no command source in the Event Model',
          hint: 'Add the command to the Event Model'
        });
      }
      break;

    case 'information':
      actions.push({
        kind: 'information',
        key: `information:${fqcn}`,
        context: contextPascal,
        name: namePascal
      });
      break;

    case 'automation':
      // R4: Automation without sources -> blocked
      if (!graph || (graph.sources.length === 0 && graph.targets.length === 0)) {
        actions.push({
          kind: 'blocked',
          key: `blocked:${fqcn}`,
          context: contextPascal,
          name: namePascal,
          reason: 'cannot tell event automation from job automation; needs a human/agent',
          hint: 'Add at least one event or information source to the automation in the Event Model'
        });
      }
      // Links are handled by generateForLinks
      break;
  }

  return actions;
}

/**
 * Find command source for an event
 */
function findCommandSource(
  graph: DependencyGraph | undefined,
  registry: RegistrySnapshot,
  currentChapterId: string
): DependencyNode | null {
  if (!graph) return null;

  // Prefer command in same slice/chapter
  for (const source of graph.sources) {
    if (source.type === 'command' && source.chapterId === currentChapterId) {
      return source;
    }
  }

  // Fall back to first in graph order
  for (const source of graph.sources) {
    if (source.type === 'command') {
      return source;
    }
  }

  return null;
}

/**
 * Generate actions for dependency links (R5-R7)
 */
function generateForLinks(
  graph: DependencyGraph,
  registry: RegistrySnapshot,
  currentChapterId: string
): Action[] {
  const actions: Action[] = [];
  const contextPascal = toPascalCase(graph.element.context);

  // R5: Event -> Information (projection case)
  // Check both directions
  for (const target of graph.targets) {
    if (target.type === 'information') {
      const newActions = createPrjCaseAction(graph, target, registry, currentChapterId, contextPascal);
      actions.push(...newActions);
    }
  }

  for (const source of graph.sources) {
    if (source.type === 'event') {
      const newActions = createPrjCaseAction(source, graph, registry, currentChapterId, contextPascal);
      actions.push(...newActions);
    }
  }

  // R6: Event -> Automation (event automation)
  if (graph.element.type === 'event') {
    for (const target of graph.targets) {
      if (target.type === 'automation') {
        const action = createOnAction(graph, target, registry, currentChapterId, contextPascal);
        if (action) {
          actions.push(action);
        }
      }
    }

    for (const source of graph.sources) {
      if (source.type === 'automation') {
        const action = createOnAction(source, graph, registry, currentChapterId, contextPascal);
        if (action) {
          actions.push(action);
        }
      }
    }
  }

  // R7: Information -> Automation (job automation)
  if (graph.element.type === 'information') {
    for (const target of graph.targets) {
      if (target.type === 'automation') {
        const action = createJobAction(graph, target, registry, currentChapterId, contextPascal);
        if (action) {
          actions.push(action);
        }
      }
    }

    for (const source of graph.sources) {
      if (source.type === 'automation') {
        const action = createJobAction(source, graph, registry, currentChapterId, contextPascal);
        if (action) {
          actions.push(action);
        }
      }
    }
  }

  return actions;
}

/**
 * Create prjcase action(s) (R5).
 *
 * Returns an array because the information counterpart may not be registered
 * yet (it lives in another slice). In that case an `information` action is
 * prepended so codegen can satisfy it before the prjcase.
 */
function createPrjCaseAction(
  eventSource: DependencyNode | DependencyGraph,
  infoTarget: DependencyNode | DependencyGraph,
  registry: RegistrySnapshot,
  currentChapterId: string,
  contextPascal: string
): Action[] {
  // Get event and info FQCNs
  let eventFqcn = '';
  let infoFqcn = '';
  let eventContextPascal = '';
  let infoContextPascal = '';

  if ('element' in eventSource) {
    // eventSource is a DependencyGraph (event)
    eventFqcn = toFqcn(eventSource.element.context, eventSource.element.name);
    eventContextPascal = toPascalCase(eventSource.element.context);
  } else {
    // eventSource is a DependencyNode
    eventFqcn = toFqcn((eventSource as DependencyNode).context, (eventSource as DependencyNode).name);
    eventContextPascal = toPascalCase((eventSource as DependencyNode).context);
  }

  if ('element' in infoTarget) {
    // infoTarget is a DependencyGraph (information)
    infoFqcn = toFqcn(infoTarget.element.context, infoTarget.element.name);
    infoContextPascal = toPascalCase(infoTarget.element.context);
  } else {
    // infoTarget is a DependencyNode
    infoFqcn = toFqcn((infoTarget as DependencyNode).context, (infoTarget as DependencyNode).name);
    infoContextPascal = toPascalCase((infoTarget as DependencyNode).context);
  }

  // Same context requirement
  if (eventContextPascal !== infoContextPascal) {
    // Blocked on the information element
    return [{
      kind: 'blocked',
      key: `blocked:${infoFqcn}`,
      context: infoContextPascal,
      name: infoFqcn.split('.')[1],
      reason: 'event and information must be in the same context',
      hint: 'Move the information to the same context as the event'
    }];
  }

  // Check if projection case already exists
  const existingApply = registry.eventApply.get(eventFqcn);
  if (existingApply && existingApply.has(infoFqcn)) {
    return []; // Already exists, skip
  }

  const result: Action[] = [];

  // R5 prerequisite: ensure the information itself is generated first when
  // it is a graph counterpart not yet in the registry (Q3: generate what the
  // link needs even if the counterpart slice is not planned yet).
  const infoName = infoFqcn.split('.')[1];
  if (
    !registry.informationFolders.has(infoFqcn) &&
    !registry.queries.has(infoFqcn)
  ) {
    result.push({
      kind: 'information',
      key: `information:${infoFqcn}`,
      context: infoContextPascal,
      name: infoName,
    });
  }

  result.push({
    kind: 'prjcase',
    key: `prjcase:${infoFqcn}<-${eventFqcn}`,
    context: contextPascal,
    name: infoName,
    targetType: 'event',
    targetName: eventFqcn.split('.')[1],
    eventFqcn,
    infoFqcn
  });

  return result;
}

/**
 * Create on action (R6)
 */
function createOnAction(
  eventSource: DependencyNode | DependencyGraph,
  autoTarget: DependencyNode | DependencyGraph,
  registry: RegistrySnapshot,
  currentChapterId: string,
  contextPascal: string
): Action | null {
  let eventFqcn = '';
  let autoFqcn = '';
  let eventContextPascal = '';
  let autoContextPascal = '';

  if ('element' in eventSource) {
    eventFqcn = toFqcn(eventSource.element.context, eventSource.element.name);
    eventContextPascal = toPascalCase(eventSource.element.context);
  } else {
    eventFqcn = toFqcn((eventSource as DependencyNode).context, (eventSource as DependencyNode).name);
    eventContextPascal = toPascalCase((eventSource as DependencyNode).context);
  }

  if ('element' in autoTarget) {
    autoFqcn = toFqcn(autoTarget.element.context, autoTarget.element.name);
    autoContextPascal = toPascalCase(autoTarget.element.context);
  } else {
    autoFqcn = toFqcn((autoTarget as DependencyNode).context, (autoTarget as DependencyNode).name);
    autoContextPascal = toPascalCase((autoTarget as DependencyNode).context);
  }

  // Same context requirement
  if (eventContextPascal !== autoContextPascal) {
    return {
      kind: 'blocked',
      key: `blocked:${autoFqcn}`,
      context: autoContextPascal,
      name: autoFqcn.split('.')[1],
      reason: 'event and automation must be in the same context',
      hint: 'Move the automation to the same context as the event'
    };
  }

  // Check if already registered as event automation
  const existingAutomate = registry.eventAutomate.get(eventFqcn);
  if (existingAutomate && existingAutomate.has(autoFqcn)) {
    return null; // Already exists
  }

  // Check if already registered as job (automation without event source)
  if (registry.jobs.has(autoFqcn)) {
    return null;
  }

  return {
    kind: 'on',
    key: `on:${autoFqcn}<-${eventFqcn}`,
    context: contextPascal,
    name: autoFqcn.split('.')[1],
    targetType: 'event',
    targetName: eventFqcn.split('.')[1],
    eventFqcn,
    autoFqcn
  };
}

/**
 * Create job action (R7)
 */
function createJobAction(
  infoSource: DependencyNode | DependencyGraph,
  autoTarget: DependencyNode | DependencyGraph,
  registry: RegistrySnapshot,
  currentChapterId: string,
  contextPascal: string
): Action | null {
  let infoFqcn = '';
  let autoFqcn = '';
  let infoContextPascal = '';
  let autoContextPascal = '';

  if ('element' in infoSource) {
    infoFqcn = toFqcn(infoSource.element.context, infoSource.element.name);
    infoContextPascal = toPascalCase(infoSource.element.context);
  } else {
    infoFqcn = toFqcn((infoSource as DependencyNode).context, (infoSource as DependencyNode).name);
    infoContextPascal = toPascalCase((infoSource as DependencyNode).context);
  }

  if ('element' in autoTarget) {
    autoFqcn = toFqcn(autoTarget.element.context, autoTarget.element.name);
    autoContextPascal = toPascalCase(autoTarget.element.context);
  } else {
    autoFqcn = toFqcn((autoTarget as DependencyNode).context, (autoTarget as DependencyNode).name);
    autoContextPascal = toPascalCase((autoTarget as DependencyNode).context);
  }

  // Same context requirement
  if (infoContextPascal !== autoContextPascal) {
    return {
      kind: 'blocked',
      key: `blocked:${autoFqcn}`,
      context: autoContextPascal,
      name: autoFqcn.split('.')[1],
      reason: 'information and automation must be in the same context',
      hint: 'Move the automation to the same context as the information'
    };
  }

  // Check if already registered as job
  if (registry.jobs.has(autoFqcn)) {
    return null;
  }

  return {
    kind: 'job',
    key: `job:${autoFqcn}<-${infoFqcn}`,
    context: contextPascal,
    name: autoFqcn.split('.')[1],
    targetType: 'information',
    targetName: infoFqcn.split('.')[1],
    infoFqcn,
    autoFqcn
  };
}

/**
 * Ensure context exists (R3)
 */
function ensureContext(
  actions: Action[],
  seenKeys: Set<string>,
  contextPascal: string,
  registry: RegistrySnapshot
): Action | null {
  if (registry.contexts.has(contextPascal)) {
    return null;
  }

  // Also check if we've already added a context action for this context
  const contextKey = `context:${contextPascal}`;
  if (seenKeys.has(contextKey)) {
    return null;
  }

  return {
    kind: 'context',
    key: contextKey,
    context: contextPascal
  };
}

/**
 * Order actions by phase (R8)
 */
function orderActions(actions: Action[]): Action[] {
  const phaseOrder: Record<ActionKind, number> = {
    context: 0,
    command: 1,
    event: 2,
    information: 3,
    prjcase: 4,
    on: 5,
    job: 6,
    known: 7,
    blocked: 8
  };

  return actions.sort((a, b) => {
    // First by phase
    const phaseDiff = phaseOrder[a.kind] - phaseOrder[b.kind];
    if (phaseDiff !== 0) return phaseDiff;

    // Then by key for stable ordering
    return a.key.localeCompare(b.key);
  });
}

/**
 * Convert context and name to FQCN
 */
function toFqcn(context: string, name: string): string {
  return `${toPascalCase(context)}.${toPascalCase(name)}`;
}
