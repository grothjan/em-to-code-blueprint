/**
 * Subprocess runner for the codegen CLI.
 *
 * Uses `child_process.execFile` with an explicit argument array (no shell).
 * Resolves `tsx` from `node_modules/.bin/tsx` relative to the blueprint root
 * (the `cwd` passed in), falling back to `npx tsx` if the local binary is not found.
 *
 * Implements the `CodegenRunner` interface from `model.ts`.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CodegenRunner } from './model.js';

export type { CodegenRunner } from './model.js';

export interface CodegenRunnerOptions {
  /** Blueprint root directory (defaults to process.cwd()) */
  cwd?: string;
  /** Timeout in milliseconds (defaults to 60_000) */
  timeout?: number;
}

/**
 * Resolves the `tsx` binary path.
 *
 * Prefers `<cwd>/node_modules/.bin/tsx` to avoid shelling out through `npx`,
 * which would add startup overhead and require a shell. Falls back to `npx`
 * when the local binary does not exist (e.g. in sandboxes that symlink
 * node_modules instead of copying it).
 */
function resolveTsx(cwd: string): { executable: string; prependArgs: string[] } {
  const localTsx = join(cwd, 'node_modules', '.bin', 'tsx');
  if (existsSync(localTsx)) {
    return { executable: localTsx, prependArgs: [] };
  }
  // Fall back to `npx tsx` - two-element arg prefix
  return { executable: 'npx', prependArgs: ['tsx'] };
}

/**
 * Creates a `CodegenRunner` that invokes `tsx bin/app.ts codegen ...` as a
 * subprocess with `execFile` (no shell, no interpolation).
 *
 * @param options.cwd   - Blueprint root (default: `process.cwd()`)
 * @param options.timeout - Per-run timeout in ms (default: 60_000)
 */
export function createCodegenRunner(options: CodegenRunnerOptions = {}): CodegenRunner {
  const cwd = options.cwd ?? process.cwd();
  const timeout = options.timeout ?? 60_000;

  return {
    run(args: string[]): Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string }> {
      return new Promise(resolve => {
        const { executable, prependArgs } = resolveTsx(cwd);
        // Full argument list: [tsx-prepend...] bin/app.ts codegen ...args
        const fullArgs = [...prependArgs, 'bin/app.ts', 'codegen', ...args];

        execFile(
          executable,
          fullArgs,
          { cwd, timeout, env: process.env },
          (error, stdout, stderr) => {
            if (error) {
              // Distinguish timeout from normal non-zero exit
              const exitCode =
                (error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
                  ? 124
                  : (error.code as number | undefined) ?? 1;
              resolve({ ok: false, exitCode, stdout, stderr });
            } else {
              resolve({ ok: true, exitCode: 0, stdout, stderr });
            }
          }
        );
      });
    }
  };
}
