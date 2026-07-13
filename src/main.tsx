// main.tsx
// SEC EDGAR Financial Fundamentals Dashboard
// Modern React + TypeScript + Tailwind v4 + Parcel
// Proxy solution aligned with fundamentals-runtime (local-cors-proxy dual ports)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { RefreshCw, Settings2 } from 'lucide-react';

type Language = 'en' | 'ru';

const translations: Record<Language, Record<string, string>> = {
  en: {
    'app.brand': 'SEC Fundamentals',
    'search.placeholder': 'Ticker or company name…',
    'search.load': 'Load Data',
    'search.loading': 'Loading…',
    'mode.y': 'Annual',
    'mode.q': 'Quarterly',
    'view.table': 'Table',
    'view.charts': 'Charts',
    'loading': 'Loading…',
    'error.proxy': 'Start proxies (fundamentals-runtime style):\nbunx local-cors-proxy --proxyUrl https://www.sec.gov --port 8011\nbunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012\n\nOr one Bun proxy: bun ./scripts/sec-proxy.ts',
    'no.data': 'Enter a ticker (AAPL, MSFT, NVDA...)',
    'proxy.help': 'Proxy setup',
    'proxy.www': 'www.sec.gov',
    'proxy.data': 'data.sec.gov',
    'settings.proxy': 'Proxy',
  },
  ru: {
    'app.brand': 'SEC Fundamentals',
    'search.placeholder': 'Тикер или компания…',
    'search.load': 'Загрузить данные',
    'search.loading': 'Загрузка…',
    'mode.y': 'Годовой',
    'mode.q': 'Квартальный',
    'view.table': 'Таблица',
    'view.charts': 'Графики',
    'loading': 'Загрузка…',
    'error.proxy': 'Запустите прокси (как в fundamentals-runtime):\nbunx local-cors-proxy --proxyUrl https://www.sec.gov --port 8011\nbunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012\n\nИли один Bun-прокси: bun ./scripts/sec-proxy.ts',
    'no.data': 'Введите тикер (AAPL, MSFT, NVDA...)',
    'proxy.help': 'Настройка прокси',
    'proxy.www': 'www.sec.gov',
    'proxy.data': 'data.sec.gov',
    'settings.proxy': 'Прокси',
  },
};

function t(key: string, lang: Language): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

// ---------------------------------------------------------------------------
// Proxy discovery — same shape as fundamentals-runtime
// local-cors-proxy exposes: http://localhost:{port}/proxy/...
// sec-proxy.ts also accepts /proxy/... and bare /api /files paths.
// ---------------------------------------------------------------------------
const WWW_CANDIDATES = [8011, 8010, 8080, 3000, 8012].map(
  (p) => `http://localhost:${p}/proxy`,
);
const DATA_CANDIDATES = [8012, 8010, 8080, 3000, 8011].map(
  (p) => `http://localhost:${p}/proxy`,
);
// Also try unified Bun proxy without /proxy prefix (MODE=both on 8012)
const UNIFIED_CANDIDATES = [
  'http://localhost:8012',
  'http://localhost:8010',
  'http://localhost:8080',
];

const LS_WWW = 'sec-proxy-www';
const LS_DATA = 'sec-proxy-data';
const LS_UNIFIED = 'sec-proxy'; // legacy single-base key

async function probeBase(
  candidates: string[],
  path: string,
): Promise<{ base: string; res: Response }> {
  const errors: string[] = [];
  for (const base of candidates) {
    try {
      const r = await fetch(base + path, {
        headers: { Accept: 'application/json' },
      });
      if (r.ok) return { base, res: r };
      errors.push(`${base}${path}→${r.status}`);
    } catch (x: any) {
      errors.push(`${base}${path}→${x?.message || x}`);
    }
  }
  throw new Error('Proxy not reachable:\n' + errors.join('\n'));
}

const CON: Record<string, string[]> = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
  ],
  costOfRevenue: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: [
    'NetIncomeLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
    'ProfitLoss',
  ],
  eps: ['EarningsPerShareBasic', 'EarningsPerShareDiluted'],
  ocf: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsForCapitalImprovements',
  ],
  depreciation: [
    'DepreciationDepletionAndAmortization',
    'Depreciation',
    'DepreciationAndAmortization',
  ],
  assets: ['Assets'],
  equity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ],
  cash: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsAndShortTermInvestments',
  ],
  sharesOut: ['CommonStockSharesOutstanding'],
};

