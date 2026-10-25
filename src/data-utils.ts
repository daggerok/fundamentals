export type DataMode = 'Y' | 'Q' | 'I';

export type ExtractedFact = Record<string, any> & {
  _periodKey: string;
  /** Date-based label; periodLabels() turns Q mode keys into fiscal labels. */
  _periodLabel: string;
  /** fy/fp of the filing that reports this period as its own, null when no such filing is in the data. */
  _fiscal: { fy: number; fp: string } | null;
  /** True for a 10-Q quarter computed as the difference of two year-to-date totals. */
  _derived: boolean;
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

export type CurrencyPreference = {
  /** Prefer SEC-provided USD units for the same recognized metric. No FX conversion. */
  preferUsd?: boolean;
  /** Issuer/reporting currency to prefer when USD preference is disabled or unavailable. */
  preferredCurrency?: string | null;
};

export type ExtractOptions = {
  /**
   * Concepts that are subsets of one another (revenue): for a period the newest filing that
   * reports any of them wins and its largest value is taken. They rank before the other keys.
   */
  maxOf?: string[];
};

/**
 * Return the taxonomy map from either a raw SEC companyfacts response or the
 * repository's data/fundamentals/{TICKER}.json cache wrapper. SEC companyfacts responses do
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

/** Resolve ./data/fundamentals next to the deployed app, including GitHub Pages subpaths. */
export function staticDataUrl(fileName: string, baseUri: string): string {
  const appBase = new URL('.', baseUri);
  return new URL(`./data/fundamentals/${encodeURIComponent(fileName)}`, appBase).toString();
}

function baseForm(form: unknown): string {
  return String(form || '').replace(/\/A$/, '');
}

const ANNUAL_FORMS = new Set(['10-K', '20-F', '40-F']);
const DAY_MS = 86_400_000;
/** A quarter is about 13 weeks (91 days); a fiscal year is 52 or 53 weeks. */
const QUARTER_DAYS = { min: 70, max: 120 }; // 12 to 17 weeks: KR's first quarter has 16
const ANNUAL_DAYS = { min: 340, max: 380 };

function isAnnualFiling(row: any): boolean {
  return ANNUAL_FORMS.has(baseForm(row?.form)) && row?.fp === 'FY';
}

function isQuarterlyFiling(row: any): boolean {
  return baseForm(row?.form) === '10-Q';
}

function isInterimFiling(row: any): boolean {
  return baseForm(row?.form) === '6-K';
}

/** Days between start and end of a duration fact, null for an instant (balance sheet) fact. */
function durationDays(row: any): number | null {
  if (!row?.start || !row?.end) return null;
  const days = (Date.parse(row.end) - Date.parse(row.start)) / DAY_MS;
  return Number.isFinite(days) ? days : null;
}

const within = (days: number | null, range: { min: number; max: number }) =>
  days != null && days >= range.min && days <= range.max;

/** One SEC filing: rows without an accession number (hand-made fixtures) group by form and filed date. */
function filingId(row: any): string {
  return String(row?.accn || `${row?.form}|${row?.filed}`);
}

/**
 * Calendar year of a period end. A 52/53-week year that ends in the first days of
 * January (JNJ 2023-01-01) belongs to the year before, so two such years never share a label.
 */
function endYear(end: string): string {
  const year = Number(end.slice(0, 4));
  return end.slice(5, 7) === '01' && Number(end.slice(8, 10)) <= 14 ? String(year - 1) : String(year);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

type FilingIndex = {
  /** Filing -> its own period end: the latest end of its duration facts (instants if it has none). */
  periodEnd: Map<string, string>;
  /** Annual filing -> ends of its 52/53-week durations (current year and comparatives). */
  annualEnds: Map<string, Set<string>>;
  /** 6-K period end -> starts of the durations that end there (3 months, half year, ...). */
  interimStarts: Map<string, Set<string>>;
};

const filingIndexCache = new WeakMap<object, FilingIndex>();

/** Facts across every concept of the response, so all metrics agree on each filing's period. */
function filingIndex(facts: any): FilingIndex {
  const key = normalizeFacts(facts);
  const cached = key && typeof key === 'object' ? filingIndexCache.get(key) : undefined;
  if (cached) return cached;

  const durationEnd = new Map<string, string>();
  const instantEnd = new Map<string, string>();
  const annualEnds = new Map<string, Set<string>>();
  const interimStarts = new Map<string, Set<string>>();
  const later = (map: Map<string, string>, id: string, end: string) => {
    if (!map.has(id) || end > map.get(id)!) map.set(id, end);
  };
  for (const [, taxonomy] of taxonomyEntries(facts)) {
    for (const fact of Object.values(taxonomy) as any[]) {
      for (const rows of Object.values(fact?.units || {})) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const end = String(row?.end || '');
          if (!end) continue;
          const id = filingId(row);
          const days = durationDays(row);
          if (days == null) {
            later(instantEnd, id, end);
            continue;
          }
          later(durationEnd, id, end);
          if (isAnnualFiling(row) && within(days, ANNUAL_DAYS)) {
            if (!annualEnds.has(id)) annualEnds.set(id, new Set());
            annualEnds.get(id)!.add(end);
          }
          if (isInterimFiling(row)) {
            if (!interimStarts.has(end)) interimStarts.set(end, new Set());
            interimStarts.get(end)!.add(String(row.start));
          }
        }
      }
    }
  }
  const periodEnd = new Map(instantEnd);
  for (const [id, end] of durationEnd) periodEnd.set(id, end);
  const index = { periodEnd, annualEnds, interimStarts };
  if (key && typeof key === 'object') filingIndexCache.set(key, index);
  return index;
}

