import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('domain script names (PR1)', () => {
  test('fetcher and local proxy use domain-specific filenames', () => {
    expect(existsSync(join(root, 'scripts/fundamentals-data.py'))).toBe(true);
    expect(existsSync(join(root, 'scripts/fundamentals-local-proxy.ts'))).toBe(true);
    expect(existsSync(join(root, 'scripts/fetch_data.py'))).toBe(false);
    expect(existsSync(join(root, 'scripts/sec-proxy.ts'))).toBe(false);
  });

  test('package.json scripts point at renamed files', () => {
    expect(pkg.scripts['serve:proxy:www']).toContain('scripts/fundamentals-local-proxy.ts');
    expect(pkg.scripts['serve:proxy:data']).toContain('scripts/fundamentals-local-proxy.ts');
    expect(pkg.scripts['all:proxy']).toContain('scripts/fundamentals-local-proxy.ts');
    expect(pkg.scripts['data:fetch']).toContain('scripts/fundamentals-data.py');
    expect(pkg.scripts['data:fetch:pip']).toContain('scripts/fundamentals-data.py');
    const all = JSON.stringify(pkg.scripts);
    expect(all).not.toContain('sec-proxy.ts');
    expect(all).not.toContain('fetch_data.py');
  });

  test('CI checks renamed local proxy', () => {
    const ci = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8');
    expect(ci).toContain('scripts/fundamentals-local-proxy.ts');
    expect(ci).not.toContain('scripts/sec-proxy.ts');
  });

  test('update-data workflow runs renamed fetcher', () => {
    const wf = readFileSync(join(root, '.github/workflows/update-data.yml'), 'utf8');
    expect(wf).toContain('scripts/fundamentals-data.py');
    expect(wf).not.toContain('scripts/fetch_data.py');
  });
});
