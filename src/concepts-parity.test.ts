import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function blockBetween(text: string, start: string, end: string): string {
  const begin = text.indexOf(start) + start.length; // skip the marker itself
  return text.slice(begin, text.indexOf(end, begin));
}

test('fundamentals-data.py KEEP_CONCEPTS equals the CON lists of main.tsx', () => {
  const ts = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  const py = readFileSync(new URL('../scripts/fundamentals-data.py', import.meta.url), 'utf8');
  const tsBlock = blockBetween(ts, 'const CON: Record<string, string[]> = {', '\n};');
  const fromTs = new Set([...tsBlock.matchAll(/'([A-Z][A-Za-z]+)'/g)].map((m) => m[1])); // only quoted concept names, not camelCase keys
  const pyBlock = blockBetween(py, 'KEEP_CONCEPTS = frozenset("""', '""".split())');
  const fromPy = new Set(pyBlock.split(/\s+/).filter(Boolean));
  expect([...fromPy].sort()).toEqual([...fromTs].sort());
});
