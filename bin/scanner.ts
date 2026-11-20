import {readRegistrySnapshot} from '@lib/helpers/registry-reader';
import type {RegistrySnapshot} from '@lib/helpers/registry-reader';
import {resolve} from 'path';

export type {RegistrySnapshot};

/**
 * Scans domain directory for contexts and their registered commands, events, queries, and jobs
 */
export function scanDomain(domainPath: string): RegistrySnapshot {
  return readRegistrySnapshot(domainPath);
}

/**
 * Gets the domain path relative to the current working directory
 */
export function getDomainPath(projectRoot?: string): string {
  const base = projectRoot || process.cwd();
  return resolve(base, 'src', 'domain');
}
