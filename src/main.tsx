// main.tsx
// SEC EDGAR Financial Fundamentals Dashboard
// Modern React + TypeScript + Tailwind v4 + Parcel
// Ported following options-desk architecture

import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, Sun, RefreshCw } from 'lucide-react';

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
    'error.proxy': 'Start proxy: bun ./scripts/sec-proxy.ts',
    'no.data': 'Enter a ticker (AAPL, MSFT, NVDA...)',
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
    'error.proxy': 'Запустите прокси: bun ./scripts/sec-proxy.ts',
    'no.data': 'Введите тикер (AAPL, MSFT, NVDA...)',
  },
};

function t(key: string, lang: Language): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

const CON: Record<string, string[]> = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  costOfRevenue: ['CostOfGoodsAndServicesSold', 'CostOfRevenue'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss'],
  eps: ['EarningsPerShareBasic'],
  ocf: ['NetCashProvidedByUsedInOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  depreciation: ['DepreciationDepletionAndAmortization'],
  assets: ['Assets'],
  equity: ['StockholdersEquity'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'],
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

function exM(facts: any, keys: string[], mode: 'Y' | 'Q') {
  if (!facts?.['us-gaap']) return [];
  const g = facts['us-gaap'];
  let r: any[] = [];
  for (const k of keys) {
    const s = g[k]?.units?.USD || g[k]?.units?.['USD/shares'];
    if (s) {
      const filtered = mode === 'Y'
        ? s.filter((p: any) => p.form === '10-K' && p.fp === 'FY')
        : s.filter((p: any) => p.form === '10-Q' || (p.form === '10-K' && p.fp === 'FY'));
      r = r.concat(filtered);
    }
  }
  const m = new Map();
  r.sort((a, b) => new Date(b.filed).getTime() - new Date(a.filed).getTime())
    .forEach((x: any) => {
      const key = mode === 'Y' ? x.fy : `${x.fy}-${x.fp}`;
      if (!m.has(key)) m.set(key, x);
    });
  return Array.from(m.values()).sort((a: any, b: any) => b.fy - a.fy);
}

function proc(facts: any, mode: 'Y' | 'Q') {
  const ex: any = {};
  Object.entries(CON).forEach(([k, keys]) => { ex[k] = exM(facts, keys, mode); });

  const allE = Object.values(ex).flat();
  let pK: any[] = mode === 'Y'
    ? [...new Set(allE.map((d: any) => d.fy))].sort((a, b) => b - a)
    : [...new Set(allE.map((d: any) => `${d.fy}-${d.fp}`))];

  const gv = (k: string, pk: any) => {
    const arr = ex[k] || [];
    if (mode === 'Y') return arr.find((d: any) => d.fy === pk)?.val;
    const [fy, fp] = String(pk).split('-');
    return arr.find((d: any) => d.fy === Number(fy) && d.fp === fp)?.val;
  };
  const getLabel = (pk: any) => mode === 'Y' ? String(pk) : String(pk).replace('-', ' ');

  const metricSeries: any = {};
  Object.keys(CON).forEach(k => {
    metricSeries[k] = pK.map(pk => ({ label: getLabel(pk), value: gv(k, pk), periodKey: pk }));
  });

  const computedSeries: any = { grossMargin: [], netMargin: [], fcf: [], roe: [] };
  pK.forEach(pk => {
    const rev = gv('revenue', pk);
    const gp = gv('grossProfit', pk);
    const ni = gv('netIncome', pk);
    const ocf = gv('ocf', pk);
    const cx = gv('capex', pk);
    const eq = gv('equity', pk);

    computedSeries.grossMargin.push({ label: getLabel(pk), value: (gp && rev) ? gp / rev * 100 : null, periodKey: pk });
    computedSeries.netMargin.push({ label: getLabel(pk), value: (ni && rev) ? ni / rev * 100 : null, periodKey: pk });
    computedSeries.fcf.push({ label: getLabel(pk), value: (ocf != null && cx != null) ? ocf - cx : null, periodKey: pk });
    computedSeries.roe.push({ label: getLabel(pk), value: (ni && eq) ? ni / eq * 100 : null, periodKey: pk });
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
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = (mx - mn) * 0.1;
  const W = 280, H = 100, L = 38;
  const cw = W - L - 8, ch = H - 18;
  const xp = (i: number) => L + (i / (valid.length - 1)) * cw;
  const yp = (v: number) => 6 + ch - ((v - (mn - pad)) / ((mx + pad) - (mn - pad))) * ch;
  const pts = valid.map((d: any, i: number) => `${xp(i)},${yp(d.value)}`).join(' ');
  return (
    <div className="rounded-xl p-3 border bg-white/60 dark:bg-slate-900/60">
      <div className="text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[100px]">
        <polyline points={pts} fill="none" stroke={dark ? '#34d399' : '#059669'} strokeWidth="2" />
        {valid.map((d: any, i: number) => <circle key={i} cx={xp(i)} cy={yp(d.value)} r="2.5" fill={dark ? '#34d399' : '#059669'} />)}
      </svg>
    </div>
  );
};

function App() {
  const [lang, setLang] = useState<Language>('en');
  const [dark, setDark] = useState(true);
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState<any>(null);
  const [facts, setFacts] = useState<any>(null);
  const [mode, setMode] = useState<'Y' | 'Q'>('Y');
  const [view, setView] = useState<'table' | 'charts'>('table');
  const [scaleSlider, setScaleSlider] = useState(50);
  const [proxyBase, setProxyBase] = useState(localStorage.getItem('sec-proxy') || 'http://localhost:8012');

  const processed = useMemo(() => facts ? proc(facts, mode) : null, [facts, mode]);
  const scale = 0.7 + (scaleSlider / 100) * 0.8;

  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => { localStorage.setItem('sec-proxy', proxyBase); }, [proxyBase]);

  const fetchWithProxy = async (path: string) => {
    const res = await fetch(`${proxyBase}${path}`, {
      headers: { 'User-Agent': 'fundamentals-demo contact@daggerok.github.io' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const loadData = async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(''); setCompany(null); setFacts(null);

    try {
      let tickers: any = null;
      try { const r = await fetch('/data/company_tickers.json'); if (r.ok) tickers = await r.json(); } catch {}
      if (!tickers) tickers = await fetchWithProxy('/api/company_tickers');

      const list = Object.values(tickers || {}) as any[];
      const found = list.find((c: any) => c.ticker?.toUpperCase() === s);
      if (!found) throw new Error(`Ticker "${s}" not found`);

      const cik = String(found.cik_str).padStart(10, '0');
      const factsJson = await fetchWithProxy(`/api/xbrl/companyfacts/CIK${cik}.json`);

      const comp = { ticker: s, title: found.title, cik };
      setCompany(comp);
      setFacts(factsJson);
    } catch (e: any) {
      setError(e.message || t('error.proxy', lang));
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => loadData(ticker);

  const clearCache = () => {
    setFacts(null); setCompany(null); setError('');
    localStorage.removeItem('sec-last');
  };

  useEffect(() => {
    const last = localStorage.getItem('sec-last');
    if (last) {
      try {
        const p = JSON.parse(last);
        if (p.company && p.facts) {
          setCompany(p.company);
          setFacts(p.facts);
          setTicker(p.company.ticker);
        }
      } catch {}
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl">SEC Fundamentals</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">EDGAR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-slate-300 dark:border-slate-700 rounded-lg text-sm overflow-hidden">
              <button onClick={() => setMode('Y')} className={`px-3 py-1 ${mode === 'Y' ? 'bg-emerald-600 text-white' : ''}`}>{t('mode.y', lang)}</button>
              <button onClick={() => setMode('Q')} className={`px-3 py-1 ${mode === 'Q' ? 'bg-emerald-600 text-white' : ''}`}>{t('mode.q', lang)}</button>
            </div>
            <button onClick={() => setView(v => v === 'table' ? 'charts' : 'table')} className="px-3 py-1 text-sm border rounded-lg">
              {view === 'table' ? t('view.charts', lang) : t('view.table', lang)}
            </button>
            <button onClick={() => setDark(!dark)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button onClick={clearCache} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw size={17} /></button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            placeholder={t('search.placeholder', lang)}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={handleLoad} disabled={loading} className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl disabled:opacity-60">
            {loading ? t('search.loading', lang) : t('search.load', lang)}
          </button>
        </div>

        {error && <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 border border-red-200">{error}</div>}

        {company && (
          <div className="mb-4">
            <div className="text-3xl font-bold">{company.ticker}</div>
            <div className="text-slate-500">{company.title}</div>
          </div>
        )}

        {processed && (
          <div className="space-y-6">
            {SEC_SECTIONS.map((section, i) => {
              const all = [
                ...section.metrics.map(m => ({ ...m, series: processed.metricSeries[m.key] || [] })),
                ...(section.computed || []).map(c => ({ ...c, series: processed.computedSeries[c.key] || [] })),
              ].filter(m => m.series?.some((d: any) => d.value != null));
              if (!all.length) return null;

              return (
                <div key={i} className="fund-card rounded-3xl p-5 border">
                  <div className="flex justify-between items-center mb-3">
                    <div className="font-semibold text-lg">{section.title}</div>
                    <input type="range" min="0" max="100" value={scaleSlider} onChange={e => setScaleSlider(+e.target.value)} className="scale-slider w-20" />
                  </div>

                  {view === 'charts' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {all.map(m => <MiniChart key={m.key} data={m.series} label={m.label} unit={m.unit} dark={dark} />)}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="fund-table w-full text-sm" style={{ fontSize: `${Math.round(13 * scale)}px` }}>
                        <thead><tr><th className="text-left py-2">Metric</th>{processed.periodKeys.map((pk: any, i: number) => <th key={i} className="text-right px-2">{processed.getLabel(pk)}</th>)}</tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {all.map(m => (
                            <tr key={m.key}>
                              <td className="py-1.5 pr-3 font-medium">{m.label} <span className="text-xs text-slate-400">({m.unit})</span></td>
                              {m.series.map((d: any, i: number) => <td key={i} className="px-2 py-1.5 text-right font-mono">{fV(d.value, m.unit)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!company && !loading && <div className="text-center py-20 text-slate-500">{t('no.data', lang)}</div>}
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
