/**
 * Executor: runs the codegen plan produced by the planner.
 *
 * Per "Executor semantics" in specs/bridge/planning-rules.md:
 * 1. Re-read registry before each action; skip if the action's effect already exists.
 * 2. Run CLI subprocess. Non-zero exit -> `failed`; skip dependants of this action.
 * 3. On success, post task comment unless the same marker already exists (open) on the element.
 * 4. Comment POST failure -> `failed-comment` (code generated, exit 1, logged).
 *
 * `--dry-run`: resolve plan input, print plan as JSON, skip codegen and comment POSTs.
 */

import type {
  Action,
  ActionKind,
  BoardElement,
  BridgeDeps,
  CodegenRunner,
  Logger,
  Plan,
  ProophClient,
  RegistryReader,
  RegistrySnapshot,
} from './model.js';
import { buildComment } from './task-comments.js';
import { toPascalCase } from './naming.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ActionStatus =
  | 'ok'
  | 'skipped'       // registry already satisfied before running
  | 'failed'        // CLI exited non-zero
  | 'failed-comment' // CLI succeeded but comment POST failed after retries
  | 'dependant-skipped'; // an earlier action failed so this action was skipped

export interface ActionResult {
  action: Action;
  status: ActionStatus;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  commentPosted?: boolean;
  commentError?: string;
}

export interface ExecuteResult {
  /** True iff every action is ok, skipped, or dependant-skipped cleanly (no failures). */
  success: boolean;
  results: ActionResult[];
}

