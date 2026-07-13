// main.tsx — fundamentals-runtime UI parity + EN/RU i18n
// Data/proxy logic matches fundamentals-runtime; language is the intentional delta.

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Fragment,
} from 'react';
import { createRoot } from 'react-dom/client';

type Language = 'en' | 'ru';
type Mode = 'Y' | 'Q';
type View = 'T' | 'C';

const LS_P = 'sec-dash-prefs';
const LS_C = 'sec-dash-cache';
const LS_LANG = 'sec-lang';

const translations: Record<Language, Record<string, string>> = {
  en: {
    'search.placeholder': 'Ticker or company name…',
    'search.load': 'Load',
    'proxy.title': 'Start two proxy terminals:',
    'proxy.retry': '↻ Retry',
    'proxy.orBun': 'Or one Bun proxy:',
    'error.retry': 'Retry',
    'no.data': 'Enter a ticker (AAPL, MSFT, NVDA…)',
    'console.toggle': 'Toggle console',
    'docs': 'docs',
    'metric': 'Metric',
    'section.income': '📊 Income Statement',
    'section.cash': '💰 Cash Flow',
    'section.balance': '🏦 Balance Sheet',
    'section.pershare': '📈 Per Share & Other',
  },
  ru: {
    'search.placeholder': 'Тикер или название компании…',
    'search.load': 'Загрузить',
    'proxy.title': 'Запустите два прокси-терминала:',
    'proxy.retry': '↻ Повтор',
    'proxy.orBun': 'Или один Bun-прокси:',
    'error.retry': 'Повтор',
    'no.data': 'Введите тикер (AAPL, MSFT, NVDA…)',
    'console.toggle': 'Консоль',
    'docs': 'docs',
    'metric': 'Метрика',
    'section.income': '📊 Отчёт о прибылях и убытках',
    'section.cash': '💰 Денежный поток',
    'section.balance': '🏦 Баланс',
    'section.pershare': '📈 На акцию и прочее',
  },
};

function t(key: string, lang: Language): string {
  return translations[lang]?.[key] || translations.en[key] || key;
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
    'DepreciationAmortizationAndAccretionNet',
  ],
  dividendsPaid: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
  shareRepurchase: [
    'PaymentsForRepurchaseOfCommonStock',
    'PaymentsForRepurchaseOfEquity',
  ],
  assets: ['Assets'],
  currentAssets: ['AssetsCurrent'],
  liabilities: ['Liabilities'],
  currentLiabilities: ['LiabilitiesCurrent'],
  equity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ],
  cash: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsAndShortTermInvestments',
  ],
  shortTermDebt: ['ShortTermBorrowings', 'DebtCurrent'],
  longTermDebt: ['LongTermDebt', 'LongTermDebtNoncurrent'],
  inventory: ['InventoryNet'],
  receivables: ['AccountsReceivableNetCurrent', 'AccountsReceivableNet'],
  payables: ['AccountsPayableCurrent'],
  goodwill: ['Goodwill'],
  intangibles: ['IntangibleAssetsNetExcludingGoodwill'],
  ppe: ['PropertyPlantAndEquipmentNet'],
  sharesOut: [
    'CommonStockSharesOutstanding',
    'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
    'WeightedAverageNumberOfDilutedSharesOutstanding',
  ],
  rnd: ['ResearchAndDevelopmentExpense'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
};

type MetricDef = { key: string; label: string; unit: string; raw?: boolean };
type SectionDef = {
  titleKey: string;
  title: string;
  color: string;
  hc: string;
  hcL: string;
  metrics: MetricDef[];
  computed?: MetricDef[];
};

