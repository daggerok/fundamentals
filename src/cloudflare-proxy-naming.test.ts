import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('cloudflare proxy name (PR3)', () => {
  test('worker file uses domain-specific name', () => {
    expect(existsSync(join(root, 'scripts/fundamentals-cloudflare-proxy.js'))).toBe(true);
    expect(existsSync(join(root, 'scripts/cloudflare-worker.js'))).toBe(false);
  });

  test('docs reference the renamed worker', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('fundamentals-cloudflare-proxy.js');
    expect(readme).not.toContain('cloudflare-worker.js');
  });
});
