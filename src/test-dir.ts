/// <reference types="node" />
import { mkdirSync, mkdtempSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Gitignored scratch folder inside the repo for test runs: tests never write to the system temp dir. */
export const TEST_TMP_ROOT = fileURLToPath(new URL('../.test-tmp/', import.meta.url));

/** Run `fn` with a fresh folder under .test-tmp/; the folder is removed afterwards, also when `fn` throws. */
export function withTestDir<T>(prefix: string, fn: (dir: string) => T): T {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const dir = mkdtempSync(join(TEST_TMP_ROOT, `${prefix}-`));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    try {
      rmdirSync(TEST_TMP_ROOT); // only when empty: another run may still use it
    } catch {}
  }
}