/** True when the row describes the filing's own period, not a prior-period comparative. */
function isOwnPeriod(row: any, index: FilingIndex): boolean {
  return index.periodEnd.get(filingId(row)) === String(row?.end || '');
}

function interimLabel(start: string, end: string): string {
  const sameYear = start.slice(0, 4) && start.slice(0, 4) === end.slice(0, 4);
  if (sameYear && start.slice(5) === '01-01') {
    const monthDay = end.slice(5);
    if (monthDay === '03-31') return `${end.slice(0, 4)} Q1 YTD`;
    if (monthDay === '06-30') return `${end.slice(0, 4)} H1`;
    if (monthDay === '09-30') return `${end.slice(0, 4)} 9M`;
    if (monthDay === '12-31') return `${end.slice(0, 4)} FY YTD`;
  }
  if (start) return `${start}–${end}`;
  return end;
}

type Fiscal = { fy: number; fp: string };
/** `fiscal` is set only when the row's filing reports this period as its own (not a comparative). */
type PeriodInfo = { key: string; label: string; fiscal?: Fiscal };

/**
 * Periods are keyed by the fact's own dates, never by the filing's fy/fp: a 10-Q
 * also carries the prior-year quarter and year-to-date totals under the same fy/fp.
 * - Y: 52/53-week durations and the balance sheet at those year ends, keyed by end
 * - Q: 13-week durations and the filing's own balance sheet keyed by end, plus annual
 *   rows keyed `${end}|FY`; the fiscal fy/fp come only from the filing whose own period
 *   ends there (see periodLabels)
 * - I: 6-K durations keyed `${end}|${start}` (3 months and year-to-date stay apart); a
 *   balance sheet joins every duration that ends on its date
 */
function periodInfos(row: any, mode: DataMode, index: FilingIndex): PeriodInfo[] {
  const end = String(row?.end || '');
  if (!end) return [];
  const days = durationDays(row);
  const id = filingId(row);

  if (mode === 'I') {
    if (!isInterimFiling(row)) return [];
    if (days != null) {
      const start = String(row.start);
      return [{ key: `${end}|${start}`, label: interimLabel(start, end) }];
    }
    const starts = [...(index.interimStarts.get(end) || [])].sort();
    if (!starts.length) return [{ key: `${end}|`, label: end }];
    return starts.map((start) => ({ key: `${end}|${start}`, label: interimLabel(start, end) }));
  }

  if (isAnnualFiling(row)) {
    const annual =
      days == null
        ? index.annualEnds.get(id)?.has(end) ??
          // An annual filing without 52/53-week durations: keep only its own balance sheet.
          index.periodEnd.get(id) === end
        : within(days, ANNUAL_DAYS);
    if (!annual) return [];
    const fiscal = ownFiscal(row, index, /^FY$/);
    if (mode === 'Y') return [{ key: end, label: endYear(end), fiscal }];
    return [{ key: `${end}|FY`, label: `${end} FY`, fiscal }];
  }

  if (mode !== 'Q' || !isQuarterlyFiling(row)) return [];
  if (days == null ? !isOwnPeriod(row, index) : !within(days, QUARTER_DAYS)) return [];
  return [{ key: end, label: end, fiscal: ownFiscal(row, index, /^Q[1-4]$/) }];
}

