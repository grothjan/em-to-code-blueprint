// Config parsing for the bridge module
// Handles CLI arguments, environment variables, and stdin input

import { Invocation } from './model.js';

/**
 * Parsed command line arguments
 */
interface CliArgs {
  chapterId?: string;
  sliceId?: string;
  endpoint?: string;
  dryRun?: boolean;
  eventSourced?: boolean;
  help?: boolean;
  _: string[]; // rest args
}

/**
 * Parses the invocation configuration from CLI args, environment variables, and stdin
 * @param argv - process.argv without node and script path
 * @param env - process.env
 * @param stdinText - optional stdin input (from spec-stream)
 * @returns Invocation object or throws error for validation failures
 */
export function parseInvocation(
  argv: string[],
  env: Record<string, string | undefined>,
  stdinText?: string
): Invocation {
  const args = parseArgs(argv);

  // Determine chapter ID
  const chapterId = args.chapterId || env.SPEC_STREAM_CHAPTER_ID;
  if (!chapterId) {
    throw new Error('Missing chapter ID. Provide via --chapter-id or SPEC_STREAM_CHAPTER_ID env var');
  }

  // Determine slice ID
  const sliceId = args.sliceId || env.SPEC_STREAM_SLICE_ID;
  if (!sliceId) {
    throw new Error('Missing slice ID. Provide via --slice-id or SPEC_STREAM_SLICE_ID env var');
  }

  // Determine endpoint
  const endpoint = args.endpoint || env.PROOPHBOARD_API_ENDPOINT || 'https://api.proophboard.com';
  
  // Determine API key
  const apiKey = env.PROOPHBOARD_API_KEY;
  if (!apiKey) {
    throw new Error('Missing API key. Set PROOPHBOARD_API_KEY env var');
  }

  // Parse dry-run flag
  const dryRun = args.dryRun || env.BRIDGE_DRY_RUN === 'true';

  // Parse event-sourced flag
  const eventSourced = args.eventSourced || env.BRIDGE_EVENT_SOURCED === 'true';

  return {
    chapterId,
    sliceId,
    endpoint,
    apiKey,
    dryRun,
    eventSourced,
    inputText: stdinText
  };
}

/**
 * Parses command line arguments into a structured object
 */
function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    _: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--chapter-id' || arg === '-c') {
      result.chapterId = argv[++i];
    } else if (arg === '--slice-id' || arg === '-s') {
      result.sliceId = argv[++i];
    } else if (arg === '--endpoint' || arg === '-e') {
      result.endpoint = argv[++i];
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--event-sourced') {
      result.eventSourced = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (!arg.startsWith('-')) {
      result._.push(arg);
    }
  }

  return result;
}

/**
 * Prints help message for the bridge command
 */
export function printHelp(): void {
  console.log(`
Bridge: Event Model (prooph board) -> Blueprint

Usage: bridge [options]

Options:
  --chapter-id, -c <id>     Chapter ID (or use SPEC_STREAM_CHAPTER_ID env var)
  --slice-id, -s <id>       Slice ID (or use SPEC_STREAM_SLICE_ID env var)
  --endpoint, -e <url>      Prooph board API endpoint (default: https://api.proophboard.com)
  --dry-run                 Show plan without executing
  --event-sourced           Enable event-sourced context generation
  --help, -h                Show this help message

Environment Variables:
  PROOPHBOARD_API_KEY           Required. Write-enabled API key for posting comments
  PROOPHBOARD_API_ENDPOINT      Prooph board API endpoint
  SPEC_STREAM_CHAPTER_ID        Chapter ID from spec-stream
  SPEC_STREAM_SLICE_ID          Slice ID from spec-stream
  BRIDGE_DRY_RUN                Set to "true" for dry-run mode
  BRIDGE_EVENT_SOURCED          Set to "true" for event-sourced contexts

Input:
  The bridge reads from stdin when invoked by spec-stream.
  The input should be a JSON object with the spec-stream event data.

Examples:
  bridge --chapter-id abc123 --slice-id def456
  SPEC_STREAM_CHAPTER_ID=abc123 SPEC_STREAM_SLICE_ID=def456 bridge
  cat event.json | bridge
`);
}
