import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import {
  detectPrimaryCurrency,
  extractMetric,
  hasUsableFacts,
  inspectReporting,
  normalizeFacts,
  periodLabels,
  staticDataUrl,
  totalDebt,
  withGrossProfitFallback,
} from './data-utils';

function loadFixture(name: string): any | null {
  const url = new URL(`../data/fundamentals/${name}.json`, import.meta.url);
  if (!existsSync(url)) return null;
  return JSON.parse(readFileSync(url, 'utf8'));
}

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
    ).toBe('https://daggerok.github.io/fundamentals/data/fundamentals/company_tickers.json');
    expect(staticDataUrl('TSM.json', 'https://daggerok.github.io/fundamentals/index.html')).toBe(
      'https://daggerok.github.io/fundamentals/data/fundamentals/TSM.json',
    );
  });

  test('still resolves from the root in local development', () => {
    expect(staticDataUrl('AAPL.json', 'http://localhost:1234/')).toBe(
      'http://localhost:1234/data/fundamentals/AAPL.json',
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
                start: '2024-01-01',
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
                start: '2022-01-01',
                end: '2022-12-31',
                val: 73_670_400_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
                frame: 'CY2022',
              },
              {
                start: '2023-01-01',
                end: '2023-12-31',
                val: 70_598_800_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
              },
              {
                start: '2024-01-01',
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
                start: '2023-01-01',
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
      '2022-12-31': 73_670_400_000,
      '2023-12-31': 70_598_800_000,
      '2024-12-31': 88_268_000_000,
    });
    expect(Object.fromEntries(periodLabels(rows, 'Y'))).toEqual({
      '2022-12-31': '2022',
      '2023-12-31': '2023',
      '2024-12-31': '2024',
    });
  });

  test('extracts usable annual metrics from the repository TSM cache', () => {
    const doc = loadFixture('TSM');
    if (!doc) return;
    const facts = normalizeFacts(doc);

    const primaryCurrency = detectPrimaryCurrency(facts, 'Y');
    const revenue = extractMetric(facts, ['Revenue'], 'Y', {
      preferUsd: true,
      preferredCurrency: primaryCurrency,
    });
    const localRevenue = extractMetric(facts, ['Revenue'], 'Y', {
      preferUsd: false,
      preferredCurrency: primaryCurrency,
    });
    const assets = extractMetric(facts, ['Assets'], 'Y');
    const netIncome = extractMetric(facts, ['ProfitLoss'], 'Y');
    const eps = extractMetric(facts, ['BasicEarningsLossPerShare'], 'Y');
    const interimRevenue = extractMetric(facts, ['Revenue'], 'I');

    expect(primaryCurrency).toBe('TWD');
    expect(revenue.length).toBeGreaterThanOrEqual(5);
    expect(localRevenue.length).toBeGreaterThanOrEqual(5);
    expect(revenue[0]._currency).toBe('USD');
    expect(localRevenue[0]._currency).toBe('TWD');
    expect(assets.length).toBeGreaterThanOrEqual(5);
    expect(netIncome.length).toBeGreaterThanOrEqual(5);
    expect(eps.length).toBeGreaterThanOrEqual(5);
    expect(interimRevenue.length).toBeGreaterThanOrEqual(1);
    expect(interimRevenue.every((row) => row.form === '6-K')).toBe(true);
    expect(revenue.find((row) => row._periodKey === '2024-12-31')?.val).toBe(88_268_000_000);
    expect(localRevenue.find((row) => row._periodKey === '2024-12-31')?.val).toBe(
      2_894_307_700_000,
    );
  });

  test('detects USD as the primary currency for a US issuer', () => {
    const doc = loadFixture('AAPL');
    if (!doc) return;
    expect(detectPrimaryCurrency(normalizeFacts(doc), 'Y')).toBe('USD');
  });

  test('keeps ASML revenue in EUR because response-wide USD belongs to other facts', () => {
    const doc = loadFixture('ASML');
    if (!doc) return;
    // Static files keep only the dashboard concepts (plan 04-4.2), which drops ASML's own USD facts.
    // One USD fact outside those concepts keeps the "USD elsewhere in the response" case for both shapes.
    const otherUsdFact = { end: '2024-12-31', val: 1, fy: 2024, fp: 'FY', form: '20-F', filed: '2025-02-12' };
    const facts = { ...normalizeFacts(doc), 'test-extra': { OtherUsdFact: { units: { USD: [otherUsdFact] } } } };
    const primaryCurrency = detectPrimaryCurrency(facts, 'Y');
    const revenue = extractMetric(
      facts,
      [
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'SalesRevenueNet',
        'SalesRevenueGoodsNet',
      ],
      'Y',
      { preferUsd: true, preferredCurrency: primaryCurrency },
    );
    const reporting = inspectReporting(facts, revenue);

    expect(primaryCurrency).toBe('EUR');
    expect(reporting.availableCurrencies).toContain('USD');
    expect(reporting.availableCurrencies).not.toContain('non-USD');
    expect(revenue.length).toBeGreaterThan(0);
    expect(revenue.every((row) => row._currency === 'EUR')).toBe(true);
    expect(reporting.usedCurrencies).toEqual(['EUR']);
  });

  test('keeps local currency when USD is unavailable', () => {
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
    const rows = extractMetric(localCurrencyOnly, ['DividendsPaid'], 'Y');
    expect(rows).toHaveLength(1);
    expect(rows[0]._secUnit).toBe('TWD');
    expect(rows[0]._currency).toBe('TWD');
  });

  test('prefers USD across aliases but accepts custom taxonomies', () => {
    const facts = {
      'custom-company': {
        LocalRevenue: {
          units: {
            TWD: [
              {
                end: '2024-12-31',
                val: 3_000,
                fy: 2024,
                fp: 'FY',
                form: '20-F',
                filed: '2025-04-17',
              },
            ],
          },
        },
        Revenue: {
          units: {
            USD: [
              {
                end: '2024-12-31',
                val: 100,
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
    expect(hasUsableFacts(facts)).toBe(true);
    const rows = extractMetric(facts, ['LocalRevenue', 'Revenue'], 'Y');
    const localRows = extractMetric(facts, ['LocalRevenue', 'Revenue'], 'Y', {
      preferUsd: false,
      preferredCurrency: 'TWD',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe(100);
    expect(rows[0]._currency).toBe('USD');
    expect(rows[0]._taxonomy).toBe('custom-company');
    expect(localRows).toHaveLength(1);
    expect(localRows[0].val).toBe(3_000);
    expect(localRows[0]._currency).toBe('TWD');
  });

  test('keeps 6-K facts in a separate interim mode', () => {
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
    const rows = extractMetric(interim, ['Revenue'], 'I');
    expect(rows).toHaveLength(1);
    expect(rows[0]._periodKey).toBe('2024-06-30|2024-01-01');
    expect(rows[0]._periodLabel).toBe('2024 H1');
    expect(inspectReporting(interim, rows)).toEqual({
      availableTaxonomies: ['ifrs-full'],
      availableForms: ['6-K'],
      availableCurrencies: ['USD'],
      usedTaxonomies: ['ifrs-full'],
      usedForms: ['6-K'],
      usedCurrencies: ['USD'],
    });
  });

  test('keeps US 10-K and 10-Q support', () => {
    const facts = {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              {
                start: '2024-01-01',
                end: '2024-12-31',
                val: 100,
                fy: 2024,
                fp: 'FY',
                form: '10-K',
                filed: '2025-02-01',
                frame: 'CY2024',
              },
              {
                start: '2025-01-01',
                end: '2025-03-31',
                val: 30,
                fy: 2025,
                fp: 'Q1',
                form: '10-Q',
                filed: '2025-05-01',
                frame: 'CY2025Q1',
              },
            ],
          },
        },
      },
    };

    expect(extractMetric(facts, ['Revenues'], 'Y').map((row) => row._periodKey)).toEqual([
      '2024-12-31',
    ]);
    const quarterly = extractMetric(facts, ['Revenues'], 'Q');
    expect(quarterly.map((row) => row._periodKey).sort()).toEqual(['2024-12-31|FY', '2025-03-31']);
    expect(Object.fromEntries(periodLabels(quarterly, 'Q'))).toEqual({
      '2024-12-31|FY': '2024 FY',
      '2025-03-31': '2025 Q1',
    });
  });
});

const usGaap = (concept: string, rows: object[], unit = 'USD') => ({
  'us-gaap': { [concept]: { units: { [unit]: rows } } },
});
const byKey = (rows: Array<{ _periodKey: string; val?: unknown }>) =>
  Object.fromEntries(rows.map((row) => [row._periodKey, row.val]));

describe('period keys come from the fact dates, not the filing fy/fp (real SEC rows)', () => {
  // AAPL revenue: the fy 2026 Q1 10-Q also reports the prior-year quarter, and the Q3 10-Q a
  // 9-month total, all under fy 2026.
  const aaplRevenue = usGaap('RevenueFromContractWithCustomerExcludingAssessedTax', [
    { start: '2024-09-29', end: '2025-09-27', val: 416161000000, accn: '0000320193-25-000079', fy: 2025, fp: 'FY', form: '10-K', filed: '2025-10-31', frame: 'CY2025' },
    { start: '2024-09-29', end: '2024-12-28', val: 124300000000, accn: '0000320193-26-000006', fy: 2026, fp: 'Q1', form: '10-Q', filed: '2026-01-30', frame: 'CY2024Q4' },
    { start: '2025-09-28', end: '2025-12-27', val: 143756000000, accn: '0000320193-26-000006', fy: 2026, fp: 'Q1', form: '10-Q', filed: '2026-01-30', frame: 'CY2025Q4' },
    { start: '2024-09-29', end: '2025-06-28', val: 313695000000, accn: '0000320193-26-000020', fy: 2026, fp: 'Q3', form: '10-Q', filed: '2026-07-31' },
    { start: '2025-03-30', end: '2025-06-28', val: 94036000000, accn: '0000320193-26-000020', fy: 2026, fp: 'Q3', form: '10-Q', filed: '2026-07-31', frame: 'CY2025Q2' },
    { start: '2025-09-28', end: '2026-06-27', val: 364357000000, accn: '0000320193-26-000020', fy: 2026, fp: 'Q3', form: '10-Q', filed: '2026-07-31' },
    { start: '2026-03-29', end: '2026-06-27', val: 109417000000, accn: '0000320193-26-000020', fy: 2026, fp: 'Q3', form: '10-Q', filed: '2026-07-31', frame: 'CY2026Q2' },
  ]);

  test('AAPL: the fiscal quarter shows its own 3-month value, comparatives and YTD stay out', () => {
    const rows = extractMetric(aaplRevenue, ['RevenueFromContractWithCustomerExcludingAssessedTax'], 'Q');
    expect(byKey(rows)).toEqual({
      '2025-09-27|FY': 416161000000,
      '2024-12-28': 124300000000,
      '2025-12-27': 143756000000,
      '2025-06-28': 94036000000,
      '2026-06-27': 109417000000,
    });
    const labels = periodLabels(rows, 'Q');
    expect(labels.get('2025-12-27')).toBe('2026 Q1');
    expect(labels.get('2024-12-28')).toBe('2025 Q1');
    expect(labels.get('2026-06-27')).toBe('2026 Q3');
    expect(labels.get('2025-09-27|FY')).toBe('2025 FY');
  });

  test('AAPL: Q2 and Q3 operating cash flow are differences of year-to-date totals', () => {
    const ocf = usGaap('NetCashProvidedByUsedInOperatingActivities', [
      { start: '2025-09-28', end: '2025-12-27', val: 53925000000, accn: '0000320193-26-000006', fy: 2026, fp: 'Q1', form: '10-Q', filed: '2026-01-30' },
      { start: '2025-09-28', end: '2026-03-28', val: 82627000000, accn: '0000320193-26-000013', fy: 2026, fp: 'Q2', form: '10-Q', filed: '2026-05-01' },
      { start: '2025-09-28', end: '2026-06-27', val: 116996000000, accn: '0000320193-26-000020', fy: 2026, fp: 'Q3', form: '10-Q', filed: '2026-07-31' },
    ]);
    const rows = extractMetric(ocf, ['NetCashProvidedByUsedInOperatingActivities'], 'Q');
    expect(byKey(rows)).toEqual({
      '2025-12-27': 53925000000,
      '2026-03-28': 28702000000,
      '2026-06-27': 34369000000,
    });
    expect(rows.map((row) => row._derived)).toEqual([false, true, true]);
  });

  test('per-share values are never derived from year-to-date differences', () => {
    const eps = usGaap(
      'EarningsPerShareDiluted',
      [
        { start: '2025-09-28', end: '2025-12-27', val: 2.84, accn: '0000320193-26-000006', fy: 2026, fp: 'Q1', form: '10-Q', filed: '2026-01-30' },
        { start: '2025-09-28', end: '2026-03-28', val: 4.5, accn: '0000320193-26-000013', fy: 2026, fp: 'Q2', form: '10-Q', filed: '2026-05-01' },
      ],
      'USD/shares',
    );
    expect(byKey(extractMetric(eps, ['EarningsPerShareDiluted'], 'Q'))).toEqual({ '2025-12-27': 2.84 });
  });

  test('CRWD: a filing tagged with the wrong fy does not mislabel or merge quarters', () => {
    // CRWD tagged its fiscal 2026 Q1 10-Q (quarter ending 2025-04-30) as fy 2025, like fiscal 2025 Q1.
    const crwd = usGaap('RevenueFromContractWithCustomerIncludingAssessedTax', [
      { start: '2023-02-01', end: '2023-04-30', val: 692580000, accn: '0001535527-24-000013', fy: 2025, fp: 'Q1', form: '10-Q', filed: '2024-06-05', frame: 'CY2023Q1' },
      { start: '2024-02-01', end: '2024-04-30', val: 921036000, accn: '0001535527-24-000013', fy: 2025, fp: 'Q1', form: '10-Q', filed: '2024-06-05' },
      { start: '2024-02-01', end: '2024-07-31', val: 1884908000, accn: '0001535527-24-000020', fy: 2025, fp: 'Q2', form: '10-Q', filed: '2024-08-29' },
      { start: '2024-05-01', end: '2024-07-31', val: 963872000, accn: '0001535527-24-000020', fy: 2025, fp: 'Q2', form: '10-Q', filed: '2024-08-29' },
      { start: '2024-02-01', end: '2025-01-31', val: 3953624000, accn: '0001535527-26-000010', fy: 2026, fp: 'FY', form: '10-K', filed: '2026-03-05', frame: 'CY2024' },
      { start: '2024-02-01', end: '2024-04-30', val: 921036000, accn: '0001535527-25-000019', fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-06-04', frame: 'CY2024Q1' },
      { start: '2025-02-01', end: '2025-04-30', val: 1103434000, accn: '0001535527-25-000019', fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-06-04' },
    ]);
    const rows = extractMetric(crwd, ['RevenueFromContractWithCustomerIncludingAssessedTax'], 'Q');
    expect(byKey(rows)['2025-04-30']).toBe(1103434000);
    expect(byKey(rows)['2024-04-30']).toBe(921036000);
    expect(Object.fromEntries(periodLabels(rows, 'Q'))).toEqual({
      '2023-04-30': '2024 Q1',
      '2024-04-30': '2025 Q1',
      '2024-07-31': '2025 Q2',
      '2025-01-31|FY': '2025 FY',
      '2025-04-30': '2026 Q1',
    });
  });

  test('6-K: 3-month and year-to-date values ending on the same date stay apart', () => {
    // ASM (Avino) 6-K for the quarter ending 2025-06-30, revenue and the balance sheet.
    const asm = {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              { start: '2025-01-01', end: '2025-06-30', val: 40641000, accn: '0001477932-25-005795', fy: 2025, fp: 'Q2', form: '6-K', filed: '2025-08-13' },
              { start: '2025-04-01', end: '2025-06-30', val: 21805000, accn: '0001477932-25-005795', fy: 2025, fp: 'Q2', form: '6-K', filed: '2025-08-13' },
            ],
          },
        },
        Assets: {
          units: { USD: [{ end: '2025-06-30', val: 1, accn: '0001477932-25-005795', fy: 2025, fp: 'Q2', form: '6-K', filed: '2025-08-13' }] },
        },
      },
    };
    expect(byKey(extractMetric(asm, ['Revenues'], 'I'))).toEqual({
      '2025-06-30|2025-01-01': 40641000,
      '2025-06-30|2025-04-01': 21805000,
    });
    // The balance sheet belongs to both columns.
    expect(Object.keys(byKey(extractMetric(asm, ['Assets'], 'I'))).sort()).toEqual([
      '2025-06-30|2025-01-01',
      '2025-06-30|2025-04-01',
    ]);
  });

  test('annual mode keeps only 52/53-week durations and labels by the fiscal year', () => {
    // ABBV tags GrossProfit in its 10-K only for the fourth quarter.
    const abbv = {
      'us-gaap': {
        GrossProfit: {
          units: { USD: [{ start: '2025-10-01', end: '2025-12-31', val: 12066000000, accn: '0001551152-26-000008', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-20' }] },
        },
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { USD: [{ start: '2025-01-01', end: '2025-12-31', val: 61160000000, accn: '0001551152-26-000008', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-20' }] },
        },
        CostOfGoodsAndServicesSold: {
          units: { USD: [{ start: '2025-01-01', end: '2025-12-31', val: 18204000000, accn: '0001551152-26-000008', fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-20' }] },
        },
      },
    };
    const grossProfit = extractMetric(abbv, ['GrossProfit'], 'Y');
    expect(grossProfit).toEqual([]);
    const revenue = extractMetric(abbv, ['RevenueFromContractWithCustomerExcludingAssessedTax'], 'Y');
    const cost = extractMetric(abbv, ['CostOfGoodsAndServicesSold'], 'Y');
    expect(byKey(withGrossProfitFallback(grossProfit, revenue, cost))).toEqual({ '2025-12-31': 42956000000 });
  });
});

describe('period keys on the repository cache', () => {
  test('AAPL and NVDA quarters match the reported quarters', () => {
    const aapl = loadFixture('AAPL');
    const nvda = loadFixture('NVDA');
    if (!aapl || !nvda) return;
    const revenue = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'];
    const aaplQ = extractMetric(normalizeFacts(aapl), revenue, 'Q');
    const nvdaQ = extractMetric(normalizeFacts(nvda), revenue, 'Q');
    const valueOf = (rows: any[], label: string) => {
      const labels = periodLabels(rows, 'Q');
      return rows.find((row) => labels.get(row._periodKey) === label)?.val;
    };
    expect(valueOf(aaplQ, '2026 Q1')).toBe(143756000000);
    expect(valueOf(aaplQ, '2026 Q3')).toBe(109417000000);
    expect(valueOf(nvdaQ, '2027 Q2')).toBe(96221000000);
  });

  test('WMT: revenue and assets of one fiscal year share one annual column', () => {
    const doc = loadFixture('WMT');
    if (!doc) return;
    const facts = normalizeFacts(doc);
    const revenue = extractMetric(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'], 'Y');
    const assets = extractMetric(facts, ['Assets'], 'Y');
    const labels = periodLabels([...revenue, ...assets], 'Y');
    expect(labels.get('2026-01-31')).toBe('2026');
    expect(revenue.find((row) => row._periodKey === '2026-01-31')?.val).toBe(706413000000);
    expect(assets.some((row) => row._periodKey === '2026-01-31')).toBe(true);
    expect(new Set(labels.values()).size).toBe(labels.size);
  });
});

describe('concept priority across aliases (real SEC rows)', () => {
  const tenK = (accn: string, filed: string, fy: number) => ({ accn, filed, fy, fp: 'FY', form: '10-K' });

  test('APP: NetIncomeLoss beats an alias of the same filing that carries a frame', () => {
    const facts = {
      'us-gaap': {
        NetIncomeLoss: { units: { USD: [{ start: '2024-01-01', end: '2024-12-31', val: 1579776000, ...tenK('0001751008-26-000010', '2026-02-19', 2025) }] } },
        NetIncomeLossAvailableToCommonStockholdersBasic: {
          units: { USD: [{ start: '2024-01-01', end: '2024-12-31', val: 1577059000, ...tenK('0001751008-26-000010', '2026-02-19', 2025), frame: 'CY2024' }] },
        },
        ProfitLoss: { units: { USD: [{ start: '2024-01-01', end: '2024-12-31', val: 1579776000, ...tenK('0001751008-25-000018', '2025-02-27', 2024), frame: 'CY2024' }] } },
      },
    };
    const rows = extractMetric(facts, ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'], 'Y');
    expect(rows).toHaveLength(1);
    expect(rows[0]._concept).toBe('NetIncomeLoss');
    expect(rows[0].val).toBe(1579776000);
  });

  test('a lower-priority alias in a newer filing does not replace the preferred concept', () => {
    const facts = {
      'us-gaap': {
        EarningsPerShareBasic: { units: { 'USD/shares': [{ start: '2024-01-01', end: '2024-12-31', val: 2.0, ...tenK('a-1', '2025-02-01', 2024) }] } },
        EarningsPerShareDiluted: { units: { 'USD/shares': [{ start: '2024-01-01', end: '2024-12-31', val: 1.9, ...tenK('a-2', '2026-02-01', 2025) }] } },
      },
    };
    const rows = extractMetric(facts, ['EarningsPerShareBasic', 'EarningsPerShareDiluted'], 'Y');
    expect(rows.map((row) => [row._concept, row.val])).toEqual([['EarningsPerShareBasic', 2.0]]);
  });

  test('ALLY revenue: the largest revenue of the filing is the total, not fee revenue', () => {
    const facts = {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { USD: [{ start: '2025-01-01', end: '2025-12-31', val: 1244000000, ...tenK('0000040729-26-000005', '2026-02-25', 2025), frame: 'CY2025' }] },
        },
        Revenues: {
          units: { USD: [{ start: '2025-01-01', end: '2025-12-31', val: 7914000000, ...tenK('0000040729-26-000005', '2026-02-25', 2025), frame: 'CY2025' }] },
        },
      },
    };
    const keys = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'];
    expect(extractMetric(facts, keys, 'Y')[0].val).toBe(1244000000);
    expect(extractMetric(facts, keys, 'Y', {}, { maxOf: keys })[0].val).toBe(7914000000);
  });

  test('PM revenue: excise-inclusive revenue is only a fallback outside maxOf', () => {
    const row = { start: '2020-01-01', end: '2020-12-31', ...tenK('0001413329-23-000025', '2023-02-10', 2022), frame: 'CY2020' };
    const facts = {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ ...row, val: 28694000000 }] } },
        RevenueFromContractWithCustomerIncludingAssessedTax: { units: { USD: [{ ...row, val: 76047000000 }] } },
      },
    };
    const keys = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'];
    expect(extractMetric(facts, keys, 'Y', {}, { maxOf: [keys[0]] })[0].val).toBe(28694000000);
    const excluded = { 'us-gaap': { RevenueFromContractWithCustomerIncludingAssessedTax: facts['us-gaap'].RevenueFromContractWithCustomerIncludingAssessedTax } };
    expect(extractMetric(excluded, keys, 'Y', {}, { maxOf: [keys[0]] })[0].val).toBe(76047000000);
  });
});

describe('total debt (values in $M from the cache)', () => {
  const parts = (values: Record<string, number>) => (concept: string) => values[concept];

  test('JNJ 2025: noncurrent + DebtCurrent, LongTermDebt already holds the current maturities', () => {
    expect(
      totalDebt(parts({ LongTermDebtNoncurrent: 39438, LongTermDebt: 41438, DebtCurrent: 8500, ShortTermBorrowings: 8495 })),
    ).toBe(47938);
  });

  test('T and TSLA 2025: LongTermDebt is not added to DebtCurrent', () => {
    expect(totalDebt(parts({ LongTermDebt: 134718, DebtCurrent: 9011 }))).toBe(134718);
    expect(totalDebt(parts({ LongTermDebt: 6584, DebtCurrent: 1569 }))).toBe(6584);
  });

  test('without a current part the total LongTermDebt is used, plus separate short-term borrowings', () => {
    expect(totalDebt(parts({ LongTermDebtNoncurrent: 31067, LongTermDebt: 40294 }))).toBe(40294);
    expect(totalDebt(parts({ LongTermDebtNoncurrent: 100, LongTermDebtCurrent: 10, CommercialPaper: 5 }))).toBe(115);
    expect(totalDebt(parts({}))).toBeNull();
  });
});

describe('stock splits (real SEC rows)', () => {
  const nvdaFiling = {
    '23': { accn: '0001045810-23-000017', fy: 2023, fp: 'FY', form: '10-K', filed: '2023-02-24' },
    '24': { accn: '0001045810-24-000029', fy: 2024, fp: 'FY', form: '10-K', filed: '2024-02-21' },
    '25': { accn: '0001045810-25-000023', fy: 2025, fp: 'FY', form: '10-K', filed: '2025-02-26' },
  };
  const fy23 = { start: '2022-01-31', end: '2023-01-29' };
  const fy24 = { start: '2023-01-30', end: '2024-01-28' };
  // NVDA split 10-for-1 in June 2024: the 2025 10-K restates FY2023 and FY2024 share counts.
  const nvda = {
    'us-gaap': {
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        units: {
          shares: [
            { ...fy23, val: 2507000000, ...nvdaFiling['23'] },
            { ...fy23, val: 2507000000, ...nvdaFiling['24'] },
            { ...fy23, val: 25070000000, ...nvdaFiling['25'] },
            { ...fy24, val: 2494000000, ...nvdaFiling['24'] },
            { ...fy24, val: 24940000000, ...nvdaFiling['25'] },
          ],
        },
      },
      CommonStockSharesOutstanding: {
        units: {
          shares: [
            { end: '2023-01-29', val: 2466000000, ...nvdaFiling['23'] },
            { end: '2023-01-29', val: 2466000000, ...nvdaFiling['24'] },
            { end: '2024-01-28', val: 2464000000, ...nvdaFiling['24'] },
            { end: '2024-01-28', val: 24643000000, ...nvdaFiling['25'] },
          ],
        },
      },
      // FY2023 basic EPS only from the pre-split 10-Ks (the 2025 10-K row is left out on purpose).
      EarningsPerShareBasic: {
        units: {
          'USD/shares': [
            { ...fy23, val: 1.76, ...nvdaFiling['23'] },
            { ...fy23, val: 1.76, ...nvdaFiling['24'] },
            { ...fy24, val: 1.21, ...nvdaFiling['25'] },
          ],
        },
      },
    },
  };

  test('NVDA: pre-split share counts and EPS are restated in the newest share basis', () => {
    expect(byKey(extractMetric(nvda, ['CommonStockSharesOutstanding'], 'Y'))).toEqual({
      '2023-01-29': 24660000000,
      '2024-01-28': 24643000000,
    });
    const eps = extractMetric(nvda, ['EarningsPerShareBasic'], 'Y');
    expect(eps.find((row) => row._periodKey === '2023-01-29')?.val).toBeCloseTo(0.176, 6);
    expect(eps.find((row) => row._periodKey === '2023-01-29')?._splitFactor).toBe(10);
    expect(eps.find((row) => row._periodKey === '2024-01-28')?.val).toBe(1.21);
  });

  test('NNN: one inconsistent share count is not a split when the other counts agree', () => {
    const filing = (accn: string, filed: string, form = '10-Q') => ({ accn, filed, form, fy: 2012, fp: 'Q1' });
    const tenK = { accn: '0000750561-12-000004', filed: '2012-02-24', form: '10-K', fy: 2011, fp: 'FY' };
    const tenK13 = { accn: '0000750561-13-000004', filed: '2013-02-22', form: '10-K', fy: 2012, fp: 'FY' };
    const facts = {
      'us-gaap': {
        CommonStockSharesOutstanding: {
          units: {
            shares: [
              { end: '2011-12-31', val: 83613289, ...tenK },
              { end: '2011-12-31', val: 104754859, ...filing('0000750561-12-000010', '2012-05-04') },
              { end: '2011-12-31', val: 104754859, ...tenK13 },
            ],
          },
        },
        WeightedAverageNumberOfDilutedSharesOutstanding: {
          units: {
            shares: [
              { start: '2010-01-01', end: '2010-12-31', val: 82849362, ...tenK },
              { start: '2010-01-01', end: '2010-12-31', val: 82849362, ...tenK13 },
              { start: '2011-01-01', end: '2011-12-31', val: 88837057, ...tenK },
              { start: '2011-01-01', end: '2011-12-31', val: 88837057, ...tenK13 },
              // Reported only by the 2012 10-K: must keep its value.
              { start: '2009-01-01', end: '2009-12-31', val: 77000000, ...tenK },
            ],
          },
        },
      },
    };
    const rows = extractMetric(facts, ['WeightedAverageNumberOfDilutedSharesOutstanding'], 'Y');
    expect(byKey(rows)).toEqual({ '2009-12-31': 77000000, '2010-12-31': 82849362, '2011-12-31': 88837057 });
    expect(rows.every((row) => row._splitFactor === undefined)).toBe(true);
  });

  test('a share count tagged in thousands is not taken for a 1000-for-1 split', () => {
    const tenK = (accn: string, filed: string) => ({ accn, filed, form: '10-K', fy: 2010, fp: 'FY' });
    const facts = usGaap(
      'WeightedAverageNumberOfDilutedSharesOutstanding',
      [
        { start: '2009-01-01', end: '2009-12-31', val: 5900, ...tenK('a-10', '2010-02-25') },
        { start: '2009-01-01', end: '2009-12-31', val: 5900000000, ...tenK('a-11', '2011-02-25') },
        { start: '2008-01-01', end: '2008-12-31', val: 5800, ...tenK('a-10', '2010-02-25') },
        { start: '2008-01-01', end: '2008-12-31', val: 5800000000, ...tenK('a-11', '2011-02-25') },
        { start: '2007-01-01', end: '2007-12-31', val: 5700, ...tenK('a-10', '2010-02-25') },
      ],
      'shares',
    );
    const rows = extractMetric(facts, ['WeightedAverageNumberOfDilutedSharesOutstanding'], 'Y');
    expect(rows.find((row) => row._periodKey === '2007-12-31')?.val).toBe(5700);
    expect(rows.every((row) => row._splitFactor === undefined)).toBe(true);
  });
});