function ownFiscal(row: any, index: FilingIndex, fpPattern: RegExp): Fiscal | undefined {
  const fy = Number(row?.fy);
  const fp = String(row?.fp || '');
  if (!isOwnPeriod(row, index) || !Number.isFinite(fy) || fy <= 0 || !fpPattern.test(fp)) return undefined;
  return { fy, fp };
}

/**
 * A 10-Q cash flow statement only has year-to-date totals (6 and 9 months). The quarter is
 * the difference of two year-to-date totals with the same start whose ends are one quarter
 * apart. Only additive amounts qualify: per-share values and share counts are not.
 */
function deriveQuarters(
  rows: any[],
  unit: string,
  index: FilingIndex,
): Array<{ row: any; info: PeriodInfo }> {
  if (unit.includes('/') || !currencyFromUnit(unit)) return [];
  const byStart = new Map<string, Map<string, any[]>>();
  for (const row of rows) {
    if (!isQuarterlyFiling(row) || typeof row.val !== 'number') continue;
    const days = durationDays(row);
    if (days == null || days < QUARTER_DAYS.min) continue;
    const ends = byStart.get(row.start) || new Map<string, any[]>();
    byStart.set(row.start, ends);
    ends.set(row.end, [...(ends.get(row.end) || []), row]);
  }

  const newest = (list: any[]) =>
    list.reduce((best, row) => (String(row.filed || '') > String(best.filed || '') ? row : best));
  const derived: Array<{ row: any; info: PeriodInfo }> = [];
  for (const ends of byStart.values()) {
    const sortedEnds = [...ends.keys()].sort();
    for (let i = 1; i < sortedEnds.length; i++) {
      const previous = newest(ends.get(sortedEnds[i - 1])!);
      const ytdRows = ends.get(sortedEnds[i])!;
      const ytd = newest(ytdRows);
      const gap = (Date.parse(ytd.end) - Date.parse(previous.end)) / DAY_MS;
      if (durationDays(ytd)! <= QUARTER_DAYS.max || !within(gap, QUARTER_DAYS)) continue;
      const fiscal = ytdRows.map((row) => ownFiscal(row, index, /^Q[1-4]$/)).find(Boolean);
      derived.push({
        row: {
          ...ytd,
          start: addDays(previous.end, 1),
          val: ytd.val - previous.val,
          filed: String(ytd.filed || '') > String(previous.filed || '') ? ytd.filed : previous.filed,
          frame: undefined,
          _derivedFrom: { ytd: { start: ytd.start, end: ytd.end }, minus: { start: previous.start, end: previous.end } },
        },
        info: { key: ytd.end, label: ytd.end, fiscal },
      });
    }
  }
  return derived;
}

function rowIsSupported(row: any, mode: DataMode): boolean {
  if (mode === 'Y') return isAnnualFiling(row);
  if (mode === 'I') return isInterimFiling(row);
  return isQuarterlyFiling(row) || isAnnualFiling(row);
}

export function currencyFromUnit(unit: string): string | null {
  if (unit === 'shares' || unit === 'pure') return null;
  const currency = unit.match(/^([A-Z]{3})(?:\/shares)?$/)?.[1];
  return currency || 'non-USD';
}

