/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// scripts/fundamentals-data.py merge_facts: a ticker that moved to a new CIK (PREDECESSOR_CIKS, e.g. XOM after
// its 2026 holding-company reorganization) gets the old CIK's history merged into its file before trimming.

const script = fileURLToPath(new URL('../scripts/fundamentals-data.py', import.meta.url));

function runPython(body: string, input: unknown): any {
  const code = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("fd", sys.argv[1])',
    'fd = importlib.util.module_from_spec(spec); spec.loader.exec_module(fd)',
    'inp = json.loads(sys.stdin.read())',
    body,
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', code, script], { input: JSON.stringify(input), encoding: 'utf8' }));
}

const row = (start: string | null, end: string, val: number, form: string, filed: string, accn: string) => ({
  ...(start ? { start } : {}),
  end,
  val,
  accn,
  fy: Number(filed.slice(0, 4)),
  fp: form === '10-K' ? 'FY' : 'Q2',
  form,
  filed,
});

// Old CIK: 10-K history (two 10-Ks both report FY2024) and the Q2 2025 10-Q.
const fy2024a = row('2024-01-01', '2024-12-31', 30, '10-K', '2025-02-20', 'old-k-2025');
const fy2024b = row('2024-01-01', '2024-12-31', 31, '10-K', '2026-02-18', 'old-k-2026');
const fy2025 = row('2025-01-01', '2025-12-31', 40, '10-K', '2026-02-18', 'old-k-2026');
const q2025old = row('2025-04-01', '2025-06-30', 10, '10-Q', '2025-08-04', 'old-q-2025');
const assets2025 = row(null, '2025-12-31', 400, '10-K', '2026-02-18', 'old-k-2026');
// Both records carry the same row of a filing that SEC lists under both CIKs.
const shared = row('2026-04-01', '2026-06-30', 12, '10-Q', '2026-08-03', 'shared-q-2026');
const predecessor = {
  'us-gaap': {
    NetIncomeLoss: { label: 'Old label', units: { USD: [fy2024a, fy2024b, q2025old, fy2025, shared] } },
    Assets: { label: 'Assets', units: { USD: [assets2025] } },
  },
  dei: { EntityCommonStockSharesOutstanding: { label: 'Shares', units: { shares: [row(null, '2026-01-31', 5, '10-K', '2026-02-18', 'old-k-2026')] } } },
};

// New CIK: one 10-Q with the current quarter and a restated comparative quarter of 2025.
const q2025new = row('2025-04-01', '2025-06-30', 11, '10-Q', '2026-08-03', 'new-q-2026');
const q2026 = row('2026-04-01', '2026-06-30', 12, '10-Q', '2026-08-03', 'new-q-2026');
const current = {
  'us-gaap': {
    NetIncomeLoss: { label: 'New label', units: { USD: [q2026, q2025new, shared] } },
    Revenues: { label: 'Revenues', units: { USD: [row('2026-04-01', '2026-06-30', 90, '10-Q', '2026-08-03', 'new-q-2026')] } },
  },
};

describe('merge_facts adds a predecessor CIK history', () => {
  const merged = runPython('print(json.dumps(fd.merge_facts(inp["current"], [inp["old"]])))', { current, old: predecessor });

  test('keeps the non-overlapping history of both records', () => {
    const rows = merged['us-gaap'].NetIncomeLoss.units.USD;
    expect(rows).toContainEqual(fy2025);
    expect(rows).toContainEqual(q2026);
    expect(merged['us-gaap'].Assets.units.USD).toEqual([assets2025]);
    expect(merged['us-gaap'].Revenues).toEqual(current['us-gaap'].Revenues);
    expect(merged.dei).toEqual(predecessor.dei);
  });

  test('a period both records report resolves to the newer filing', () => {
    const q2 = merged['us-gaap'].NetIncomeLoss.units.USD.filter((r: any) => r.end === '2025-06-30');
    expect(q2).toEqual([q2025new]);
  });

  test('same newest filing in both records keeps the current record rows only', () => {
    const q2026rows = merged['us-gaap'].NetIncomeLoss.units.USD.filter((r: any) => r.end === '2026-06-30');
    expect(q2026rows).toEqual([q2026, shared]);
  });

  test('rows of one record for one period stay as they are (the dashboard picks the newest)', () => {
    const fy2024 = merged['us-gaap'].NetIncomeLoss.units.USD.filter((r: any) => r.end === '2024-12-31');
    expect(fy2024).toEqual([fy2024a, fy2024b]);
  });

  test('older history first, concept metadata from the current record', () => {
    expect(merged['us-gaap'].NetIncomeLoss.units.USD).toEqual([fy2024a, fy2024b, fy2025, q2026, q2025new, shared]);
    expect(merged['us-gaap'].NetIncomeLoss.label).toBe('New label');
  });

  test('without predecessors the facts come back unchanged', () => {
    expect(runPython('print(json.dumps(fd.merge_facts(inp, [])))', current)).toEqual(current);
  });

  test('XOM is listed with the old Exxon Mobil Corporation CIK', () => {
    expect(runPython('print(json.dumps(fd.PREDECESSOR_CIKS))', null)).toEqual({ XOM: ['0000034088'] });
  });
});
