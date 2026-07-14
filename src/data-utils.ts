export type DataMode = 'Y' | 'Q' | 'I';

export type ExtractedFact = Record<string, any> & {
  _periodKey: string;
  _periodLabel: string;
  _taxonomy: string;
  _concept: string;
  _secUnit: string;
  _currency: string | null;
};

export type ReportingInfo = {
  availableTaxonomies: string[];
  availableForms: string[];
  availableCurrencies: string[];
  usedTaxonomies: string[];
  usedForms: string[];
  usedCurrencies: string[];
};

/**
 * Return the taxonomy map from either a raw SEC companyfacts response or the
 * repository's data/{TICKER}.json cache wrapper. SEC companyfacts responses do
 * not include a ticker/symbol; callers attach that metadata from the ticker map.
 */
export function normalizeFacts(raw: any): any {
  if (!raw) return null;
  if (raw.facts && typeof raw.facts === 'object') return raw.facts;
  return raw;
}

function taxonomyEntries(facts: any): Array<[string, any]> {
  const normalized = normalizeFacts(facts);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return [];

  const entries = Object.entries(normalized).filter(
    ([, taxonomy]) => taxonomy && typeof taxonomy === 'object' && !Array.isArray(taxonomy),
  ) as Array<[string, any]>;
  const priority: Record<string, number> = { 'us-gaap': 0, 'ifrs-full': 1 };
  return entries.sort(
    ([a], [b]) => (priority[a] ?? 10) - (priority[b] ?? 10) || a.localeCompare(b),
  );
}

/** Accept any non-empty SEC fact taxonomy, not only us-gaap/ifrs-full. */
export function hasUsableFacts(raw: any): boolean {
  return taxonomyEntries(raw).some(([, taxonomy]) =>
    Object.values(taxonomy).some((fact: any) =>
      Object.values(fact?.units || {}).some((rows) => Array.isArray(rows) && rows.length > 0),
    ),
  );
}

/** Resolve ./data next to the deployed app, including GitHub Pages subpaths. */
export function staticDataUrl(fileName: string, baseUri: string): string {
  const appBase = new URL('.', baseUri);
  return new URL(`./data/${encodeURIComponent(fileName)}`, appBase).toString();
}

function baseForm(form: unknown): string {
  return String(form || '').replace(/\/A$/, '');
}

const ANNUAL_FORMS = new Set(['10-K', '20-F', '40-F']);

function isAnnualFiling(row: any): boolean {
  return ANNUAL_FORMS.has(baseForm(row?.form)) && row?.fp === 'FY';
}

function annualPeriodKey(row: any): string | null {
  const frame = String(row?.frame || '');
  const framedYear = frame.match(/^CY(\d{4})(?:Q[1-4]I)?$/)?.[1];
  if (framedYear) return framedYear;

  const endYear = String(row?.end || '').match(/^(\d{4})-/)?.[1];
  if (endYear) return endYear;

  const fy = Number(row?.fy);
  return Number.isFinite(fy) ? String(fy) : null;
}

function interimLabel(row: any, end: string): string {
  const start = String(row?.start || '');
  const sameYear = start.slice(0, 4) && start.slice(0, 4) === end.slice(0, 4);
  if (sameYear && start.slice(5) === '01-01') {
    const monthDay = end.slice(5);
    if (monthDay === '03-31') return `${end.slice(0, 4)} Q1 YTD`;
    if (monthDay === '06-30') return `${end.slice(0, 4)} H1`;
    if (monthDay === '09-30') return `${end.slice(0, 4)} 9M`;
    if (monthDay === '12-31') return `${end.slice(0, 4)} FY YTD`;
  }
  if (start) return `${start}–${end}`;

  const frame = String(row?.frame || '');
  const framedQuarter = frame.match(/^CY(\d{4})Q([1-4])I?$/);
  if (framedQuarter) return `${framedQuarter[1]} Q${framedQuarter[2]}`;
  return end;
}

function periodInfo(row: any, mode: DataMode): { key: string; label: string } | null {
  if (mode === 'Y') {
    const year = annualPeriodKey(row);
    return year ? { key: year, label: year } : null;
  }

  if (mode === 'I') {
    const end = String(row?.end || row?.filed || '');
    return end ? { key: end, label: interimLabel(row, end) } : null;
  }

  if (isAnnualFiling(row)) {
    const year = annualPeriodKey(row);
    return year ? { key: `${year}-FY`, label: year } : null;
  }

  // Preserve the issuer's fiscal quarter labels when SEC provides them.
  const fy = Number(row?.fy);
  const fp = String(row?.fp || '');
  if (Number.isFinite(fy) && /^Q[1-4]$/.test(fp)) {
    return { key: `${fy}-${fp}`, label: `${fy} ${fp}` };
  }

  const frame = String(row?.frame || '');
  const framedQuarter = frame.match(/^CY(\d{4})Q([1-4])I?$/);
  if (framedQuarter) {
    return {
      key: `${framedQuarter[1]}-Q${framedQuarter[2]}`,
      label: `${framedQuarter[1]} Q${framedQuarter[2]}`,
    };
  }
  return null;
}