const SEC: SectionDef[] = [
  {
    titleKey: 'section.income',
    title: '📊 Income Statement',
    color: 'emerald',
    hc: 'from-emerald-900/30 to-teal-900/20',
    hcL: 'from-emerald-50 to-teal-50',
    metrics: [
      { key: 'revenue', label: 'Revenue', unit: '$M' },
      { key: 'costOfRevenue', label: 'Cost of Revenue', unit: '$M' },
      { key: 'grossProfit', label: 'Gross Profit', unit: '$M' },
      { key: 'rnd', label: 'R&D Expense', unit: '$M' },
      { key: 'sga', label: 'SG&A Expense', unit: '$M' },
      { key: 'operatingIncome', label: 'Operating Income', unit: '$M' },
      { key: 'netIncome', label: 'Net Income', unit: '$M' },
      { key: 'eps', label: 'EPS', unit: '$', raw: true },
    ],
    computed: [
      { key: 'grossMargin', label: 'Gross Margin', unit: '%' },
      { key: 'netMargin', label: 'Net Margin', unit: '%' },
      { key: 'opMargin', label: 'Operating Margin', unit: '%' },
    ],
  },
  {
    titleKey: 'section.cash',
    title: '💰 Cash Flow',
    color: 'blue',
    hc: 'from-blue-900/30 to-cyan-900/20',
    hcL: 'from-blue-50 to-cyan-50',
    metrics: [
      { key: 'ocf', label: 'Operating CF', unit: '$M' },
      { key: 'capex', label: 'CapEx', unit: '$M' },
      { key: 'depreciation', label: 'D&A', unit: '$M' },
      { key: 'dividendsPaid', label: 'Dividends Paid', unit: '$M' },
      { key: 'shareRepurchase', label: 'Share Buybacks', unit: '$M' },
    ],
    computed: [{ key: 'fcf', label: 'Free Cash Flow', unit: '$M' }],
  },
  {
    titleKey: 'section.balance',
    title: '🏦 Balance Sheet',
    color: 'purple',
    hc: 'from-purple-900/30 to-pink-900/20',
    hcL: 'from-purple-50 to-pink-50',
    metrics: [
      { key: 'assets', label: 'Total Assets', unit: '$M' },
      { key: 'currentAssets', label: 'Current Assets', unit: '$M' },
      { key: 'cash', label: 'Cash & Equiv.', unit: '$M' },
      { key: 'receivables', label: 'Receivables', unit: '$M' },
      { key: 'inventory', label: 'Inventory', unit: '$M' },
      { key: 'ppe', label: 'PP&E', unit: '$M' },
      { key: 'goodwill', label: 'Goodwill', unit: '$M' },
      { key: 'intangibles', label: 'Intangibles', unit: '$M' },
      { key: 'liabilities', label: 'Total Liabilities', unit: '$M' },
      { key: 'currentLiabilities', label: 'Current Liabilities', unit: '$M' },
      { key: 'payables', label: 'Accounts Payable', unit: '$M' },
      { key: 'shortTermDebt', label: 'Short-term Debt', unit: '$M' },
      { key: 'longTermDebt', label: 'Long-term Debt', unit: '$M' },
      { key: 'equity', label: 'Equity', unit: '$M' },
    ],
    computed: [
      { key: 'roe', label: 'ROE', unit: '%' },
      { key: 'roa', label: 'ROA', unit: '%' },
      { key: 'debtToEquity', label: 'Debt/Equity', unit: 'x' },
      { key: 'currentRatio', label: 'Current Ratio', unit: 'x' },
    ],
  },
  {
    titleKey: 'section.pershare',
    title: '📈 Per Share & Other',
    color: 'amber',
    hc: 'from-amber-900/30 to-orange-900/20',
    hcL: 'from-amber-50 to-orange-50',
    metrics: [{ key: 'sharesOut', label: 'Shares Outstanding', unit: '#M' }],
    computed: [
      { key: 'revenuePerShare', label: 'Revenue/Share', unit: '$' },
      { key: 'fcfPerShare', label: 'FCF/Share', unit: '$' },
    ],
  },
];

const TC: Record<
  string,
  { dark: { line: string; fill: string; text: string }; light: { line: string; fill: string; text: string } }
> = {
  emerald: {
    dark: { line: '#34d399', fill: 'rgba(52,211,153,0.15)', text: 'text-emerald-400' },
    light: { line: '#059669', fill: 'rgba(5,150,105,0.12)', text: 'text-emerald-700' },
  },
  blue: {
    dark: { line: '#60a5fa', fill: 'rgba(96,165,250,0.15)', text: 'text-blue-400' },
    light: { line: '#2563eb', fill: 'rgba(37,99,235,0.12)', text: 'text-blue-700' },
  },
  purple: {
    dark: { line: '#c084fc', fill: 'rgba(192,132,252,0.15)', text: 'text-purple-400' },
    light: { line: '#7c3aed', fill: 'rgba(124,58,237,0.12)', text: 'text-purple-700' },
  },
  amber: {
    dark: { line: '#fbbf24', fill: 'rgba(251,191,36,0.15)', text: 'text-amber-400' },
    light: { line: '#d97706', fill: 'rgba(217,119,6,0.12)', text: 'text-amber-700' },
  },
};

const WWW_CANDIDATES = [8011, 8010, 8080, 3000, 8012].map((p) => `http://localhost:${p}/proxy`);
const DATA_CANDIDATES = [8012, 8010, 8080, 3000, 8011].map((p) => `http://localhost:${p}/proxy`);
const UNIFIED = ['http://localhost:8012', 'http://localhost:8010'];

function lp(): any {
  try {
    return JSON.parse(localStorage.getItem(LS_P) || '{}');
  } catch {
    return {};
  }
}
function sp(p: any) {
  try {
    localStorage.setItem(LS_P, JSON.stringify(p));
  } catch {}
}
function lc(): any {
  try {
    return JSON.parse(localStorage.getItem(LS_C) || 'null');
  } catch {
    return null;
  }
}
function sc(c: any) {
  try {
    const j = JSON.stringify(c);
    if (j.length < 4 * 1024 * 1024) localStorage.setItem(LS_C, j);
  } catch {}
}
function cc() {
  try {
    localStorage.removeItem(LS_C);
  } catch {}
}

