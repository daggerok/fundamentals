import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('proxy guidance', () => {
  test('uses the single supported command everywhere in the UI', () => {
    expect(main).toContain("const PROXY_COMMAND = 'bun install -E && bun serve:proxy'");
    expect(main).not.toContain('bunx local-cors-proxy');
    expect(main).not.toContain('bun ./scripts/sec-proxy.ts && bun run serve:app');
    expect(main).not.toContain('bun start  # dual');
  });

  test('starts both User-Agent-aware Bun relays without recursive serve scripts', () => {
    expect(pkg.scripts.serve).toBe('npm-run-all --parallel serve:app serve:proxy');
    expect(pkg.scripts['serve:proxy']).toBe('npm-run-all --parallel serve:proxy:*');
    expect(pkg.scripts['serve:proxy:www']).toContain('MODE=www PORT=8011 bun ./scripts/sec-proxy.ts');
    expect(pkg.scripts['serve:proxy:data']).toContain('MODE=data PORT=8012 bun ./scripts/sec-proxy.ts');
  });
});

describe('debug UI', () => {
  test('uses an overlay dialog instead of the layout-shifting console', () => {
    expect(main).toContain('role="dialog"');
    expect(main).toContain("t('debug.reporting', lang)");
    expect(main).toContain("t('debug.connection', lang)");
    expect(main).toContain("t('debug.activity', lang)");
    expect(main).not.toContain('console-wrap');
    expect(css).not.toContain('.console-wrap');
    expect(css).not.toContain('.console-inner');
  });
});
