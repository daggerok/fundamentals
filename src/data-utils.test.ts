import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { extractMetric, normalizeFacts, staticDataUrl } from './data-utils';

describe('companyfacts normalization', () => {
  test('uses facts from a raw SEC response without requiring a symbol field', () => {
    const facts = { 'ifrs-full': { Revenue: { units: {} } } };
    const raw = {
      cik: 1046179,
      entityName: 'Taiwan Semiconductor Manufacturing Company Limited',
      facts,
    };

    expect('symbol' in raw).toBe(false);
    expect(normalizeFacts(raw)).toBe(facts);
  });
});

describe('static data URLs', () => {
  test('stay under the GitHub Pages project path', () => {
    expect(
      staticDataUrl('company_tickers.json', 'https://daggerok.github.io/fundamentals/'),
    ).toBe('https://daggerok.github.io/fundamentals/data/company_tickers.json');
    expect(staticDataUrl('TSM.json', 'https://daggerok.github.io/fundamentals/index.html')).toBe(
      'https://daggerok.github.io/fundamentals/data/TSM.json',
    );
  });

  test('still resolves from the root in local development', () => {
    expect(staticDataUrl('AAPL.json', 'http://localhost:1234/')).toBe(
      'http://localhost:1234/data/AAPL.json',
    );
  });
});

describe('metric extraction', () => {
  test('extracts IFRS 20-F USD facts by actual period instead of the filing fy', () => {
    const facts = {
      'ifrs-full': {
        Revenue: {
          units: {
            TWD: [
              {
                end: '2024-12-31',
                val: 2_894_307_700_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
                frame: 'CY2024',
              },
            ],
            USD: [
              // Comparative rows in one 20-F all carry the filing's fy=2024.
              {
                end: '2022-12-31',
                val: 73_670_400_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
                frame: 'CY2022',
              },
              {
                end: '2023-12-31',
                val: 70_598_800_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
              },
              {
                end: '2024-12-31',
                val: 88_268_000_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
                frame: 'CY2024',
              },
              // An older duplicate for 2023 must not win.
              {
                end: '2023-12-31',
                val: 1,
                fy: 2023,
                fp: 'FY',
                form: '20-F',
                filed: '2024-04-18',
                frame: 'CY2023',
              },
            ],
          },
        },
      },
    };

    const rows = extractMetric(facts, ['Revenue'], 'Y');
    expect(Object.fromEntries(rows.map((row) => [row._periodKey, row.val]))).toEqual({
      '2022': 73_670_400_000,
      '2023': 70_598_800_000,
      '2024': 88_268_000_000,
    });
  });

  test('extracts usable annual metrics from the repository TSM cache', () => {
    const doc = JSON.parse(readFileSync(new URL('../data/TSM.json', import.meta.url), 'utf8'));
    const facts = normalizeFacts(doc);

    const revenue = extractMetric(facts, ['Revenue'], 'Y');
    const assets = extractMetric(facts, ['Assets'], 'Y');
    const netIncome = extractMetric(facts, ['ProfitLoss'], 'Y');
    const eps = extractMetric(facts, ['BasicEarningsLossPerShare'], 'Y');

    expect(revenue.length).toBeGreaterThanOrEqual(5);
    expect(assets.length).toBeGreaterThanOrEqual(5);
    expect(netIncome.length).toBeGreaterThanOrEqual(5);
    expect(eps.length).toBeGreaterThanOrEqual(5);
    expect(revenue.find((row) => row._periodKey === '2024')?.val).toBe(88_268_000_000);
  });

  test('does not mislabel local-currency-only or 6-K facts as quarterly USD data', () => {
    const localCurrencyOnly = {
      'ifrs-full': {
        DividendsPaid: {
          units: {
            TWD: [
              {
                end: '2024-12-31',
                val: 1,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
              },
            ],
          },
        },
      },
    };
    expect(extractMetric(localCurrencyOnly, ['DividendsPaid'], 'Y')).toEqual([]);

    const interim = {
      'ifrs-full': {
        Revenue: {
          units: {
            USD: [
              {
                start: '2024-01-01',
                end: '2024-06-30',
                val: 1,
                fy: null,
                fp: null,
                form: '6-K',
                filed: '2024-10-18',
              },
            ],
          },
        },
      },
    };
    expect(extractMetric(interim, ['Revenue'], 'Q')).toEqual([]);
  });

  test('keeps US 10-K and 10-Q support', () => {
    const facts = {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              {
                end: '2024-12-31',
                val: 100,
                fy: 2024,
                fp: 'FY',
                form: '10-K',
                filed: '2025-02-01',
                frame: 'CY2024',
              },
              {
                end: '2025-03-31',
                val: 30,
                fy: 2025,
                fp: 'Q1',
                form: '10-Q',
                filed: '2025-05-01',
                // Calendar frame differs from the issuer's fiscal label.
                frame: 'CY2024Q4',
              },
            ],
          },
        },
      },
    };

    expect(extractMetric(facts, ['Revenues'], 'Y').map((row) => row._periodKey)).toEqual([
      '2024',
    ]);
    expect(extractMetric(facts, ['Revenues'], 'Q').map((row) => row._periodKey).sort()).toEqual([
      '2024-FY',
      '2025-Q1',
    ]);
  });
});