async function probe(cands: string[], path: string): Promise<{ base: string; res: Response }> {
  const e: string[] = [];
  for (const b of cands) {
    try {
      const r = await fetch(b + path);
      if (r.ok) return { base: b, res: r };
      e.push(`${b}${path}→${r.status}`);
    } catch (x: any) {
      e.push(`${b}${path}→${x?.message || x}`);
    }
  }
  throw new Error('Proxy not reachable:\n' + e.join('\n'));
}

function normalizeFacts(raw: any): any {
  if (!raw) return null;
  if (raw['us-gaap']) return raw;
  if (raw.facts) return raw.facts;
  return raw;
}

function exM(facts: any, keys: string[], mode: Mode) {
  const g = facts?.['us-gaap'] || facts?.facts?.['us-gaap'];
  if (!g) return [];
  let r: any[] = [];
  for (const k of keys) {
    const s =
      g[k]?.units?.USD ||
      g[k]?.units?.['USD/shares'] ||
      g[k]?.units?.shares ||
      g[k]?.units?.pure;
    if (s) {
      if (mode === 'Y') r = r.concat(s.filter((p: any) => p.form === '10-K' && p.fp === 'FY'));
      else
        r = r.concat(
          s.filter((p: any) => p.form === '10-Q' || (p.form === '10-K' && p.fp === 'FY')),
        );
    }
  }
  const m = new Map();
  const o: Record<string, number> = { FY: 4, Q4: 4, Q3: 3, Q2: 2, Q1: 1 };
  if (mode === 'Y')
    r.sort((a, b) => +new Date(b.filed) - +new Date(a.filed)).forEach((x) => {
      if (!m.has(x.fy)) m.set(x.fy, x);
    });
  else
    r.sort((a, b) => +new Date(b.filed) - +new Date(a.filed)).forEach((x) => {
      const k = `${x.fy}-${x.fp}`;
      if (!m.has(k)) m.set(k, x);
    });
  return Array.from(m.values()).sort((a: any, b: any) => {
    if (b.fy !== a.fy) return b.fy - a.fy;
    return (o[b.fp] || 0) - (o[a.fp] || 0);
  });
}

const fV = (v: any, u: string) => {
  if (v == null) return '—';
  if (u === '$M')
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v / 1e6);
  if (u === '$') return '$' + Number(v).toFixed(2);
  if (u === '%') return v.toFixed(1) + '%';
  if (u === 'x') return v.toFixed(2) + 'x';
  if (u === '#M')
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v / 1e6);
  return String(v);
};
const fA = (v: any, u: string) => {
  if (v == null) return '—';
  if (u === '$M' || u === '#M') return (v / 1e6).toFixed(0);
  if (u === '$') return Number(v).toFixed(1);
  if (u === '%') return v.toFixed(1);
  if (u === 'x') return v.toFixed(1);
  return String(v);
};

const sliderToScale = (v: number) => 0.7 + (v / 100) * 0.8;
const DEFAULT_SCALE_SLIDER = 50;

