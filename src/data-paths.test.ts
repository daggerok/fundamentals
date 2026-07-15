import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { staticDataUrl } from './data-utils';

const root = join(import.meta.dir, '..');
const fetcher = readFileSync(join(root, 'scripts/fundamentals-data.py'), 'utf8');

describe('data/fundamentals path layout (PR2)', () => {
  test('fetcher writes under data/fundamentals', () => {
    expect(fetcher).toContain('DATA_DIR = ROOT / "data" / "fundamentals"');
  });

  test('staticDataUrl targets data/fundamentals/*', () => {
    expect(staticDataUrl('AAPL.json', 'http://localhost:1234/')).toBe(
      'http://localhost:1234/data/fundamentals/AAPL.json',
    );
    expect(staticDataUrl('index.json', 'https://daggerok.github.io/fundamentals/')).toBe(
      'https://daggerok.github.io/fundamentals/data/fundamentals/index.json',
    );
  });
});