const SEC_SECTIONS = [
  {
    title: '📊 Income Statement',
    metrics: [
      { key: 'revenue', label: 'Revenue', unit: '$M' },
      { key: 'costOfRevenue', label: 'Cost of Revenue', unit: '$M' },
      { key: 'grossProfit', label: 'Gross Profit', unit: '$M' },
      { key: 'operatingIncome', label: 'Operating Income', unit: '$M' },
      { key: 'netIncome', label: 'Net Income', unit: '$M' },
      { key: 'eps', label: 'EPS', unit: '$', raw: true },
    ],
    computed: [
      { key: 'grossMargin', label: 'Gross Margin', unit: '%' },
      { key: 'netMargin', label: 'Net Margin', unit: '%' },
    ],
  },
  {
    title: '💰 Cash Flow',
    metrics: [
      { key: 'ocf', label: 'Operating CF', unit: '$M' },
      { key: 'capex', label: 'CapEx', unit: '$M' },
      { key: 'depreciation', label: 'D&A', unit: '$M' },
    ],
    computed: [{ key: 'fcf', label: 'Free Cash Flow', unit: '$M' }],
  },
  {
    title: '🏦 Balance Sheet',
    metrics: [
      { key: 'assets', label: 'Total Assets', unit: '$M' },
      { key: 'equity', label: 'Equity', unit: '$M' },
      { key: 'cash', label: 'Cash', unit: '$M' },
    ],
    computed: [{ key: 'roe', label: 'ROE', unit: '%' }],
  },
];

/** Pick first available unit series for a GAAP concept (runtime-compatible). */
function unitSeries(concept: any): any[] | null {
  if (!concept?.units) return null;
  const u = concept.units;
  return u.USD || u['USD/shares'] || u.shares || u.pure || (Object.values(u)[0] as any[]) || null;
}

/**
 * Normalize SEC companyfacts payload → inner `facts` object with `us-gaap`.
 * Full shape: { cik, entityName, facts: { "us-gaap": {...} } }
 * fundamentals-runtime: const facts = (await res.json()).facts
 */
function normalizeFacts(raw: any): any {
  if (!raw) return null;
  if (raw['us-gaap']) return raw; // already inner
  if (raw.facts) return raw.facts;
  return raw;
}

/**
 * Extract metric points from companyfacts.facts (object that contains us-gaap).
 */
function exM(facts: any, keys: string[], mode: 'Y' | 'Q') {
  const g = facts?.['us-gaap'] || facts?.facts?.['us-gaap'];
  if (!g) return [];
  let r: any[] = [];
  for (const k of keys) {
    const s = unitSeries(g[k]);
    if (s) {
      const filtered =
        mode === 'Y'
          ? s.filter((p: any) => p.form === '10-K' && p.fp === 'FY')
          : s.filter((p: any) => p.form === '10-Q' || (p.form === '10-K' && p.fp === 'FY'));
      r = r.concat(filtered);
    }
  }
  const m = new Map();
  const fpOrder: Record<string, number> = { FY: 4, Q4: 4, Q3: 3, Q2: 2, Q1: 1 };
  r.sort((a, b) => new Date(b.filed).getTime() - new Date(a.filed).getTime()).forEach(
    (x: any) => {
      const key = mode === 'Y' ? x.fy : `${x.fy}-${x.fp}`;
      if (!m.has(key)) m.set(key, x);
    },
  );
  return Array.from(m.values()).sort((a: any, b: any) => {
    if (b.fy !== a.fy) return b.fy - a.fy;
    return (fpOrder[b.fp] || 0) - (fpOrder[a.fp] || 0);
  });
}