function selectUnit(candidates: UnitCandidate[], preference: CurrencyPreference): string | null {
  const units = [...new Set(candidates.map((candidate) => candidate.unit))];
  const currencyUnit = (currency: string) =>
    units.find((unit) => currencyFromUnit(unit) === currency);
  const monetaryUnits = units.filter((unit) => currencyFromUnit(unit));

  if (monetaryUnits.length) {
    const preferUsd = preference.preferUsd ?? true;
    if (preferUsd) {
      const usd = currencyUnit('USD');
      if (usd) return usd;
    }

    if (preference.preferredCurrency) {
      const preferred = currencyUnit(preference.preferredCurrency);
      if (preferred) return preferred;
    }

    if (!preferUsd) {
      const local = monetaryUnits.find((unit) => {
        const currency = currencyFromUnit(unit);
        return currency && currency !== 'USD' && currency !== 'non-USD';
      });
      if (local) return local;
    }

    return currencyUnit('USD') || monetaryUnits[0];
  }

  return units.find((unit) => unit === 'shares' || unit === 'pure') || units[0] || null;
}

type UnitCandidate = {
  taxonomy: string;
  concept: string;
  unit: string;
  rows: any[];
};

/** Detect the dominant non-USD reporting currency for the selected report mode. */
export function detectPrimaryCurrency(facts: any, mode: DataMode): string | null {
  const counts = new Map<string, number>();
  for (const [, taxonomy] of taxonomyEntries(facts)) {
    for (const fact of Object.values(taxonomy) as any[]) {
      for (const [unit, rows] of Object.entries(fact?.units || {})) {
        if (!Array.isArray(rows)) continue;
        const currency = currencyFromUnit(unit);
        if (!currency || currency === 'non-USD') continue;
        const count = rows.filter((row) => rowIsSupported(row, mode)).length;
        if (count) counts.set(currency, (counts.get(currency) || 0) + count);
      }
    }
  }

  return (
    [...counts.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        Number(b[0] === 'USD') - Number(a[0] === 'USD') ||
        a[0].localeCompare(b[0]),
    )[0]?.[0] || null
  );
}

/**
 * Extract one dashboard metric from every returned SEC taxonomy.
 *
 * Currency selection is per metric and uses SEC-provided units only—values are
 * never converted with an FX rate. The caller may prefer USD or the detected
 * issuer currency. Annual 10-K/20-F/40-F, quarterly 10-Q, and foreign interim
 * 6-K reports are kept in distinct display modes.
 */
export function extractMetric(
  facts: any,
  keys: string[],
  mode: DataMode,
  preference: CurrencyPreference = {},
  options: ExtractOptions = {},
): ExtractedFact[] {
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

  const selectedUnit = selectUnit(candidates, preference);
  if (!selectedUnit) return [];

  const currency = currencyFromUnit(selectedUnit);
  const index = filingIndex(facts);
  const entries: Array<{ row: any; info: PeriodInfo; candidate: UnitCandidate; derived: boolean }> = [];
  for (const candidate of candidates.filter((item) => item.unit === selectedUnit)) {
    for (const row of candidate.rows) {
      for (const info of periodInfos(row, mode, index)) {
        entries.push({ row, info, candidate, derived: false });
      }
    }
    if (mode === 'Q') {
      for (const { row, info } of deriveQuarters(candidate.rows, candidate.unit, index)) {
        entries.push({ row, info, candidate, derived: true });
      }
    }
  }

  // The fiscal fy/fp of a period come from the filing that reports it as its own period,
  // even when a newer filing (a restated comparative) supplies the value.
  const fiscal = new Map<string, Fiscal>();
  for (const { info } of entries) {
    if (info.fiscal && !fiscal.has(info.key)) fiscal.set(info.key, info.fiscal);
  }

  // Reported values beat derived ones. Then the first concept of `keys` that reports the
  // period wins (aliases are ordered by meaning: NetIncomeLoss before ProfitLoss, basic EPS
  // before diluted), and within it the newest filing (restated values).
  // Concepts in `maxOf` come first and compete differently: the newest filing wins and the
  // largest of its values is taken. Revenue aliases are subsets of one another (ALLY tags fee
  // revenue as RevenueFromContractWithCustomerExcludingAssessedTax and the total as Revenues).
  const maxOf = new Set(options.maxOf || []);
  const priority = (concept: string) => keys.indexOf(concept);
  entries.sort((a, b) => {
    if (a.derived !== b.derived) return Number(a.derived) - Number(b.derived);
    const aMax = maxOf.has(a.candidate.concept);
    const bMax = maxOf.has(b.candidate.concept);
    if (aMax !== bMax) return Number(bMax) - Number(aMax);
    if (!aMax) {
      const rank = priority(a.candidate.concept) - priority(b.candidate.concept);
      if (rank) return rank;
    }
    const filed = +new Date(b.row.filed || 0) - +new Date(a.row.filed || 0);
    if (filed) return filed;
    if (aMax) {
      const filing = filingId(a.row).localeCompare(filingId(b.row));
      if (filing) return filing;
      const value = Number(b.row.val) - Number(a.row.val);
      if (value) return value;
    }
    // SEC frames generally identify the discrete (not YTD) value.
    return Number(Boolean(b.row.frame)) - Number(Boolean(a.row.frame));
  });
  const byPeriod = new Map<string, ExtractedFact>();
  for (const { row, info, candidate, derived } of entries) {
    if (byPeriod.has(info.key)) continue;
    byPeriod.set(info.key, {
      ...row,
      _periodKey: info.key,
      _periodLabel: info.label,
      _fiscal: fiscal.get(info.key) || null,
      _derived: derived,
      _taxonomy: candidate.taxonomy,
      _concept: candidate.concept,
      _secUnit: candidate.unit,
      _currency: currency,
    });
  }
  return Array.from(byPeriod.values());
}

