/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type DataMode, detectPrimaryCurrency, extractMetric, normalizeFacts } from './data-utils';
import { withTestDir } from './test-dir';

// The static files are trimmed by scripts/fundamentals-data.py trim_facts (plan 04-4.2).
// These tests run that exact Python function on real cached companyfacts and check that
// everything the dashboard computes from the facts (proc() in main.tsx) is unchanged.

const script = fileURLToPath(new URL('../scripts/fundamentals-data.py', import.meta.url));

/** Metric key -> concept list, parsed from `const CON` in main.tsx (the list proc() reads). */
function dashboardConcepts(): Record<string, string[]> {
  const ts = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  const start = ts.indexOf('const CON: Record<string, string[]> = {');
  const block = ts.slice(start, ts.indexOf('\n};', start));
  const con: Record<string, string[]> = {};
  let key = '';
  for (const line of block.split('\n').slice(1)) {
    const header = line.match(/^ {2}(\w+): \[/);
    if (header) {
      key = header[1];
      con[key] = [];
    }
    for (const match of line.matchAll(/'([A-Z][A-Za-z]+)'/g)) con[key].push(match[1]);
  }
  return con;
}

/** Run the Python trim_facts on a cached file (python3 is preinstalled on the CI runner). */
function trimWithPython(file: string): any {
  const code = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("fd", sys.argv[1])',
    'fd = importlib.util.module_from_spec(spec); spec.loader.exec_module(fd)',
    'doc = json.load(open(sys.argv[2], encoding="utf-8"))',
    'sys.stdout.write(json.dumps(fd.trim_facts(doc.get("facts") if isinstance(doc.get("facts"), dict) else doc)))',
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', code, script, file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
}

/** Everything proc() derives from the facts except the debug-only "available" lists. */
function dashboardNumbers(facts: any, mode: DataMode, preferUsd: boolean, con: Record<string, string[]>) {
  const primaryCurrency = detectPrimaryCurrency(facts, mode);
  const metrics: Record<string, unknown> = {};
  for (const [key, concepts] of Object.entries(con)) {
    metrics[key] = extractMetric(facts, concepts, mode, { preferUsd, preferredCurrency: primaryCurrency });
  }
  return { primaryCurrency, metrics };
}

const con = dashboardConcepts();
// AAPL: plain us-gaap 10-K/10-Q; JPM: bank (no revenue/COGS concepts); VICI: REIT with CAD units; TTE: IFRS 20-F
const TICKERS = ['AAPL', 'JPM', 'VICI', 'TTE'];

describe('trimmed companyfacts show the same dashboard numbers', () => {
  test('CON has the expected shape', () => {
    expect(Object.keys(con).length).toBeGreaterThan(20);
    expect(con.revenue).toContain('Revenues');
  });

  for (const ticker of TICKERS) {
    const file = fileURLToPath(new URL(`../data/fundamentals/${ticker}.json`, import.meta.url));
    test.skipIf(!existsSync(file))(`${ticker}: trim_facts keeps every value proc() reads`, () => {
      const full = normalizeFacts(JSON.parse(readFileSync(file, 'utf8')));
      const trimmed = trimWithPython(file);
      let filled = 0;
      for (const mode of ['Y', 'Q', 'I'] as DataMode[]) {
        for (const preferUsd of [true, false]) {
          const before = dashboardNumbers(full, mode, preferUsd, con);
          const after = dashboardNumbers(trimmed, mode, preferUsd, con);
          expect(after).toEqual(before);
          filled += Object.values(before.metrics).filter((rows) => Array.isArray(rows) && rows.length).length;
        }
      }
      // Guard against a vacuous pass where both sides are empty.
      expect(filled).toBeGreaterThan(10);
    });
  }

  test('dropping a concept the dashboard reads changes the numbers', () => {
    const file = fileURLToPath(new URL('../data/fundamentals/AAPL.json', import.meta.url));
    if (!existsSync(file)) return;
    const trimmed = trimWithPython(file);
    const broken = structuredClone(trimmed);
    delete broken['us-gaap'].NetIncomeLoss;
    expect(dashboardNumbers(broken, 'Y', true, con)).not.toEqual(dashboardNumbers(trimmed, 'Y', true, con));
  });
});

describe('write_ticker_cache writes only on a real change', () => {
  test('a refetch with the same SEC facts keeps the file byte for byte, new facts rewrite it', () => {
    const file = fileURLToPath(new URL('../data/fundamentals/AAPL.json', import.meta.url));
    if (!existsSync(file)) return;
    const code = [
      'import importlib.util, json, sys, time',
      'from pathlib import Path',
      'spec = importlib.util.spec_from_file_location("fd", sys.argv[1])',
      'fd = importlib.util.module_from_spec(spec); spec.loader.exec_module(fd)',
      'fd.DATA_DIR = Path(sys.argv[3])',
      'doc = json.load(open(sys.argv[2], encoding="utf-8"))',
      'raw = {"entityName": doc.get("entityName"), "facts": doc["facts"]}',
      'meta = {"cik": doc["cik"], "title": doc.get("title")}',
      'p = fd.write_ticker_cache("AAPL", meta, raw); first = p.read_text()',
      'time.sleep(1.1)',
      'fd.write_ticker_cache("AAPL", meta, raw); second = p.read_text()',
      'raw["facts"]["us-gaap"]["NetIncomeLoss"]["units"]["USD"].append({"end": "2099-12-31", "val": 1, "form": "10-K", "fy": 2099, "fp": "FY", "filed": "2100-01-01"})',
      'fd.write_ticker_cache("AAPL", meta, raw); third = p.read_text()',
      'print(json.dumps({"same": first == second, "changed": third != first}))',
    ].join('\n');
    // DATA_DIR is a fresh folder under the gitignored .test-tmp/, removed afterwards (never the system temp dir).
    const out = JSON.parse(
      withTestDir('write-cache', (dir) =>
        execFileSync('python3', ['-c', code, script, file, dir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
      ),
    );
    expect(out).toEqual({ same: true, changed: true });
  });
});