function proc(facts: any, mode: 'Y' | 'Q') {
  const ex: any = {};
  Object.entries(CON).forEach(([k, keys]) => {
    ex[k] = exM(facts, keys, mode);
  });

  const allE = Object.values(ex).flat();
  let pK: any[] =
    mode === 'Y'
      ? [...new Set(allE.map((d: any) => d.fy))].sort((a: any, b: any) => b - a)
      : [...new Set(allE.map((d: any) => `${d.fy}-${d.fp}`))];

  const gv = (k: string, pk: any) => {
    const arr = ex[k] || [];
    if (mode === 'Y') return arr.find((d: any) => d.fy === pk)?.val;
    const [fy, fp] = String(pk).split('-');
    return arr.find((d: any) => d.fy === Number(fy) && d.fp === fp)?.val;
  };
  const getLabel = (pk: any) => (mode === 'Y' ? String(pk) : String(pk).replace('-', ' '));

  const metricSeries: any = {};
  Object.keys(CON).forEach((k) => {
    metricSeries[k] = pK.map((pk) => ({
      label: getLabel(pk),
      value: gv(k, pk),
      periodKey: pk,
    }));
  });

  const computedSeries: any = { grossMargin: [], netMargin: [], fcf: [], roe: [] };
  pK.forEach((pk) => {
    const rev = gv('revenue', pk);
    const gp = gv('grossProfit', pk);
    const ni = gv('netIncome', pk);
    const ocf = gv('ocf', pk);
    const cx = gv('capex', pk);
    const eq = gv('equity', pk);

    computedSeries.grossMargin.push({
      label: getLabel(pk),
      value: gp && rev ? (gp / rev) * 100 : null,
      periodKey: pk,
    });
    computedSeries.netMargin.push({
      label: getLabel(pk),
      value: ni && rev ? (ni / rev) * 100 : null,
      periodKey: pk,
    });
    computedSeries.fcf.push({
      label: getLabel(pk),
      value: ocf != null && cx != null ? ocf - Math.abs(cx) : null,
      periodKey: pk,
    });
    computedSeries.roe.push({
      label: getLabel(pk),
      value: ni && eq ? (ni / eq) * 100 : null,
      periodKey: pk,
    });
  });

  return { metricSeries, computedSeries, periodKeys: pK, getLabel };
}

const fV = (v: any, u: string) => {
  if (v == null || !isFinite(v)) return '—';
  if (u === '$M') return (v / 1e6).toFixed(1);
  if (u === '$') return '$' + Number(v).toFixed(2);
  if (u === '%') return v.toFixed(1) + '%';
  if (u === 'x') return v.toFixed(2) + 'x';
  return String(v);
};

const MiniChart = ({ data, label, unit, dark }: any) => {
  const valid = data.filter((d: any) => d.value != null);
  if (valid.length < 2) return null;
  const vals = valid.map((d: any) => d.value);
  const mn = Math.min(...vals),
    mx = Math.max(...vals);
  const pad = (mx - mn) * 0.1 || 1;
  const W = 280,
    H = 100,
    L = 38;
  const cw = W - L - 8,
    ch = H - 18;
  const xp = (i: number) => L + (i / (valid.length - 1)) * cw;
  const yp = (v: number) => 6 + ch - ((v - (mn - pad)) / (mx + pad - (mn - pad))) * ch;
  const pts = valid.map((d: any, i: number) => `${xp(i)},${yp(d.value)}`).join(' ');
  return (
    <div className="rounded-xl p-3 border bg-white/60 dark:bg-slate-900/60">
      <div className="text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[100px]">
        <polyline
          points={pts}
          fill="none"
          stroke={dark ? '#34d399' : '#059669'}
          strokeWidth="2"
        />
        {valid.map((d: any, i: number) => (
          <circle
            key={i}
            cx={xp(i)}
            cy={yp(d.value)}
            r="2.5"
            fill={dark ? '#34d399' : '#059669'}
          />
        ))}
      </svg>
    </div>
  );
};

/** Segmented control — same style as fundamentals-runtime Pill */
type PillOption = string | { k: string; l: string };