/** Ends within this many days of the same day of year are the same fiscal period. */
const SLOT_DAYS = 20;
const YEAR_DAYS = 365;

function dayOfYear(end: string): number {
  return Math.floor((Date.parse(end) - Date.UTC(Number(end.slice(0, 4)), 0, 1)) / DAY_MS);
}

/** Days from `day` forward to `end`'s day of year, 0..364. */
function daysAfter(day: number, end: string): number {
  return (((dayOfYear(end) - day) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
}

const sameSlot = (day: number, end: string) => {
  const delta = daysAfter(day, end);
  return Math.min(delta, YEAR_DAYS - delta) <= SLOT_DAYS;
};

/** Most frequent value; on a tie the earlier one in `values` wins. */
function majority<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  let best: T | undefined;
  for (const value of values) if (best === undefined || counts.get(value)! > counts.get(best)!) best = value;
  return best;
}

type LabelKey = { key: string; end: string; annual: boolean; fallback: string; fy: number | undefined };

/**
 * Column label for every period key of the extracted rows.
 * - I: the dates of the 6-K period
 * - Y and Q: the company's fiscal year. Filings tag fy/fp inconsistently (CRWD tagged its
 *   fiscal 2026 Q1 as fy 2025, KR tagged first quarters as Q2 for years), so labels are not
 *   copied from fy/fp. The fiscal year end is the day of year most annual periods end on
 *   (±20 days for 52/53-week years); a period belongs to the fiscal year that ends on or after
 *   it; its quarter is the number of quarters (91 days) from the previous year end. The fiscal
 *   year number is the calendar year of that year end plus the offset most filings use between
 *   their own fy and that calendar year (HD calls the year that ends in February 2026 fiscal 2025)
 * A label that would still repeat falls back to the period end date.
 */
export function periodLabels(rows: ExtractedFact[], mode: DataMode): Map<string, string> {
  const keys = new Map<string, LabelKey & { votes: number[] }>();
  for (const row of rows) {
    const key = row._periodKey;
    const item = keys.get(key) || {
      key,
      end: key.split('|')[0],
      annual: mode === 'Y' || key.endsWith('|FY'),
      fallback: mode === 'I' ? row._periodLabel : key.replace('|', ' '),
      fy: undefined,
      votes: [],
    };
    keys.set(key, item);
    if (row._fiscal) item.votes.push(row._fiscal.fy);
  }
  const items = [...keys.values()];
  for (const item of items) item.fy = majority(item.votes);

  const labels = new Map(items.map((item) => [item.key, item.fallback]));
  const annual = items.filter((item) => item.annual).sort((a, b) => b.end.localeCompare(a.end));
  if (mode !== 'I' && annual.length) {
    const yearEndDay = majority(
      annual.map((item) => dayOfYear(annual.find((other) => sameSlot(dayOfYear(other.end), item.end))!.end)),
    )!;
    // The fiscal year end on or after a period end, as a calendar year (JNJ 2023-01-01 -> 2022).
    const yearEndOf = (end: string) => {
      if (sameSlot(yearEndDay, end)) return Number(endYear(end));
      const year = Number(end.slice(0, 4)) + (dayOfYear(end) > yearEndDay ? 1 : 0);
      return Number(endYear(new Date(Date.UTC(year, 0, 1) + yearEndDay * DAY_MS).toISOString().slice(0, 10)));
    };
    const offset =
      majority(
        items
          .filter((item) => item.fy !== undefined)
          .sort((a, b) => b.end.localeCompare(a.end))
          .map((item) => item.fy! - yearEndOf(item.end)),
      ) ?? 0;
    for (const item of items) {
      const year = yearEndOf(item.end) + offset;
      if (mode === 'Y') labels.set(item.key, String(year));
      else if (item.annual) labels.set(item.key, `${year} FY`);
      else {
        const quarter = sameSlot(yearEndDay, item.end) ? 4 : Math.round(daysAfter(yearEndDay, item.end) / 91.3);
        labels.set(item.key, `${year} Q${Math.min(Math.max(quarter, 1), 4)}`);
      }
    }
  }

  const byLabel = new Map<string, string[]>();
  for (const [key, label] of labels) byLabel.set(label, [...(byLabel.get(label) || []), key]);
  for (const duplicates of byLabel.values()) {
    if (duplicates.length > 1) for (const key of duplicates) labels.set(key, keys.get(key)!.fallback);
  }
  return labels;
}

/**
 * Gross profit is often not tagged (or only for Q4 in a 10-K): fall back to revenue minus
 * cost of revenue for the same period and currency.
 */
export function withGrossProfitFallback(
  grossProfit: ExtractedFact[],
  revenue: ExtractedFact[],
  costOfRevenue: ExtractedFact[],
): ExtractedFact[] {
  const have = new Set(grossProfit.map((row) => row._periodKey));
  const currency = grossProfit[0]?._currency;
  const cost = new Map(costOfRevenue.map((row) => [row._periodKey, row]));
  const fallback = revenue.flatMap((rev): ExtractedFact[] => {
    const cor = cost.get(rev._periodKey);
    if (have.has(rev._periodKey) || !cor || rev._currency !== cor._currency) return [];
    if (grossProfit.length && rev._currency !== currency) return [];
    if (typeof rev.val !== 'number' || typeof cor.val !== 'number') return [];
    return [
      { ...rev, val: rev.val - cor.val, _concept: `${rev._concept} - ${cor._concept}`, _derived: true },
    ];
  });
  return [...grossProfit, ...fallback];
}

/**
 * Total debt of one period from the individual debt concepts (value or undefined per concept).
 * LongTermDebt includes the current maturities and DebtCurrent includes the short-term
 * borrowings, so the parts are combined without counting either twice:
 * - LongTermDebtNoncurrent + DebtCurrent
 * - LongTermDebtNoncurrent + LongTermDebtCurrent + short-term borrowings
 * - LongTermDebt + short-term borrowings
 * - otherwise whatever single long-term part exists + short-term borrowings
 * Short-term borrowings: ShortTermBorrowings, else CommercialPaper, else IFRS ShorttermBorrowings.
 */
export function totalDebt(part: (concept: string) => number | undefined): number | null {
  const borrowings = part('ShortTermBorrowings') ?? part('CommercialPaper') ?? part('ShorttermBorrowings') ?? 0;
  const noncurrent = part('LongTermDebtNoncurrent');
  const current = part('DebtCurrent');
  const currentMaturities = part('LongTermDebtCurrent');
  const total = part('LongTermDebt');
  let debt: number;
  if (noncurrent !== undefined && current !== undefined) debt = noncurrent + current;
  else if (noncurrent !== undefined && currentMaturities !== undefined) debt = noncurrent + currentMaturities + borrowings;
  else if (total !== undefined) debt = total + borrowings;
  else if (noncurrent !== undefined) debt = noncurrent + borrowings;
  else if (part('LongtermBorrowings') !== undefined) debt = part('LongtermBorrowings')! + borrowings;
  else debt = current ?? (currentMaturities ?? 0) + borrowings;
  return debt || null;
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
        // Unknown/custom units (employee, segment, rate, etc.) are not currencies.
        if (currency && currency !== 'non-USD') availableCurrencies.add(currency);
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