function rowIsSupported(row: any, mode: DataMode): boolean {
  if (mode === 'Y') return isAnnualFiling(row);
  if (mode === 'I') return baseForm(row?.form) === '6-K';
  return baseForm(row?.form) === '10-Q' || isAnnualFiling(row);
}

function unitRank(unit: string): number {
  if (unit === 'USD' || unit === 'USD/shares') return 0;
  if (unit === 'shares' || unit === 'pure') return 1;
  if (/^[A-Z]{3}(?:\/shares)?$/.test(unit)) return 2;
  return 3;
}

export function currencyFromUnit(unit: string): string | null {
  if (unit === 'shares' || unit === 'pure') return null;
  const currency = unit.match(/^([A-Z]{3})(?:\/shares)?$/)?.[1];
  return currency || 'non-USD';
}

type UnitCandidate = {
  taxonomy: string;
  concept: string;
  unit: string;
  rows: any[];
};

/**
 * Extract one dashboard metric from every returned SEC taxonomy.
 *
 * USD wins when it exists anywhere among the recognized concept aliases. If no
 * USD series exists, the best local-currency/non-USD series is retained and its
 * unit metadata is returned for chart labeling. Annual 10-K/20-F/40-F, quarterly
 * 10-Q, and foreign interim 6-K reports are kept in distinct display modes.
 */
export function extractMetric(facts: any, keys: string[], mode: DataMode): ExtractedFact[] {
  const candidates: UnitCandidate[] = [];
  for (const [taxonomyName, taxonomy] of taxonomyEntries(facts)) {
    for (const concept of keys) {
      for (const [unit, rows] of Object.entries(taxonomy?.[concept]?.units || {})) {
        if (!Array.isArray(rows)) continue;
        const supportedRows = rows.filter((row) => rowIsSupported(row, mode));
        if (supportedRows.length) {
          candidates.push({ taxonomy: taxonomyName, concept, unit, rows: supportedRows });
        }
      }
    }
  }
  if (!candidates.length) return [];

  const bestRank = Math.min(...candidates.map((candidate) => unitRank(candidate.unit)));
  const selectedUnit = candidates.find((candidate) => unitRank(candidate.unit) === bestRank)?.unit;
  if (!selectedUnit) return [];

  const currency = currencyFromUnit(selectedUnit);
  const rows: ExtractedFact[] = [];
  for (const candidate of candidates.filter((item) => item.unit === selectedUnit)) {
    for (const row of candidate.rows) {
      if (!rowIsSupported(row, mode)) continue;
      const period = periodInfo(row, mode);
      if (!period) continue;
      rows.push({
        ...row,
        _periodKey: period.key,
        _periodLabel: period.label,
        _taxonomy: candidate.taxonomy,
        _concept: candidate.concept,
        _secUnit: candidate.unit,
        _currency: currency,
      });
    }
  }

  // Newest filing wins for each actual period. Using the period end/frame is
  // important: comparative facts in a 20-F share that filing's `fy` value.
  rows.sort((a, b) => {
    const filed = +new Date(b.filed || 0) - +new Date(a.filed || 0);
    if (filed) return filed;
    // SEC frames generally identify the discrete (not YTD) quarterly value.
    return Number(Boolean(b.frame)) - Number(Boolean(a.frame));
  });
  const byPeriod = new Map<string, ExtractedFact>();
  for (const row of rows) {
    if (!byPeriod.has(row._periodKey)) byPeriod.set(row._periodKey, row);
  }
  return Array.from(byPeriod.values());
}

function sorted(values: Set<string>): string[] {
  return Array.from(values).sort();
}

/** Describe both what SEC returned and what the current dashboard mode used. */
export function inspectReporting(facts: any, usedRows: ExtractedFact[]): ReportingInfo {
  const availableTaxonomies = new Set<string>();
  const availableForms = new Set<string>();
  const availableCurrencies = new Set<string>();

  for (const [taxonomyName, taxonomy] of taxonomyEntries(facts)) {
    availableTaxonomies.add(taxonomyName);
    for (const fact of Object.values(taxonomy) as any[]) {
      for (const [unit, rows] of Object.entries(fact?.units || {})) {
        const currency = currencyFromUnit(unit);
        if (currency) availableCurrencies.add(currency);
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const form = baseForm(row?.form);
          if (form) availableForms.add(form);
        }
      }
    }
  }

  return {
    availableTaxonomies: sorted(availableTaxonomies),
    availableForms: sorted(availableForms),
    availableCurrencies: sorted(availableCurrencies),
    usedTaxonomies: sorted(new Set(usedRows.map((row) => row._taxonomy).filter(Boolean))),
    usedForms: sorted(new Set(usedRows.map((row) => baseForm(row.form)).filter(Boolean))),
    usedCurrencies: sorted(new Set(usedRows.map((row) => row._currency).filter(Boolean) as string[])),
  };
}