function Pill({
  value,
  options,
  onChange,
  dark,
  title,
}: {
  value: string;
  options: PillOption[];
  onChange: (k: string) => void;
  dark: boolean;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={`flex-shrink-0 flex items-center rounded-lg p-0.5 border ${
        dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
      }`}
    >
      {options.map((opt) => {
        const k = typeof opt === 'string' ? opt : opt.k;
        const l = typeof opt === 'string' ? opt : opt.l;
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
              active
                ? 'bg-emerald-500 text-white shadow-sm'
                : dark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  const color =
    ok === true ? 'bg-emerald-500' : ok === false ? 'bg-red-500' : 'bg-slate-400 animate-pulse';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function App() {
  const [lang, setLang] = useState<Language>(
    () => (localStorage.getItem('sec-lang') as Language) || 'en',
  );
  const [dark, setDark] = useState(() => localStorage.getItem('sec-dark') !== '0');
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState<any>(null);
  const [facts, setFacts] = useState<any>(null);
  const [mode, setMode] = useState<'Y' | 'Q'>('Y');
  const [view, setView] = useState<'table' | 'charts'>('table');
  const [scaleSlider, setScaleSlider] = useState(50);
  const [showProxyHelp, setShowProxyHelp] = useState(false);

  // Dual proxy bases (fundamentals-runtime style) + optional unified Bun proxy
  const [wwwBase, setWwwBase] = useState(
    () => localStorage.getItem(LS_WWW) || localStorage.getItem(LS_UNIFIED) || '',
  );
  const [dataBase, setDataBase] = useState(
    () => localStorage.getItem(LS_DATA) || localStorage.getItem(LS_UNIFIED) || '',
  );
  const [wwwOk, setWwwOk] = useState<boolean | null>(null);
  const [dataOk, setDataOk] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const processed = useMemo(() => (facts ? proc(facts, mode) : null), [facts, mode]);
  const scale = 0.7 + (scaleSlider / 100) * 0.8;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sec-dark', dark ? '1' : '0');
  }, [dark]);
  useEffect(() => {
    localStorage.setItem('sec-lang', lang);
  }, [lang]);
  useEffect(() => {
    if (wwwBase) localStorage.setItem(LS_WWW, wwwBase);
  }, [wwwBase]);
  useEffect(() => {
    if (dataBase) localStorage.setItem(LS_DATA, dataBase);
  }, [dataBase]);

  const log = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-40), msg]);
  }, []);

  const fetchJson = async (url: string) => {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Browser cannot override User-Agent; proxy must inject it.
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };

  const loadData = async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError('');
    setCompany(null);
    setFacts(null);
    setLogs([]);

    try {
      // 1) company tickers — prefer static GitHub Pages cache, then www proxy
      let tickers: any = null;
      log('Loading company_tickers…');
      try {
        const r = await fetch('/data/company_tickers.json');
        if (r.ok) {
          tickers = await r.json();
          // Ignore tiny stubs (dev placeholder with only a few entries)
          const n = tickers && typeof tickers === 'object' ? Object.keys(tickers).length : 0;
          if (n >= 50) {
            log(`✅ static data/company_tickers.json (${n} entries)`);
          } else {
            log(`static tickers too small (${n}) — will use proxy`);
            tickers = null;
          }
        }
      } catch {
        /* ignore */
      }

      if (!tickers) {
        log('Probing www.sec.gov proxy…');
        const candidates = [
          ...(wwwBase ? [wwwBase] : []),
          ...WWW_CANDIDATES,
          ...UNIFIED_CANDIDATES,
        ];
        // dedupe
        const uniq = [...new Set(candidates)];
        const { base, res } = await probeBase(uniq, '/files/company_tickers.json');
        setWwwBase(base);
        setWwwOk(true);
        log(`✅ www proxy: ${base}`);
        tickers = await res.json();
        // Also try unified alias path
        if (!tickers) {
          tickers = await fetchJson(`${base}/api/company_tickers`);
        }
      } else {
        setWwwOk(true);
      }

      const list = Object.values(tickers || {}) as any[];
      const found = list.find((c: any) => c.ticker?.toUpperCase() === s);
      if (!found) throw new Error(`Ticker "${s}" not found`);

      const cik = String(found.cik_str).padStart(10, '0');
      log(`Found ${s} → CIK ${cik}`);

      // 2) company facts via data.sec.gov proxy
      log('Probing data.sec.gov proxy…');
      const dataCandidates = [
        ...(dataBase ? [dataBase] : []),
        ...DATA_CANDIDATES,
        ...UNIFIED_CANDIDATES,
      ];
      const uniqData = [...new Set(dataCandidates)];
      const factsPath = `/api/xbrl/companyfacts/CIK${cik}.json`;
      const { base: dBase, res: factsRes } = await probeBase(uniqData, factsPath);
      setDataBase(dBase);
      setDataOk(true);
      log(`✅ data proxy: ${dBase}`);
      // CRITICAL: companyfacts JSON is { cik, entityName, facts: { "us-gaap": ... } }
      // fundamentals-runtime does: const facts = (await res.json()).facts
      const raw = await factsRes.json();
      const factsInner = normalizeFacts(raw);
      if (!factsInner?.['us-gaap']) {
        throw new Error(
          'companyfacts payload has no us-gaap (unexpected shape). Top keys: ' +
            Object.keys(raw || {}).join(', '),
        );
      }

      const title = found.title || raw?.entityName || s;
      const comp = { ticker: s, title, cik };
      setCompany(comp);
      setFacts(factsInner);
      try {
        // Store inner facts only (correct shape for restore; smaller)
        localStorage.setItem('sec-last', JSON.stringify({ company: comp, facts: factsInner }));
      } catch {
        /* quota — full companyfacts can be multi-MB */
      }
      const nConcepts = Object.keys(factsInner['us-gaap'] || {}).length;
      log(`✅ company facts loaded (${nConcepts} us-gaap concepts)`);
    } catch (e: any) {
      setWwwOk((v) => (v === true ? v : false));
      setDataOk((v) => (v === true ? v : false));
      const msg = e?.message || t('error.proxy', lang);
      setError(msg);
      log(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => loadData(ticker);

  const clearCache = () => {
    setFacts(null);
    setCompany(null);
    setError('');
    localStorage.removeItem('sec-last');
    log('cache cleared');
  };

  useEffect(() => {
    const last = localStorage.getItem('sec-last');
    if (last) {
      try {
        const p = JSON.parse(last);
        if (p.company && p.facts) {
          setCompany(p.company);
          setFacts(normalizeFacts(p.facts));
          setTicker(p.company.ticker);
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl">{t('app.brand', lang)}</span>
            <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              EDGAR
            </span>
            <div className="hidden sm:flex items-center gap-3 ml-2">
              <StatusDot ok={wwwOk} label="www" />
              <StatusDot ok={dataOk} label="data" />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode Y/Q — fundamentals-runtime Pill */}
            <Pill
              value={mode}
              options={[
                { k: 'Y', l: lang === 'ru' ? 'Г' : 'Y' },
                { k: 'Q', l: lang === 'ru' ? 'К' : 'Q' },
              ]}
              onChange={(k) => setMode(k as 'Y' | 'Q')}
              dark={dark}
              title={lang === 'ru' ? 'Годовой / Квартальный' : 'Annual / Quarterly'}
            />
            {/* View table/charts — runtime uses ⊞ / ◔ */}
            <Pill
              value={view === 'table' ? 'T' : 'C'}
              options={[
                { k: 'T', l: '⊞' },
                { k: 'C', l: '◔' },
              ]}
              onChange={(k) => setView(k === 'C' ? 'charts' : 'table')}
              dark={dark}
              title={lang === 'ru' ? 'Таблица / Графики' : 'Table / Charts'}
            />
            {/* Language EN/RU — same Pill style */}
            <Pill
              value={lang}
              options={[
                { k: 'en', l: 'EN' },
                { k: 'ru', l: 'RU' },
              ]}
              onChange={(k) => setLang(k as Language)}
              dark={dark}
              title="Language / Язык"
            />
            <button
              onClick={() => setShowProxyHelp((v) => !v)}
              className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
                showProxyHelp
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : dark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title={t('settings.proxy', lang)}
            >
              <Settings2 size={16} />
            </button>
            <button
              onClick={() => setDark(!dark)}
              className={`flex-shrink-0 text-sm px-2 py-1.5 rounded transition-colors ${
                dark
                  ? 'text-yellow-400 hover:text-yellow-300'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title={dark ? 'Light' : 'Dark'}
            >
              {dark ? '☀' : '🌙'}
            </button>
            <button
              onClick={clearCache}
              className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
                dark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title={lang === 'ru' ? 'Сбросить кэш' : 'Clear cache'}
            >
              <RefreshCw size={16} />
            </button>
            <a
              href="https://github.com/daggerok/fundamentals/tree/master/docs"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex-shrink-0 text-xs px-2 py-1 rounded transition-colors ${
                dark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title={lang === 'ru' ? 'Документация' : 'Documentation'}
            >
              📄 docs
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {showProxyHelp && (
          <div className="mb-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <p className="font-bold mb-3">{t('proxy.help', lang)}</p>
            <p className="text-sm text-slate-500 mb-3">
              Same dual-proxy solution as{' '}
              <a
                className="text-emerald-600 underline"
                href="https://github.com/daggerok/fundamentals-runtime"
                target="_blank"
                rel="noreferrer"
              >
                fundamentals-runtime
              </a>
              :
            </p>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <pre className="bg-slate-50 dark:bg-slate-950 text-emerald-700 dark:text-emerald-300 p-3 rounded text-xs font-mono overflow-x-auto">{`bunx local-cors-proxy \\\n  --proxyUrl https://www.sec.gov \\\n  --port 8011`}</pre>
              <pre className="bg-slate-50 dark:bg-slate-950 text-emerald-700 dark:text-emerald-300 p-3 rounded text-xs font-mono overflow-x-auto">{`bunx local-cors-proxy \\\n  --proxyUrl https://data.sec.gov \\\n  --port 8012`}</pre>
            </div>
            <p className="text-sm text-slate-500 mb-2">
              Or one modern Bun proxy (User-Agent + both hosts):
            </p>
            <pre className="bg-slate-50 dark:bg-slate-950 text-emerald-700 dark:text-emerald-300 p-3 rounded text-xs font-mono mb-3">{`bun ./scripts/sec-proxy.ts`}</pre>
            <div className="text-xs text-slate-500 space-y-1 font-mono">
              <div>
                www base: {wwwBase || '—'} <StatusDot ok={wwwOk} label="" />
              </div>
              <div>
                data base: {dataBase || '—'} <StatusDot ok={dataOk} label="" />
              </div>
            </div>
            {logs.length > 0 && (
              <pre className="mt-3 max-h-40 overflow-auto text-xs bg-slate-50 dark:bg-slate-950 p-2 rounded">
                {logs.join('\n')}
              </pre>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            placeholder={t('search.placeholder', lang)}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleLoad}
            disabled={loading}
            className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl disabled:opacity-60"
          >
            {loading ? t('search.loading', lang) : t('search.load', lang)}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 whitespace-pre-wrap font-mono text-sm">
            {error}
          </div>
        )}

        {company && (
          <div className="mb-4">
            <div className="text-3xl font-bold">{company.ticker}</div>
            <div className="text-slate-500">
              {company.title} · CIK {company.cik}
            </div>
          </div>
        )}

        {processed && (
          <div className="space-y-6">
            {SEC_SECTIONS.map((section, i) => {
              const all = [
                ...section.metrics.map((m) => ({
                  ...m,
                  series: processed.metricSeries[m.key] || [],
                })),
                ...(section.computed || []).map((c) => ({
                  ...c,
                  series: processed.computedSeries[c.key] || [],
                })),
              ].filter((m) => m.series?.some((d: any) => d.value != null));
              if (!all.length) return null;

              return (
                <div key={i} className="fund-card rounded-xl overflow-hidden shadow-lg border animate-fade-in">
                  <div className="flex justify-between items-center gap-3 px-5 py-3 border-b border-slate-200/80 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-900/40">
                    <div className="font-semibold text-sm sm:text-base">{section.title}</div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={scaleSlider}
                      onChange={(e) => setScaleSlider(+e.target.value)}
                      className="scale-slider w-20"
                      title={lang === 'ru' ? 'Масштаб' : 'Scale'}
                    />
                  </div>
                  <div className="p-4">

                  {view === 'charts' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {all.map((m) => (
                        <MiniChart
                          key={m.key}
                          data={m.series}
                          label={m.label}
                          unit={m.unit}
                          dark={dark}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto themed-scroll">
                      <table
                        className="fund-table w-full text-sm"
                        style={{ fontSize: `${Math.round(13 * scale)}px` }}
                      >
                        <thead>
                          <tr>
                            <th className="text-left py-2 sticky left-0 bg-inherit">
                              {lang === 'ru' ? 'Метрика' : 'Metric'}
                            </th>
                            {processed.periodKeys.map((pk: any, j: number) => (
                              <th key={j} className="text-right px-2">
                                {processed.getLabel(pk)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {all.map((m) => (
                            <tr key={m.key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="py-1.5 pr-3 font-medium sticky left-0 bg-inherit">
                                {m.label}{' '}
                                <span className="text-xs text-slate-400">({m.unit})</span>
                              </td>
                              {m.series.map((d: any, j: number) => (
                                <td key={j} className="px-2 py-1.5 text-right font-mono tabular-nums">
                                  {fV(d.value, m.unit)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {company && !loading && !processed && (
          <div className="text-center py-16 text-slate-500">
            {lang === 'ru'
              ? 'Данные загружены, но метрики не извлечены (проверьте us-gaap / период).'
              : 'Facts loaded but no metrics extracted (check us-gaap tags / period).'}
          </div>
        )}

        {company && !loading && processed && (() => {
          const any =
            Object.values(processed.metricSeries || {}).some((series: any) =>
              series?.some((d: any) => d.value != null),
            ) ||
            Object.values(processed.computedSeries || {}).some((series: any) =>
              series?.some((d: any) => d.value != null),
            );
          if (any) return null;
          return (
            <div className="text-center py-16 text-slate-500">
              {lang === 'ru'
                ? 'Нет точек для выбранного режима (Annual/Quarterly). Переключите режим или тикер.'
                : 'No data points for the selected mode (Annual/Quarterly). Try switching mode or ticker.'}
            </div>
          );
        })()}

        {!company && !loading && (
          <div className="text-center py-20 text-slate-500">{t('no.data', lang)}</div>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