/** Everything the executor needs wired in. */
export interface ExecutorDeps {
  codegen: CodegenRunner;
  registry: RegistryReader;
  prooph: ProophClient;
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Helpers: build CLI arg array from action
// ---------------------------------------------------------------------------

/**
 * Returns the `codegen` subcommand arg array for a given action, or `null`
 * when the action produces no CLI invocation (context, known, blocked).
 */
export function buildArgs(action: Action, eventSourced: boolean): string[] | null {
  switch (action.kind) {
    case 'context':
      return eventSourced
        ? ['context', action.context!, '--event-sourced']
        : ['context', action.context!];

    case 'command':
      return ['command', action.context!, action.name!];

    case 'event':
      // `codegen event <Ctx> <Cmd> <Name>`
      // The planner stores the command name in `targetName`.
      return ['event', action.context!, action.targetName!, action.name!];

    case 'information':
      return ['information', action.context!, action.name!];

    case 'prjcase':
      // `codegen prjcase <Ctx> <Info> <Evt>`
      // action.name = information name, action.targetName = event name
      return ['prjcase', action.context!, action.name!, action.targetName!];

    case 'on':
      // `codegen on <Ctx> <Evt> <Auto>`
      // action.targetName = event name, action.name = automation name
      return ['on', action.context!, action.targetName!, action.name!];

    case 'job':
      // `codegen job <Ctx> <Info> <Auto>`
      // action.targetName = information name, action.name = automation name
      return ['job', action.context!, action.targetName!, action.name!];

    case 'known':
    case 'blocked':
      return null; // No CLI invocation; still posts a comment.
  }
}

// ---------------------------------------------------------------------------
// Helpers: idempotency check
// ---------------------------------------------------------------------------

/**
 * Returns true if the action's effect is already present in the registry,
 * meaning we can skip the CLI call.
 */
export function isAlreadySatisfied(action: Action, registry: RegistrySnapshot): boolean {
  switch (action.kind) {
    case 'context': {
      // Satisfied when the context folder exists (tracked via contexts set).
      return registry.contexts.has(action.context!);
    }
    case 'command': {
      const fqcn = `${action.context}.${action.name}`;
      return registry.commands.has(fqcn);
    }
    case 'event': {
      const fqcn = `${action.context}.${action.name}`;
      return registry.events.has(fqcn);
    }
    case 'information': {
      const fqcn = `${action.context}.${action.name}`;
      return registry.informationFolders.has(fqcn) || registry.queries.has(fqcn);
    }
    case 'prjcase': {
      // Satisfied when eventApply[eventFqcn] contains infoFqcn.
      const applies = registry.eventApply.get(action.eventFqcn!);
      return applies?.has(action.infoFqcn!) ?? false;
    }
    case 'on': {
      // Satisfied when eventAutomate[eventFqcn] contains autoFqcn.
      const automates = registry.eventAutomate.get(action.eventFqcn!);
      return automates?.has(action.autoFqcn!) ?? false;
    }
    case 'job': {
      // Satisfied when jobs contains autoFqcn.
      return registry.jobs.has(action.autoFqcn!);
    }
    case 'known':
    case 'blocked':
      // These never run codegen; they are always "not satisfied" in the CLI
      // sense but we don't block on them.
      return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers: comment idempotency
// ---------------------------------------------------------------------------

/** Marker prefix pattern used in buildComment (see task-comments.ts). */
function commentMarker(actionKey: string): string {
  return `[em-to-code-blueprint:${actionKey}]`;
}

/**
 * Returns true when the element already has an open task comment with the
 * same marker (i.e. a task comment that has not been resolved).
 */
function hasOpenMarker(element: BoardElement, actionKey: string): boolean {
  const marker = commentMarker(actionKey);
  return element.comments.some(c => c.isTask && !c.resolved && c.text.startsWith(marker));
}

// ---------------------------------------------------------------------------
// Helpers: target element for comment
// ---------------------------------------------------------------------------

/**
 * Returns the `{ chapterId, elementId }` to use when posting a comment, plus
 * the `BoardElement` needed by `buildComment`.
 *
 * The planner's action keys encode FQCN which lets us locate the right element.
 * For link actions (prjcase, on, job) the comment goes to a specific element:
 * - prjcase -> information element
 * - on / job -> automation element
 * - command / event / information / known / blocked -> the element matching the FQCN
 * - context -> no comment (handled before this is called)
 */
function findCommentTarget(
  action: Action,
  elements: BoardElement[]
): { element: BoardElement; chapterId: string } | null {
  // Extract the target FQCN from the action key.
  // Keys have shapes like:  command:Ctx.Name  or  prjcase:Ctx.Info<-Ctx.Evt
  // The comment always goes to the element whose FQCN is the first segment after the kind prefix.
  const keyBody = action.key.slice(action.kind.length + 1); // strip "kind:"
  const fqcnForComment = keyBody.split('<-')[0]; // for prjcase/on/job, take the left side

  // Build FQCN for each element and try to find a match.
  // Board element names are raw text ("Plan Todo"); normalise to PascalCase
  // before comparing against the action key which always uses PascalCase FQCNs.
  for (const el of elements) {
    const fqcn = `${toPascalCase(el.context)}.${toPascalCase(el.name)}`;
    if (fqcn === fqcnForComment) {
      return { element: el, chapterId: el.chapterId };
    }
  }

  // For prjcase the comment goes to the info element; for on/job to the automation.
  // If the slice does not contain the target element, we cannot post a comment.
  return null;
}

// ---------------------------------------------------------------------------
// Dependant tracking
// ---------------------------------------------------------------------------

/**
 * Determine if `downstream` depends on a failed `upstream` action.
 *
 * A downstream action is a dependant when:
 * - upstream = command   → downstream = event with same context.Name
 * - upstream = event     → downstream = prjcase or on with that eventFqcn
 * - upstream = context   → downstream = any action in that context
 * - upstream = information → downstream = prjcase, job with that infoFqcn
 *
 * This is conservative: we skip anything that could not succeed without the
 * failed prerequisite, mirroring the planning-rules dependency ordering.
 */
function isDependant(upstream: Action, downstream: Action): boolean {
  if (upstream.kind === 'context') {
    return downstream.context === upstream.context &&
      downstream.kind !== 'context' &&
      downstream.kind !== 'known' &&
      downstream.kind !== 'blocked';
  }

  if (upstream.kind === 'command') {
    // Events whose command matches the failed command.
    if (downstream.kind === 'event') {
      return (
        downstream.context === upstream.context &&
        downstream.targetName === upstream.name
      );
    }
    return false;
  }

  if (upstream.kind === 'event') {
    const upstreamFqcn = `${upstream.context}.${upstream.name}`;
    if (downstream.kind === 'prjcase') {
      return downstream.eventFqcn === upstreamFqcn;
    }
    if (downstream.kind === 'on') {
      return downstream.eventFqcn === upstreamFqcn;
    }
    return false;
  }

  if (upstream.kind === 'information') {
    const upstreamFqcn = `${upstream.context}.${upstream.name}`;
    if (downstream.kind === 'prjcase') {
      return downstream.infoFqcn === upstreamFqcn;
    }
    if (downstream.kind === 'job') {
      return downstream.infoFqcn === upstreamFqcn;
    }
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  dryRun?: boolean;
  eventSourced?: boolean;
  /** Slice label (name) for comment context */
  sliceLabel?: string;
  /** Chapter name for comment context */
  chapterName?: string;
}

/**
 * Execute a plan.
 *
 * @param plan     - The ordered plan from `plan()`.
 * @param elements - Slice elements (needed to look up comment targets).
 * @param deps     - Wired I/O dependencies.
 * @param options  - Runtime flags.
 */
export async function execute(
  plan: Plan,
  elements: BoardElement[],
  deps: ExecutorDeps,
  options: ExecuteOptions = {}
): Promise<ExecuteResult> {
  const {
    dryRun = false,
    eventSourced = false,
    sliceLabel = '',
    chapterName = '',
  } = options;
  const { codegen, registry, prooph, logger } = deps;

  if (dryRun) {
    logger.info(JSON.stringify({ dryRun: true, plan }, null, 2));
    return { success: true, results: [] };
  }

  const results: ActionResult[] = [];
  // Keys of actions that have failed; used to skip dependants.
  const failedKeys = new Set<string>();

  for (const action of plan.actions) {
    // -----------------------------------------------------------------------
    // 0. Skip dependants of failed actions
    // -----------------------------------------------------------------------
    const failedUpstream = [...failedKeys].some(fk => {
      const upstreamAction = results.find(r => r.action.key === fk)?.action;
      return upstreamAction ? isDependant(upstreamAction, action) : false;
    });

    if (failedUpstream) {
      logger.warn(`Skipping ${action.key}: upstream action failed.`);
      results.push({ action, status: 'dependant-skipped' });
      continue;
    }

    // -----------------------------------------------------------------------
    // 1. Re-read registry; skip if effect already present
    // -----------------------------------------------------------------------
    const snap = registry.read();

    if (isAlreadySatisfied(action, snap)) {
      logger.info(`Skipping ${action.key}: already satisfied in registry.`);
      results.push({ action, status: 'skipped' });
      continue;
    }

    // -----------------------------------------------------------------------
    // 2. Run CLI (unless action has no CLI invocation)
    // -----------------------------------------------------------------------
    const args = buildArgs(action, eventSourced);

    if (args !== null) {
      logger.info(`Running codegen: ${action.key}`);
      const runResult = await codegen.run(args);

      if (!runResult.ok) {
        const stderr = runResult.stderr.slice(0, 2048);
        logger.error(
          `Codegen failed for ${action.key} (exit ${runResult.exitCode}): ${stderr}`
        );
        failedKeys.add(action.key);
        results.push({
          action,
          status: 'failed',
          exitCode: runResult.exitCode,
          stdout: runResult.stdout,
          stderr,
        });
        continue;
      }

      logger.info(`Codegen succeeded: ${action.key}`);
    }

    // -----------------------------------------------------------------------
    // 3. Post task comment
    // -----------------------------------------------------------------------
    if (action.kind === 'context') {
      // Context actions don't get their own comment.
      results.push({ action, status: 'ok', commentPosted: false });
      continue;
    }

    const target = findCommentTarget(action, elements);
    if (!target) {
      // Cannot find the element to comment on (e.g. a cross-slice element we
      // don't have in our elements list). Log and move on.
      logger.warn(`No comment target found for ${action.key}; skipping comment.`);
      results.push({ action, status: 'ok', commentPosted: false });
      continue;
    }

    const { element, chapterId } = target;

    // Check idempotency: don't re-post an open task with the same marker.
    if (hasOpenMarker(element, action.key)) {
      logger.info(`Comment marker already present for ${action.key}; skipping.`);
      results.push({ action, status: 'ok', commentPosted: false });
      continue;
    }

    const commentText = buildComment(action, {
      element,
      chapterName,
      sliceLabel,
    });

    try {
      await prooph.addTaskComment(chapterId, element.id, commentText);
      logger.info(`Comment posted for ${action.key}.`);
      results.push({ action, status: 'ok', commentPosted: true });
    } catch (err) {
      const commentError = err instanceof Error ? err.message : String(err);
      logger.error(
        `Comment POST failed for ${action.key} (element ${element.id}): ${commentError}`
      );
      results.push({
        action,
        status: 'failed-comment',
        commentPosted: false,
        commentError,
      });
    }
  }

  const success = results.every(
    r =>
      r.status === 'ok' ||
      r.status === 'skipped' ||
      r.status === 'dependant-skipped'
  );

  logger.info(
    JSON.stringify({
      summary: {
        total: results.length,
        ok: results.filter(r => r.status === 'ok').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        dependantSkipped: results.filter(r => r.status === 'dependant-skipped').length,
        failed: results.filter(r => r.status === 'failed').length,
        failedComment: results.filter(r => r.status === 'failed-comment').length,
      },
    })
  );

  return { success, results };
}
