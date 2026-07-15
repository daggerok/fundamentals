import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const main = readFileSync(join(import.meta.dir, 'main.tsx'), 'utf8');

describe('proxy indicators vs CACHE/LIVE (fundamentals)', () => {
  test('header indicators switch to muted grey in CACHE mode', () => {
    expect(main).toContain("data-proxy-indicators={dataSource === 'cache' ? 'disabled' : 'live'}");
    expect(main).toContain("dataSource === 'cache'");
    expect(main).toContain("bg-slate-400/50 dark:bg-slate-600/50");
    // LIVE path still uses green/red
    expect(main).toContain('bg-red-500');
    expect(main).toContain('dotOn');
  });

  test('settings/debug proxy status labels are n/a when not live', () => {
    expect(main).toContain('const proxyLive = dataSource === \'live\'');
    expect(main).toContain('proxyStatusCls');
    expect(main).toContain('proxyStatusLabel');
    expect(main).toContain("!proxyLive ? '● n/a'");
    expect(main).toContain("'proxy.indicatorsDisabled'");
  });
});