function proc(facts: any, mode: Mode) {
  const ex: any = {};
  for (const [k, c] of Object.entries(CON)) ex[k] = exM(facts, c, mode);
  const allE = Object.values(ex).flat() as any[];
  let pK: any[];
  if (mode === 'Y') pK = [...new Set(allE.map((d) => d.fy))].sort((a: any, b: any) => a - b);
  else {
    pK = [...new Set(allE.map((d) => `${d.fy}-${d.fp}`))];
    pK.sort((a, b) => {
      const [ay, af] = String(a).split('-'),
        [by, bf] = String(b).split('-');
      if (ay !== by) return Number(ay) - Number(by);
      const o: any = { Q1: 1, Q2: 2, Q3: 3, FY: 4, Q4: 4 };
      return (o[af] || 0) - (o[bf] || 0);
    });
  }
  const gv = (k: string, pk: any) => {
    const a = ex[k] || [];
    if (mode === 'Y') return a.find((d: any) => d.fy === pk)?.val;
    const [fy, fp] = String(pk).split('-');
    return a.find((d: any) => d.fy === Number(fy) && d.fp === fp)?.val;
  };
  const gl = (pk: any) => {
    if (mode === 'Y') return String(pk);
    const [fy, fp] = String(pk).split('-');
    return fp === 'FY' ? fy : `${fy} ${fp}`;
  };
  const ms: any = {};
  const ak = new Set<string>();
  SEC.forEach((s) => s.metrics.forEach((mt) => ak.add(mt.key)));
  for (const k of ak) ms[k] = pK.map((pk) => ({ label: gl(pk), value: gv(k, pk), periodKey: pk }));
  const cs = (k: string) =>
    pK.map((pk) => {
      const rev = gv('revenue', pk),
        gp = gv('grossProfit', pk),
        ni = gv('netIncome', pk),
        oi = gv('operatingIncome', pk),
        ocf = gv('ocf', pk),
        cx = gv('capex', pk),
        eq = gv('equity', pk),
        ast = gv('assets', pk),
        ltd = gv('longTermDebt', pk),
        std = gv('shortTermDebt', pk),
        ca = gv('currentAssets', pk),
        cl = gv('currentLiabilities', pk),
        sh = gv('sharesOut', pk);
      let v: any;
      switch (k) {
        case 'grossMargin':
          v = gp != null && rev != null && rev ? (gp / rev) * 100 : null;
          break;
        case 'netMargin':
          v = ni != null && rev != null && rev ? (ni / rev) * 100 : null;
          break;
        case 'opMargin':
          v = oi != null && rev != null && rev ? (oi / rev) * 100 : null;
          break;
        case 'fcf':
          v = ocf != null && cx != null ? ocf - cx : null;
          break;
        case 'roe':
          v = ni != null && eq != null && eq ? (ni / eq) * 100 : null;
          break;
        case 'roa':
          v = ni != null && ast != null && ast ? (ni / ast) * 100 : null;
          break;
        case 'debtToEquity': {
          const d = (ltd || 0) + (std || 0);
          v = d && eq ? d / eq : null;
          break;
        }
        case 'currentRatio':
          v = ca != null && cl != null && cl ? ca / cl : null;
          break;
        case 'revenuePerShare':
          v = rev != null && sh ? rev / sh : null;
          break;
        case 'fcfPerShare': {
          const f = ocf != null && cx != null ? ocf - cx : null;
          v = f != null && sh ? f / sh : null;
          break;
        }
        default:
          v = null;
      }
      return { label: gl(pk), value: v, periodKey: pk };
    });
  const cS: any = {};
  SEC.forEach((s) => (s.computed || []).forEach((c) => {
    cS[c.key] = cs(c.key);
  }));
  return { metricSeries: ms, computedSeries: cS, periodKeys: pK, getLabel: gl };
}

