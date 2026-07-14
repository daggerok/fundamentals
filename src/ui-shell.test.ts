import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const updateWorkflow = readFileSync(
  new URL('../.github/workflows/update-data.yml', import.meta.url),
  'utf8',
);

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
  test('uses the same popover dimensions as Settings, anchored on the left', () => {
    expect(main).toContain('role="dialog"');
    expect(main).toContain(
      'absolute left-0 top-full mt-2 w-[min(92vw,22rem)] z-[60] ${card} border rounded-xl shadow-xl p-3 space-y-3',
    );
    expect(main).toContain(
      'absolute right-0 top-full mt-2 w-[min(92vw,22rem)] z-[60] ${card} border rounded-xl shadow-xl p-3 space-y-3',
    );
    expect(main).toContain("t('debug.reporting', lang)");
    expect(main).toContain("t('debug.connection', lang)");
    expect(main).toContain("t('debug.activity', lang)");
    expect(main).not.toContain('console-wrap');
    expect(css).not.toContain('.console-wrap');
    expect(css).not.toContain('.console-inner');
  });

  test('keeps both menus open until explicitly toggled and resets them on refresh', () => {
    expect(main).toContain('const [showDebug, setShowDebug] = useState(false)');
    expect(main).toContain('const [showSettings, setShowSettings] = useState(false)');
    expect(main).not.toContain('prefs.showDebug');
    expect(main).not.toMatch(/showDebug\s*&&\s*debugRef\.current/);
    expect(main).not.toMatch(/showSettings\s*&&\s*settingsRef\.current/);
    expect(main).not.toContain('if (open) setShowSettings(false)');
  });
});

describe('SEC cache schedule', () => {
  test('uses the requested daily stagger and half-second request delay', () => {
    const crons = [
      '0 0-3 * * 0-6',
      '1 4-7 * * 0-6',
      '2 8-11 * * 0-6',
      '3 12-15 * * 0-6',
      '5 16-19 * * 0-6',
      '8 20-23 * * 0-6',
      '13 0-23 * * 0-6',
      '21 0-23 * * 0-6',
      '34 0-23 * * 0-6',
      '45 0-23 * * 0-6',
      '55 0-23 * * 0-6',
    ];
    for (const cron of crons) expect(updateWorkflow).toContain(`cron: "${cron}"`);
    expect(updateWorkflow).toContain('REQUEST_SLEEP: "0.5"');
  });
});
