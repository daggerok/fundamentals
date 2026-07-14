export type DataMode = 'Y' | 'Q';

export type ExtractedFact = Record<string, any> & {
  _periodKey: string;
};

/**
 * Return the taxonomy map from either a raw SEC companyfacts response or the
 * repository's data/{TICKER}.json cache wrapper. SEC companyfacts responses do
 * not include a ticker/symbol; callers attach that metadata from the ticker map.
 */
export function normalizeFacts(raw: any): any {
  if (!raw) return null;
  if (raw['us-gaap'] || raw['ifrs-full']) return raw;
  if (raw.facts) return raw.facts;
  return raw;
}

/** Resolve static data next to the deployed app, including GitHub Pages subpaths. */
export function staticDataUrl(fileName: string, baseUri: string): string {
  const appBase = new URL('.', baseUri);
  return new URL(`data/${encodeURIComponent(fileName)}`, appBase).toString();
}

function baseForm(form: unknown): string {
  return String(form || '').replace(/\/A$/, '');
}

function isAnnualFiling(row: any): boolean {
  return (baseForm(row?.form) === '10-K' || baseForm(row?.form) === '20-F') && row?.fp === 'FY';
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

function periodKey(row: any, mode: DataMode): string | null {
  if (mode === 'Y') return annualPeriodKey(row);
  if (isAnnualFiling(row)) {
    const year = annualPeriodKey(row);
    return year ? `${year}-FY` : null;
  }

  // Preserve the issuer's fiscal quarter labels when SEC provides them.
  const fy = Number(row?.fy);
  const fp = String(row?.fp || '');
  if (Number.isFinite(fy) && /^Q[1-4]$/.test(fp)) return `${fy}-${fp}`;

  const frame = String(row?.frame || '');
  const framedQuarter = frame.match(/^CY(\d{4})Q([1-4])I?$/);
  if (framedQuarter) return `${framedQuarter[1]}-Q${framedQuarter[2]}`;
  return null;
}

function rowIsSupported(row: any, mode: DataMode): boolean {
  if (mode === 'Y') return isAnnualFiling(row);
  return baseForm(row?.form) === '10-Q' || isAnnualFiling(row);
}

function metricUnits(fact: any): any[] | null {
  return (
    fact?.units?.USD ||
    fact?.units?.['USD/shares'] ||
    fact?.units?.shares ||
    fact?.units?.pure ||
    null
  );
}

/**
 * Extract one dashboard metric from US-GAAP and/or IFRS companyfacts.
 *
 * Dollar-labelled dashboard metrics intentionally use only SEC USD units. If a
 * foreign issuer reports a fact only in its local currency, that metric remains
 * absent instead of being mislabeled as USD. Annual foreign filings (20-F) are
 * supported; 6-K data is not treated as quarterly because it is commonly YTD or
 * half-year data rather than a discrete quarter.
 */
export function extractMetric(facts: any, keys: string[], mode: DataMode): ExtractedFact[] {
  const taxonomies: any[] = [];
  if (facts?.['us-gaap']) taxonomies.push(facts['us-gaap']);
  if (facts?.['ifrs-full']) taxonomies.push(facts['ifrs-full']);
  if (facts?.facts?.['us-gaap']) taxonomies.push(facts.facts['us-gaap']);
  if (facts?.facts?.['ifrs-full']) taxonomies.push(facts.facts['ifrs-full']);

  const rows: ExtractedFact[] = [];
  for (const taxonomy of Array.from(new Set(taxonomies))) {
    for (const key of keys) {
      const units = metricUnits(taxonomy?.[key]);
      if (!units) continue;
      for (const row of units) {
        if (!rowIsSupported(row, mode)) continue;
        const key = periodKey(row, mode);
        if (key) rows.push({ ...row, _periodKey: key });
      }
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