const MiniChart = ({
  data,
  color,
  unit,
  label,
  dark,
  scale,
}: {
  data: any[];
  color: { line: string; fill: string };
  unit: string;
  label: string;
  dark: boolean;
  scale: number;
}) => {
  const valid = data.filter((d) => d.value != null);
  const cRef = useRef<HTMLDivElement>(null);
  const [cW, setCW] = useState(400);
  useEffect(() => {
    if (!cRef.current) return;
    const ro = new ResizeObserver((e) => {
      for (const en of e) setCW(en.contentRect.width);
    });
    ro.observe(cRef.current);
    setCW(cRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  if (valid.length < 2) return null;
  const ANG = 35,
    RAD = (ANG * Math.PI) / 180;
  const fs = Math.round(7 * scale),
    fsL = Math.round(8 * scale),
    fsT = Math.round(12 * scale);
  const maxLL = Math.max(...valid.map((d) => String(d.label).length));
  const charW = fs * 0.72;
  const angH = Math.sin(RAD) * maxLL * charW + 8;
  const W = Math.max(280, cW - 24);
  const PAD = { t: 20, r: 15, b: Math.max(40, angH + 10), l: Math.max(50, 45 * scale) };
  const H = Math.max(140, Math.min(200, W * 0.4)) + PAD.b - 40;
  const cw = W - PAD.l - PAD.r,
    ch = H - PAD.t - PAD.b;
  const vals = valid.map((d) => d.value);
  let mn = Math.min(...vals),
    mx = Math.max(...vals);
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }
  const pd = (mx - mn) * 0.1;
  mn -= pd;
  mx += pd;
  const xp = (i: number) => PAD.l + (i / (valid.length - 1)) * cw;
  const yp = (v: number) => PAD.t + ch - ((v - mn) / (mx - mn)) * ch;
  const pts = valid.map((d, i) => `${xp(i)},${yp(d.value)}`).join(' ');
  const area = `${PAD.l},${PAD.t + ch} ${pts} ${xp(valid.length - 1)},${PAD.t + ch}`;
  const yTicks = 4;
  const yL = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = mn + (mx - mn) * (i / yTicks);
    return { y: yp(v), label: fA(v, unit) };
  });
  const gc = dark ? '#334155' : '#e2e8f0',
    lcc = dark ? '#64748b' : '#94a3b8';
  const minSp = 22;
  const step = Math.max(1, Math.ceil((minSp * valid.length) / cw));
  return (
    <div
      ref={cRef}
      className={`rounded-lg p-3 border ${dark ? 'bg-slate-900/50 border-slate-700/30' : 'bg-white/60 border-slate-200'}`}
    >
      <div className={`mb-1 font-medium ${dark ? 'text-slate-400' : 'text-slate-600'}`} style={{ fontSize: fsT }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {yL.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={tick.y} x2={W - PAD.r} y2={tick.y} stroke={gc} strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={PAD.l - 4} y={tick.y + 3} textAnchor="end" fill={lcc} fontSize={fsL} fontFamily="monospace">
              {tick.label}
            </text>
          </g>
        ))}
        <line x1={PAD.l} y1={PAD.t + ch} x2={W - PAD.r} y2={PAD.t + ch} stroke={gc} strokeWidth="0.5" />
        <polygon points={area} fill={color.fill} />
        <polyline points={pts} fill="none" stroke={color.line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {valid.map((d, i) => (
          <circle key={i} cx={xp(i)} cy={yp(d.value)} r="3" fill={color.line} />
        ))}
        {valid.map((d, i) => {
          if (i % step !== 0 && i !== valid.length - 1) return null;
          const cx = xp(i),
            ty = PAD.t + ch;
          return (
            <g key={`x-${i}`}>
              <line x1={cx} y1={ty} x2={cx} y2={ty + 4} stroke={lcc} strokeWidth="0.5" />
              <text
                x={cx}
                y={ty + 8}
                textAnchor="end"
                fill={lcc}
                fontSize={fs}
                fontFamily="monospace"
                transform={`rotate(-${ANG},${cx},${ty + 8})`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

type PillOption = string | { k: string; l: string };
const Pill = ({
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
}) => (
  <div
    title={title}
    className={`flex-shrink-0 flex items-center rounded-lg p-0.5 border ${dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}
  >
    {options.map((opt) => {
      const k = typeof opt === 'string' ? opt : opt.k;
      const l = typeof opt === 'string' ? opt : opt.l;
      return (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-2.5 py-1 rounded-md text-sm font-bold leading-none transition-all ${
            value === k
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

function App() {
  const prefs = useMemo(() => lp(), []);
  const cached = useMemo(() => lc(), []);

  const [lang, setLang] = useState<Language>(
    () => (localStorage.getItem(LS_LANG) as Language) || 'en',
  );
  const [ticker, setTicker] = useState(prefs.ticker || 'AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(!!prefs.showDebug);
  const [company, setCompany] = useState<any>(cached?.company || null);
  const [tickers, setTickers] = useState<any>(null);
  const [tkL, setTkL] = useState(false);
  const [wwwOk, setWwwOk] = useState(false);
  const [dataOk, setDataOk] = useState(!!cached?.company);
  const [wwwBase, setWwwBase] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(prefs.mode || 'Y');
  const [view, setView] = useState<View>(prefs.view || 'T');
  const [dark, setDark] = useState(prefs.dark !== false);
  const [factsCache, setFactsCache] = useState<any>(cached?.facts || null);
  const [pd, setPd] = useState<any>(null);
  const [sug, setSug] = useState<any[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [selIdx, setSelIdx] = useState(-1);
  const [scaleSlider, setScaleSlider] = useState(prefs.scaleSlider ?? DEFAULT_SCALE_SLIDER);
  const iRef = useRef<HTMLInputElement>(null);
  const sRef = useRef<HTMLDivElement>(null);

  const scale = sliderToScale(scaleSlider);

  const log = useCallback((msg: string) => {
    console.log(msg);
    setLogs((p) => [...p.slice(-29), msg]);
  }, []);

  useEffect(() => {
    if (cached?.facts && cached?.company) {
      log(`Restored ${cached.company.ticker}`);
      setPd(proc(normalizeFacts(cached.facts), mode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sp({ ticker, mode, view, dark, showDebug, scaleSlider });
  }, [ticker, mode, view, dark, showDebug, scaleSlider]);

  useEffect(() => {
    localStorage.setItem(LS_LANG, lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.backgroundColor = dark ? '#020617' : '#f8fafc';
    document.documentElement.style.color = dark ? '#f1f5f9' : '#0f172a';
    document.body.style.backgroundColor = dark ? '#020617' : '#f8fafc';
    document.body.style.color = dark ? '#f1f5f9' : '#0f172a';
  }, [dark]);

  useEffect(() => {
    if (factsCache) setPd(proc(normalizeFacts(factsCache), mode));
  }, [mode, factsCache]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        showSug &&
        sRef.current &&
        !sRef.current.contains(e.target as Node) &&
        iRef.current &&
        !iRef.current.contains(e.target as Node)
      )
        setShowSug(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showSug]);

  const init = async () => {
    setTkL(true);
    setError(null);
    setLogs([]);
    log('Probing www.sec.gov proxy…');
    try {
      // Prefer static tickers on GitHub Pages
      let data: any = null;
      try {
        const r = await fetch('/data/company_tickers.json');
        if (r.ok) {
          data = await r.json();
          const n = data && typeof data === 'object' ? Object.keys(data).length : 0;
          if (n >= 50) {
            setTickers(data);
            setWwwOk(true);
            log(`✅ static tickers (${n})`);
            setTkL(false);
            return;
          }
          data = null;
        }
      } catch {}

      const cands = [...new Set([...WWW_CANDIDATES, ...UNIFIED])];
      const { base, res } = await probe(cands, '/files/company_tickers.json');
      setWwwOk(true);
      setWwwBase(base);
      log(`✅ www proxy: ${base}`);
      data = await res.json();
      setTickers(data);
      log(`✅ ${Object.keys(data).length} tickers`);
    } catch (e: any) {
      log(`❌ ${e.message}`);
      setError(e.message);
      setWwwOk(false);
    } finally {
      setTkL(false);
    }
  };

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (sym: string) => {
    sym = (sym || '').trim().toUpperCase();
    setError(null);
    setCompany(null);
    setPd(null);
    setFactsCache(null);
    if (!sym || !tickers) return;
    setLoading(true);
    setLogs([]);
    try {
      const co = (Object.values(tickers) as any[]).find((c) => c.ticker === sym);
      if (!co) throw new Error(`"${sym}" not found`);
      const cik = String(co.cik_str).padStart(10, '0');
      log(`${sym} → CIK ${cik}`);
      const dataCands = [
        ...new Set([...(wwwBase ? [] : []), ...DATA_CANDIDATES, ...UNIFIED]),
      ];
      const { base, res } = await probe(dataCands, `/api/xbrl/companyfacts/CIK${cik}.json`);
      setDataOk(true);
      log(`✅ data proxy: ${base}`);
      if (wwwBase) log(`✅ www proxy: ${wwwBase}`);
      const raw = await res.json();
      const facts = normalizeFacts(raw);
      if (!facts?.['us-gaap']) throw new Error('No us-gaap in companyfacts');
      setFactsCache(facts);
      const comp = { title: co.title || raw?.entityName, cik, ticker: sym };
      setCompany(comp);
      setPd(proc(facts, mode));
      sc({ facts, company: comp });
      log('✅ Done');
    } catch (e: any) {
      log(`❌ ${e.message}`);
      setError(e.message);
      cc();
    } finally {
      setLoading(false);
    }
  };

  const hd = (s: any) => s && s.some((d: any) => d.value != null);

  const hIC = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTicker(v);
    setSelIdx(-1);
    if (!tickers || !v.trim()) {
      setSug([]);
      setShowSug(false);
      return;
    }
    const q = v.trim().toUpperCase();
    const list = (Object.values(tickers) as any[])
      .filter((c) => c.ticker?.startsWith(q) || c.title?.toUpperCase().includes(q))
      .slice(0, 12);
    setSug(list);
    setShowSug(list.length > 0);
  };
  const hIF = () => {
    if (sug.length) setShowSug(true);
  };
  const selS = (tk: string) => {
    setTicker(tk);
    setShowSug(false);
    setSug([]);
    search(tk);
  };
  const hKD = (e: React.KeyboardEvent) => {
    if (!showSug || !sug.length) {
      if (e.key === 'Enter') {
        setShowSug(false);
        search(ticker);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelIdx((i) => Math.min(i + 1, sug.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selIdx >= 0) selS(sug[selIdx].ticker);
      else {
        setShowSug(false);
        search(ticker);
      }
    } else if (e.key === 'Escape') setShowSug(false);
  };

  const bg = dark ? 'bg-slate-950/95 text-slate-100' : 'bg-white/95 text-slate-900';
  const bdr = dark ? 'border-slate-800' : 'border-slate-200';
  const card = dark
    ? 'bg-slate-800 border-slate-600 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-sm';
  const inp = dark
    ? 'bg-slate-800 border-slate-700 text-emerald-400'
    : 'bg-slate-50 border-slate-300 text-emerald-700';
  const mt = dark ? 'text-slate-400' : 'text-slate-500';
  const t1 = dark ? 'text-slate-100' : 'text-slate-800';
  const t2 = dark ? 'text-slate-300' : 'text-slate-600';
  const nc = dark ? 'text-red-400' : 'text-red-600';
  const sB = dark ? 'bg-slate-800' : 'bg-white';
  const hR = dark ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50';
  const scCls = dark ? 'dark-scroll' : 'light-scroll';
  const sugBg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-lg';
  const sugH = dark ? 'bg-slate-700' : 'bg-slate-100';
  const sugH2 = dark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50';
  const dotOn = dark ? 'bg-emerald-500' : 'bg-emerald-600';
  const dotOff = dark ? 'bg-slate-600' : 'bg-slate-300';

  const tblFs = `${Math.round(14 * scale)}px`;
  const tblHFs = `${Math.round(11 * scale)}px`;
  const tblCellPy = `${Math.round(10 * scale)}px`;

  return (
    <Fragment>
      <div className={`sticky top-0 z-50 ${bg} backdrop-blur-md border-b ${bdr}`}>
        <div className="px-4 xl:px-8">
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => setShowDebug((p) => !p)}
              className={`flex-shrink-0 text-xs px-2 py-1.5 rounded transition-colors ${
                showDebug
                  ? dark
                    ? 'bg-slate-700 text-slate-300'
                    : 'bg-slate-200 text-slate-600'
                  : dark
                    ? 'text-slate-600 hover:text-slate-400'
                    : 'text-slate-400 hover:text-slate-600'
              }`}
              title={t('console.toggle', lang)}
            >
              ⌘
            </button>
            <div
              className="flex gap-1.5 flex-shrink-0"
              title={`www: ${wwwOk ? '✓' : '✗'}\ndata: ${dataOk ? '✓' : '…'}`}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${wwwOk ? dotOn : 'bg-red-500'}`} />
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  dataOk ? dotOn : tkL || loading ? 'bg-yellow-400 animate-pulse' : dotOff
                }`}
              />
            </div>
            <div className="flex-1 min-w-0 relative">
              <input
                ref={iRef}
                type="text"
                value={ticker}
                onChange={hIC}
                onFocus={hIF}
                onKeyDown={hKD}
                placeholder={t('search.placeholder', lang)}
                className={`w-full ${inp} border rounded-lg px-3 py-2 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500 transition-colors uppercase`}
                disabled={!tickers}
              />
              {showSug && sug.length > 0 && (
                <div
                  ref={sRef}
                  className={`absolute top-full left-0 right-0 mt-1 ${sugBg} border rounded-lg overflow-hidden z-50 max-w-xl`}
                >
                  {sug.map((s, i) => (
                    <button
                      key={s.ticker}
                      type="button"
                      onClick={() => selS(s.ticker)}
                      onMouseEnter={() => setSelIdx(i)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                        i === selIdx ? sugH : sugH2
                      }`}
                    >
                      <span
                        className={`font-mono font-bold text-sm w-14 flex-shrink-0 ${
                          dark ? 'text-emerald-400' : 'text-emerald-700'
                        }`}
                      >
                        {s.ticker}
                      </span>
                      <span className={`text-xs truncate ${t2}`}>{s.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setShowSug(false);
                iRef.current?.blur();
                search(ticker);
              }}
              disabled={loading || !tickers}
              className="flex-shrink-0 flex items-center bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-all active:scale-95 disabled:opacity-40"
            >
              {loading ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className={`flex-shrink-0 text-sm px-2 py-1.5 rounded transition-colors ${
                dark ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {dark ? '☀' : '🌙'}
            </button>
            <Pill
              value={lang}
              options={[
                { k: 'en', l: '🇺🇸' },
                { k: 'ru', l: '🇷🇺' },
              ]}
              onChange={(k) => setLang(k as Language)}
              dark={dark}
              title="Language / Язык"
            />
            <a
              href="https://github.com/daggerok/fundamentals/tree/master/docs"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex-shrink-0 text-xs px-2 py-1 rounded transition-colors ${
                dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
              title={t('docs', lang)}
            >
              📄 {t('docs', lang)}
            </a>
            {(company || pd) && (
              <Fragment>
                <Pill value={mode} options={['Y', 'Q']} onChange={(k) => setMode(k as Mode)} dark={dark} />
                <Pill
                  value={view}
                  options={[
                    { k: 'T', l: '⊞' },
                    { k: 'C', l: '◔' },
                  ]}
                  onChange={(k) => setView(k as View)}
                  dark={dark}
                />
              </Fragment>
            )}
          </div>
          <div className={`console-wrap ${showDebug && logs.length > 0 ? 'open' : ''}`}>
            <div className="console-inner">
              <div className="pb-2 -mt-1">
                <div
                  className={`${dark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'} border rounded-lg px-3 py-1.5 font-mono text-[11px] overflow-x-auto whitespace-nowrap ${scCls}`}
                >
                  {logs.map((l, i) => (
                    <span key={i}>
                      {i > 0 && <span className={dark ? 'text-slate-700' : 'text-slate-300'}> · </span>}
                      <span
                        className={
                          l.startsWith('✅')
                            ? 'text-emerald-500'
                            : l.startsWith('❌')
                              ? 'text-red-500'
                              : mt
                        }
                      >
                        {l}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 xl:px-8 py-6">
        {!tickers && !tkL && (
          <div className={`${card} border rounded-xl p-5 mb-6 text-sm max-w-3xl mx-auto`}>
            <p className={`font-bold mb-3 ${t1}`}>{t('proxy.title', lang)}</p>
            <div className="grid md:grid-cols-2 gap-3">
              <pre
                className={`${dark ? 'bg-slate-900 text-emerald-300' : 'bg-slate-50 text-emerald-700'} p-3 rounded text-xs font-mono`}
              >{`local-cors-proxy \\\n  --proxyUrl https://www.sec.gov \\\n  --port 8011`}</pre>
              <pre
                className={`${dark ? 'bg-slate-900 text-emerald-300' : 'bg-slate-50 text-emerald-700'} p-3 rounded text-xs font-mono`}
              >{`local-cors-proxy \\\n  --proxyUrl https://data.sec.gov \\\n  --port 8012`}</pre>
            </div>
            <p className={`mt-3 text-xs ${mt}`}>{t('proxy.orBun', lang)}</p>
            <pre
              className={`${dark ? 'bg-slate-900 text-emerald-300' : 'bg-slate-50 text-emerald-700'} p-3 rounded text-xs font-mono mt-1`}
            >{`bun ./scripts/sec-proxy.ts`}</pre>
            <button onClick={init} className="mt-3 text-emerald-500 text-xs hover:underline">
              {t('proxy.retry', lang)}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm flex items-start gap-2 animate-fade-in max-w-3xl mx-auto whitespace-pre-wrap">
            <span className="flex-shrink-0 mt-0.5">✕</span>
            <span className="flex-1 font-mono text-xs">{error}</span>
            <button onClick={init} className="text-xs hover:underline flex-shrink-0">
              {t('error.retry', lang)}
            </button>
          </div>
        )}

        {company && !loading && pd && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className={`text-3xl font-bold ${t1}`}>{company.ticker}</div>
                <div className={`text-sm ${t2}`}>
                  {company.title} · CIK {company.cik}
                </div>
              </div>
            </div>

            {SEC.map((section) => {
              const { metricSeries, computedSeries } = pd;
              const allM = [
                ...section.metrics.map((m) => ({ ...m, series: metricSeries[m.key] })),
                ...(section.computed || []).map((c) => ({
                  ...c,
                  series: computedSeries[c.key],
                })),
              ].filter((m) => hd(m.series));
              if (!allM.length) return null;
              const clr = TC[section.color][dark ? 'dark' : 'light'];
              const header = (
                <div
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 bg-gradient-to-r ${
                    dark ? section.hc : section.hcL
                  } border-b ${bdr}`}
                >
                  <div className={`font-semibold text-sm ${clr.text}`}>
                    {t(section.titleKey, lang) || section.title}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={scaleSlider}
                    onChange={(e) => setScaleSlider(+e.target.value)}
                    className="scale-slider w-24"
                  />
                </div>
              );

              if (view === 'C')
                return (
                  <div key={section.title} className={`${card} border rounded-xl overflow-hidden shadow-lg`}>
                    {header}
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                      {allM.map((m) => (
                        <MiniChart
                          key={m.key}
                          data={m.series}
                          color={clr}
                          unit={m.unit}
                          label={m.label}
                          dark={dark}
                          scale={scale}
                        />
                      ))}
                    </div>
                  </div>
                );

              // Table view (runtime)
              const pks = pd.periodKeys as any[];
              return (
                <div key={section.title} className={`${card} border rounded-xl overflow-hidden shadow-lg`}>
                  {header}
                  <div className={`overflow-x-auto ${scCls}`}>
                    <table className="w-full text-sm" style={{ fontSize: tblFs }}>
                      <thead>
                        <tr className={dark ? 'bg-slate-900/40' : 'bg-slate-50'}>
                          <th
                            className={`text-left px-4 sticky left-0 z-10 ${sB} font-bold uppercase tracking-wide ${mt}`}
                            style={{ fontSize: tblHFs, paddingTop: tblCellPy, paddingBottom: tblCellPy }}
                          >
                            {t('metric', lang)}
                          </th>
                          {pks.map((pk: any, j: number) => (
                            <th
                              key={j}
                              className={`text-right px-3 font-bold uppercase tracking-wide ${mt} whitespace-nowrap`}
                              style={{ fontSize: tblHFs, paddingTop: tblCellPy, paddingBottom: tblCellPy }}
                            >
                              {pd.getLabel(pk)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allM.map((m) => (
                          <tr key={m.key} className={`border-t ${bdr} ${hR}`}>
                            <td
                              className={`px-4 font-medium ${t1} sticky left-0 z-10 ${sB} whitespace-nowrap`}
                              style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}
                            >
                              {m.label}{' '}
                              <span className={`text-xs ${mt}`}>({m.unit})</span>
                            </td>
                            {m.series.map((d: any, j: number) => (
                              <td
                                key={j}
                                className={`px-3 text-right font-mono ${
                                  d.value != null && d.value < 0 ? nc : t1
                                }`}
                                style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}
                              >
                                {fV(d.value, m.unit)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!company && !loading && tickers && (
          <div className={`text-center py-20 ${mt}`}>{t('no.data', lang)}</div>
        )}
      </div>
    </Fragment>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
