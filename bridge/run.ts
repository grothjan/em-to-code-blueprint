/**
 * Orchestration: load slice elements, fetch dependency graphs, plan, execute.
 *
 * This module is the pure-ish orchestration layer: all I/O is behind interfaces
 * injected via `RunDeps`. `index.ts` wires real implementations; tests swap fakes.
 *
 * Flow:
 *   1. GET chapter slice  -> elements
 *   2. GET dependency graph per event / information / automation
 *   3. plan(elements, graphs, registry)  -> Plan
 *   4. execute(plan, elements, deps)     -> ExecuteResult
 */

import type {
  BoardElement,
  BridgeDeps,
  DependencyGraph,
  Invocation,
  Logger,
} from './model.js';
import { plan } from './planner.js';
import { execute, type ExecuteResult } from './executor.js';

export interface RunResult {
  /** True when every executed action was ok or skipped (no failures). */
  success: boolean;
  executeResult: ExecuteResult;
}

export interface RunDeps {
  prooph: BridgeDeps['prooph'];
  codegen: BridgeDeps['codegen'];
  registry: BridgeDeps['registry'];
  logger: Logger;
}

/**
 * Entry point for the main bridge pipeline.
 *
 * @param invocation - Parsed CLI / env / stdin config.
 * @param deps       - I/O dependencies (prooph client, codegen runner, registry reader, logger).
 */
export async function run(invocation: Invocation, deps: RunDeps): Promise<RunResult> {
  const { prooph, codegen, registry, logger } = deps;
  const { chapterId, sliceId, dryRun, eventSourced } = invocation;

  if (!chapterId || !sliceId) {
    throw new Error('run() called with missing chapterId or sliceId (should be caught by parseInvocation)');
  }

  // -------------------------------------------------------------------------
  // Step 1: load slice elements
  // -------------------------------------------------------------------------
  logger.info(`Loading slice ${sliceId} from chapter ${chapterId} …`);
  const { elements, chapterName } = await prooph.getSliceElements(chapterId, sliceId);

  if (elements.length === 0) {
    logger.info('Slice has no relevant elements (command/event/information/automation). Nothing to do.');
    return { success: true, executeResult: { success: true, results: [] } };
  }

  // Find slice label from first element's sliceId-matched element (all share the same slice).
  const sliceLabel = elements[0]?.sliceId ?? sliceId;

  logger.info(`Loaded ${elements.length} element(s) from slice "${sliceLabel}" in chapter "${chapterName}".`);

  // -------------------------------------------------------------------------
  // Step 2: fetch dependency graphs for event / information / automation elements
  // -------------------------------------------------------------------------
  const graphs = new Map<string, DependencyGraph>();
  const graphErrors = new Map<string, string>();
  const graphTargetTypes = new Set(['event', 'information', 'automation']);

  const graphElements = elements.filter(e => graphTargetTypes.has(e.type));
  logger.info(`Fetching dependency graphs for ${graphElements.length} element(s) …`);

  await Promise.allSettled(
    graphElements.map(async (element: BoardElement) => {
      try {
        const graph = await prooph.getDependencyGraph(chapterId, element.id);
        // Per api-contracts.md: the client sets chapterId from the requested chapterId
        // when elements in the graph don't carry it. We store by elementId.
        graphs.set(element.id, graph);
        logger.info(`  Graph OK: ${element.context}.${element.name} (${element.type})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        graphErrors.set(element.id, msg);
        logger.warn(`  Graph FAILED for ${element.context}.${element.name}: ${msg}`);
      }
    })
  );

  if (graphErrors.size > 0) {
    logger.warn(
      `Dependency graphs failed for ${graphErrors.size} element(s); those links will be skipped (R10).`
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: read registry + plan
  // -------------------------------------------------------------------------
  logger.info('Reading registry snapshot …');
  const registrySnapshot = registry.read();

  logger.info('Planning …');
  const thePlan = plan({
    slice: { id: sliceId, chapterId },
    elements,
    graphs,
    registry: registrySnapshot,
  });

  logger.info(
    `Plan: ${thePlan.actions.length} action(s), ${thePlan.notes.length} note(s).`
  );
  if (thePlan.notes.length > 0) {
    for (const note of thePlan.notes) {
      logger.warn(`Note [${note.id}] element ${note.elementId}: ${note.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: execute
  // -------------------------------------------------------------------------
  const executeResult = await execute(thePlan, elements, {
    codegen,
    registry,
    prooph,
    logger,
  }, {
    dryRun,
    eventSourced,
    sliceLabel,
    chapterName,
  });

  return { success: executeResult.success, executeResult };
}
