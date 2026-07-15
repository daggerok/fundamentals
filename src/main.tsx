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
import {
  detectPrimaryCurrency,
  extractMetric,
  hasUsableFacts,
  inspectReporting,
  normalizeFacts,
  staticDataUrl,
  type ReportingInfo,
} from './data-utils';

type Language = 'en' | 'ru';
type Mode = 'Y' | 'Q' | 'I';
type View = 'T' | 'C';
/** CACHE = same-origin ./data/{TICKER}.json (GitHub Pages); LIVE = SEC via proxy */
type DataSource = 'cache' | 'live';

/**
 * Shared color palettes across daggerok apps (fundamentals + options-desk).
 * Each product keeps its native default; the other palette is selectable so a
 * future merge ships with both UIs already consistent.
 *  - fundamentals → Emerald Ledger (emerald accents, slate-950 dark surface)
 *  - options-desk → Indigo Desk     (indigo accents, slate-900 dark surface)
 */
type ColorThemeId = 'fundamentals' | 'options-desk';
const DEFAULT_COLOR_THEME: ColorThemeId = 'fundamentals';

type AccentPalette = {
  btn: string;
  pillActive: string;
  focusBorder: string;
  accentInput: string;
  textDark: string;
  textLight: string;
  textSoftDark: string;
  textSoftLight: string;
  chipActiveDark: string;
  chipActiveLight: string;
  monoBlockDark: string;
  monoBlockLight: string;
  statusOk: string;
  dotOnDark: string;
  dotOnLight: string;
  sun: string;
};

const ACCENT: Record<ColorThemeId, AccentPalette> = {
  fundamentals: {
    btn: 'bg-emerald-500 hover:bg-emerald-400',
    pillActive: 'bg-emerald-500 text-white shadow-sm',
    focusBorder: 'focus:border-emerald-500',
    accentInput: 'accent-emerald-500',
    textDark: 'text-emerald-400',
    textLight: 'text-emerald-700',
    textSoftDark: 'text-emerald-300',
    textSoftLight: 'text-emerald-700',
    chipActiveDark: 'bg-slate-700 text-emerald-400',
    chipActiveLight: 'bg-slate-200 text-emerald-700',
    monoBlockDark: 'bg-slate-900 text-emerald-300',
    monoBlockLight: 'bg-slate-50 text-emerald-700',
    statusOk: 'text-emerald-500',
    dotOnDark: 'bg-emerald-500',
    dotOnLight: 'bg-emerald-600',
    sun: 'text-yellow-400',
  },
  'options-desk': {
    btn: 'bg-indigo-600 hover:bg-indigo-500',
    pillActive: 'bg-indigo-600 text-white shadow-sm',
    focusBorder: 'focus:border-indigo-500',
    accentInput: 'accent-indigo-600',
    textDark: 'text-indigo-400',
    textLight: 'text-indigo-700',
    textSoftDark: 'text-indigo-300',
    textSoftLight: 'text-indigo-700',
    chipActiveDark: 'bg-slate-700 text-indigo-400',
    chipActiveLight: 'bg-slate-200 text-indigo-700',
    monoBlockDark: 'bg-slate-900 text-indigo-300',
    monoBlockLight: 'bg-slate-50 text-indigo-700',
    statusOk: 'text-indigo-500',
    dotOnDark: 'bg-indigo-500',
    dotOnLight: 'bg-indigo-600',
    sun: 'text-yellow-400',
  },
};

/** Dark surface differs slightly between product palettes (merge-ready). */
const SURFACE = {
  fundamentals: { darkBg: '#020617', lightBg: '#f8fafc', darkFg: '#f1f5f9', lightFg: '#0f172a' },
  'options-desk': { darkBg: '#0f172a', lightBg: '#f8fafc', darkFg: '#e2e8f0', lightFg: '#0f172a' },
} as const;

function normalizeColorTheme(v: unknown): ColorThemeId {
  return v === 'options-desk' ? 'options-desk' : DEFAULT_COLOR_THEME;
}

const LS_P = 'sec-dash-prefs';
const LS_C = 'sec-dash-cache';
const LS_LANG = 'sec-lang';

const PROXY_COMMAND = 'bun install -E && bun serve:proxy';

const translations: Record<Language, Record<string, string>> = {
  en: {
    'search.placeholder': 'Ticker or company name…',
    'search.load': 'Load data',
    'proxy.title': 'LIVE data needs the local SEC proxies.',
    'proxy.retry': '↻ Retry',
    'proxy.orBun': 'Run from the repository root:',
    'error.retry': 'Retry',
    'no.data': 'Enter a ticker (AAPL, MSFT, NVDA…)',
    'console.toggle': 'Open debug panel',
    'metric': 'Metric',
    'section.income': '📊 Income Statement',
    'section.cash': '💰 Cash Flow',
    'section.balance': '🏦 Balance Sheet',
    'section.pershare': '📈 Per Share & Other',
    'tip.theme': 'Theme: light / dark',
    'tip.lang': 'Language',
    'tip.settings': 'Settings',
    'tip.view': 'Charts / table',
    'tip.mode': 'Annual / quarterly / interim reports',
    'tip.search': 'Search ticker',
    'tip.load': 'Load company data',
    'tip.proxy': 'Proxy status (www / data)',
    'tip.proxyToggle': 'Open debug panel',
    'settings.title': 'Settings',
    'settings.display': 'Display',
    'settings.data': 'Data & proxy',
    'settings.debug': 'Debug',
    'settings.theme': 'Theme',
    'settings.colorTheme': 'Color palette',
    'settings.colorTheme.hint': 'Shared with Options Desk for a consistent merge-ready UI.',
    'colorTheme.fundamentals': 'Emerald Ledger',
    'colorTheme.options-desk': 'Indigo Desk',
    'settings.lang': 'Language',
    'settings.view': 'View',
    'settings.mode': 'Period',
    'settings.source': 'Data source',
    'settings.preferUsd': 'Prefer USD currency',
    'settings.preferUsd.hint': 'Use SEC-provided USD for each metric when available; otherwise use the issuer currency. No FX conversion.',
    'source.cache': 'CACHE',
    'source.live': 'LIVE',
    'source.cache.hint': 'Same-origin ./data/{TICKER}.json (pre-fetched for GitHub Pages)',
    'source.live.hint': 'Live SEC EDGAR via local proxy',
    'tip.source': 'CACHE (static) / LIVE (proxy)',
    'settings.scale': 'Text scale',
    'settings.console': 'Debug panel',
    'settings.proxyWww': 'www.sec.gov proxy',
    'settings.proxyWwwUrl': 'www proxy base URL',
    'settings.proxyDataUrl': 'data proxy base URL',
    'settings.proxyReset': 'Reset proxy URLs to defaults',
    'settings.proxyData': 'data.sec.gov proxy',
    'settings.clearCache': 'Clear cached company',
    'proxy.actual': 'Start both SEC proxies with one command:',
    'debug.title': 'Debug',
    'debug.overview': 'Overview',
    'debug.reporting': 'Reporting',
    'debug.connection': 'Data connection',
    'debug.activity': 'Recent activity',
    'debug.status': 'Status',
    'debug.company': 'Company',
    'debug.source': 'Source',
    'debug.period': 'Period',
    'debug.primaryCurrency': 'Primary currency',
    'debug.preferUsd': 'Prefer USD',
    'debug.currencyScope': 'Available currencies are response-wide; currency preference is applied separately to each recognized metric.',
    'debug.taxonomies': 'Taxonomies',
    'debug.reports': 'Reports',
    'debug.currencies': 'Currencies',
    'debug.used': 'Used',
    'debug.available': 'Available',
    'debug.ready': 'Ready',
    'debug.loading': 'Loading',
    'debug.idle': 'Idle',
    'debug.none': 'No activity yet',
    'cache.restored': 'Restored from cache',
    'settings.close': 'Close',
    'view.charts': 'Charts',
    'view.table': 'Table',
    'mode.annual': 'Annual',
    'mode.quarterly': 'Quarterly',
    'mode.interim': 'Interim (6-K)',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'on': 'On',
    'off': 'Off',
    'm.revenue': 'Revenue',
    'm.costOfRevenue': 'Cost of Revenue',
    'm.grossProfit': 'Gross Profit',
    'm.rnd': 'R&D Expense',
    'm.sga': 'SG&A Expense',
    'm.operatingIncome': 'Operating Income',
    'm.netIncome': 'Net Income',
    'm.eps': 'EPS',
    'm.grossMargin': 'Gross Margin',
    'm.netMargin': 'Net Margin',
    'm.opMargin': 'Operating Margin',
    'm.ocf': 'Operating CF',
    'm.capex': 'CapEx',
    'm.depreciation': 'D&A',
    'm.dividendsPaid': 'Dividends Paid',
    'm.shareRepurchase': 'Share Buybacks',
    'm.fcf': 'Free Cash Flow',
    'm.assets': 'Total Assets',
    'm.currentAssets': 'Current Assets',
    'm.cash': 'Cash & Equiv.',
    'm.receivables': 'Receivables',
    'm.inventory': 'Inventory',
    'm.ppe': 'PP&E',
    'm.goodwill': 'Goodwill',
    'm.intangibles': 'Intangibles',
    'm.liabilities': 'Total Liabilities',
    'm.currentLiabilities': 'Current Liabilities',
    'm.payables': 'Accounts Payable',
    'm.shortTermDebt': 'Short-term Debt',
    'm.longTermDebt': 'Long-term Debt',
    'm.equity': 'Equity',
    'm.roe': 'ROE',
    'm.roa': 'ROA',
    'm.debtToEquity': 'Debt/Equity',
    'm.currentRatio': 'Current Ratio',
    'm.sharesOut': 'Shares Outstanding',
    'm.revenuePerShare': 'Revenue/Share',
    'm.fcfPerShare': 'FCF/Share',
  },
  ru: {
    'search.placeholder': 'Тикер или название компании…',
    'search.load': 'Загрузить',
    'proxy.title': 'Для LIVE-данных нужны локальные SEC-прокси.',
    'proxy.retry': '↻ Повтор',
    'proxy.orBun': 'Запустите из корня репозитория:',
    'error.retry': 'Повтор',
    'no.data': 'Введите тикер (AAPL, MSFT, NVDA…)',
    'console.toggle': 'Открыть панель отладки',
    'metric': 'Метрика',
    'section.income': '📊 Отчёт о прибылях и убытках',
    'section.cash': '💰 Денежный поток',
    'section.balance': '🏦 Баланс',
    'section.pershare': '📈 На акцию и прочее',
    'tip.theme': 'Тема: светлая / тёмная',
    'tip.lang': 'Язык',
    'tip.settings': 'Настройки',
    'tip.view': 'Графики / таблица',
    'tip.mode': 'Годовой / квартальный / промежуточный отчёт',
    'tip.search': 'Поиск тикера',
    'tip.load': 'Загрузить данные компании',
    'tip.proxy': 'Статус прокси (www / data)',
    'tip.proxyToggle': 'Открыть панель отладки',
    'settings.title': 'Настройки',
    'settings.display': 'Отображение',
    'settings.data': 'Данные и прокси',
    'settings.debug': 'Отладка',
    'settings.theme': 'Тема',
    'settings.colorTheme': 'Цветовая палитра',
    'settings.colorTheme.hint': 'Общая с Options Desk — единый UI при будущем слиянии.',
    'colorTheme.fundamentals': 'Изумрудный Ledger',
    'colorTheme.options-desk': 'Индиго Desk',
    'settings.lang': 'Язык',
    'settings.view': 'Вид',
    'settings.mode': 'Период',
    'settings.source': 'Источник данных',
    'settings.preferUsd': 'Предпочитать валюту USD',
    'settings.preferUsd.hint': 'Использовать предоставленные SEC значения в USD для каждой метрики, когда они доступны; иначе использовать валюту эмитента. Без FX-конвертации.',
    'source.cache': 'CACHE',
    'source.live': 'LIVE',
    'source.cache.hint': 'Same-origin ./data/{TICKER}.json (префетч для GitHub Pages)',
    'source.live.hint': 'Live SEC EDGAR через локальный прокси',
    'tip.source': 'CACHE (статика) / LIVE (прокси)',
    'settings.scale': 'Масштаб текста',
    'settings.console': 'Панель отладки',
    'settings.proxyWww': 'Прокси www.sec.gov',
    'settings.proxyWwwUrl': 'URL прокси www',
    'settings.proxyDataUrl': 'URL прокси data',
    'settings.proxyReset': 'Сбросить URL прокси',
    'settings.proxyData': 'Прокси data.sec.gov',
    'settings.clearCache': 'Очистить кэш компании',
    'proxy.actual': 'Запустите оба SEC-прокси одной командой:',
    'debug.title': 'Отладка',
    'debug.overview': 'Обзор',
    'debug.reporting': 'Отчётность',
    'debug.connection': 'Подключение к данным',
    'debug.activity': 'Последние события',
    'debug.status': 'Статус',
    'debug.company': 'Компания',
    'debug.source': 'Источник',
    'debug.period': 'Период',
    'debug.primaryCurrency': 'Основная валюта',
    'debug.preferUsd': 'Предпочитать USD',
    'debug.currencyScope': 'Доступные валюты указаны для всего ответа; предпочтение валюты применяется отдельно к каждой распознанной метрике.',
    'debug.taxonomies': 'Таксономии',
    'debug.reports': 'Отчёты',
    'debug.currencies': 'Валюты',
    'debug.used': 'Использовано',
    'debug.available': 'Доступно',
    'debug.ready': 'Готово',
    'debug.loading': 'Загрузка',
    'debug.idle': 'Ожидание',
    'debug.none': 'Событий пока нет',
    'cache.restored': 'Восстановлено из кэша',
    'settings.close': 'Закрыть',
    'view.charts': 'Графики',
    'view.table': 'Таблица',
    'mode.annual': 'Годовой',
    'mode.quarterly': 'Квартальный',
    'mode.interim': 'Промежуточный (6-K)',
    'theme.dark': 'Тёмная',
    'theme.light': 'Светлая',
    'on': 'Вкл',
    'off': 'Выкл',
    'm.revenue': 'Выручка',
    'm.costOfRevenue': 'Себестоимость',
    'm.grossProfit': 'Валовая прибыль',
    'm.rnd': 'R&D расходы',
    'm.sga': 'SG&A расходы',
    'm.operatingIncome': 'Операционная прибыль',
    'm.netIncome': 'Чистая прибыль',
    'm.eps': 'EPS',
    'm.grossMargin': 'Валовая маржа',
    'm.netMargin': 'Чистая маржа',
    'm.opMargin': 'Операционная маржа',
    'm.ocf': 'Операционный CF',
    'm.capex': 'CapEx',
    'm.depreciation': 'Амортизация',
    'm.dividendsPaid': 'Дивиденды',
    'm.shareRepurchase': 'Обратный выкуп',
    'm.fcf': 'Свободный CF',
    'm.assets': 'Активы',
    'm.currentAssets': 'Оборотные активы',
    'm.cash': 'Денежные средства',
    'm.receivables': 'Дебиторка',
    'm.inventory': 'Запасы',
    'm.ppe': 'Основные средства',
    'm.goodwill': 'Гудвилл',
    'm.intangibles': 'НМА',
    'm.liabilities': 'Обязательства',
    'm.currentLiabilities': 'Краткосрочные об-ва',
    'm.payables': 'Кредиторка',
    'm.shortTermDebt': 'Краткосрочный долг',
    'm.longTermDebt': 'Долгосрочный долг',
    'm.equity': 'Капитал',
    'm.roe': 'ROE',
    'm.roa': 'ROA',
    'm.debtToEquity': 'Долг/Капитал',
    'm.currentRatio': 'Текущая ликвидность',
    'm.sharesOut': 'Акции в обращении',
    'm.revenuePerShare': 'Выручка/акция',
    'm.fcfPerShare': 'FCF/акция',
  },
};

function t(key: string, lang: Language): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

/** UI metric/chart names (not from SEC API). */
function metricLabel(key: string, fallback: string, lang: Language): string {
  return t(`m.${key}`, lang) || fallback || key;
}

const CON: Record<string, string[]> = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    // IFRS (TSM, ASML, etc — 20-F)
    'Revenue',
    'Sales',
  ],
  costOfRevenue: [
    'CostOfGoodsAndServicesSold',
    'CostOfRevenue',
    'CostOfGoodsSold',
    'CostOfSales',
  ],
  grossProfit: ['GrossProfit'],
  operatingIncome: [
    'OperatingIncomeLoss',
    // IFRS
    'OperatingProfitLoss',
    'ProfitLossFromOperatingActivities',
    'OperatingIncome',
  ],
  netIncome: [
    'NetIncomeLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
    'ProfitLoss',
  ],
  eps: [
    'EarningsPerShareBasic',
    'EarningsPerShareDiluted',
    // IFRS
    'BasicEarningsLossPerShare',
    'DilutedEarningsLossPerShare',
  ],
  ocf: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    // IFRS
    'CashFlowsFromUsedInOperatingActivities',
    'NetCashFlowsFromUsedInOperatingActivities',
    'CashGeneratedFromOperatingActivities',
  ],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsForCapitalImprovements',
    // IFRS
    'PurchaseOfPropertyPlantAndEquipment',
    'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  ],
  depreciation: [
    'DepreciationDepletionAndAmortization',
    'Depreciation',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
    // IFRS
    'DepreciationAndAmortisationExpense',
    'DepreciationExpense',
    'AmortisationExpense',
  ],
  dividendsPaid: [
    'PaymentsOfDividends',
    'PaymentsOfDividendsCommonStock',
    // IFRS
    'DividendsPaid',
    'DividendsPaidClassifiedAsFinancingActivities',
  ],
  shareRepurchase: [
    'PaymentsForRepurchaseOfCommonStock',
    'PaymentsForRepurchaseOfEquity',
    // IFRS
    'PaymentsToAcquireOwnEquity',
  ],
  assets: ['Assets'],
  currentAssets: ['AssetsCurrent', 'CurrentAssets'],
  liabilities: ['Liabilities'],
  currentLiabilities: ['LiabilitiesCurrent', 'CurrentLiabilities'],
  equity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    // IFRS
    'Equity',
    'EquityAttributableToOwnersOfParent',
  ],
  cash: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsAndShortTermInvestments',
    'CashAndCashEquivalents',
  ],
  shortTermDebt: ['ShortTermBorrowings', 'DebtCurrent', 'ShorttermBorrowings'],
  longTermDebt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongtermBorrowings'],
  inventory: ['InventoryNet', 'Inventories'],
  receivables: [
    'AccountsReceivableNetCurrent',
    'AccountsReceivableNet',
    'TradeAndOtherCurrentReceivables',
    'CurrentTradeReceivables',
  ],
  payables: [
    'AccountsPayableCurrent',
    'TradeAndOtherCurrentPayables',
    'TradeAndOtherCurrentPayablesToTradeSuppliers',
  ],
  goodwill: ['Goodwill'],
  intangibles: ['IntangibleAssetsNetExcludingGoodwill', 'IntangibleAssetsOtherThanGoodwill'],
  ppe: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipment'],
  sharesOut: [
    'CommonStockSharesOutstanding',
    'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
    'WeightedAverageNumberOfDilutedSharesOutstanding',
    'WeightedAverageShares',
    'AdjustedWeightedAverageShares',
  ],
  rnd: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'],
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

function isGitHubPagesHost(): boolean {
  try {
    const h = window.location.hostname;
    const p = window.location.pathname;
    if (h.endsWith('github.io')) return true;
    if (p.includes('/fundamentals')) return true;
    // localhost / dev → live (proxy), everything else hosted → cache
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h.endsWith('.local')
    )
      return false;
    return true;
  } catch {
    return true;
  }
}

function defaultDataSource(): DataSource {
  // GitHub Pages → cache (static data/*.json), local dev → live (proxy)
  return isGitHubPagesHost() ? 'cache' : 'live';
}

const DEFAULT_WWW_PROXY = 'http://localhost:8011/proxy';
const DEFAULT_DATA_PROXY = 'http://localhost:8012/proxy';
const LS_WWW_PROXY = 'sec-proxy-www';
const LS_DATA_PROXY = 'sec-proxy-data';

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
    // Prefer full cache; if over ~4MB quota, keep company-only so UI can restore shell + offer refresh
    if (j.length < 4 * 1024 * 1024) {
      localStorage.setItem(LS_C, j);
      return;
    }
    localStorage.setItem(
      LS_C,
      JSON.stringify({ company: c?.company || null, facts: null, partial: true }),
    );
  } catch {
    try {
      localStorage.setItem(
        LS_C,
        JSON.stringify({ company: c?.company || null, facts: null, partial: true }),
      );
    } catch {}
  }
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

/** options-desk-style static file: data/{TICKER}.json → { symbol, cik, title, facts } */
async function loadStaticFacts(sym: string): Promise<{
  facts: any;
  company: { ticker: string; title: string; cik: string };
} | null> {
  const url = staticDataUrl(`${sym}.json`, document.baseURI);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    // SPA hosts sometimes return index.html for missing files
    if (ct.includes('text/html')) return null;
    const doc = await r.json();
    const facts = normalizeFacts(doc.facts || doc);
    if (!hasUsableFacts(facts)) return null;
    const ticker = String(doc.ticker || doc.symbol || sym).toUpperCase();
    const cik = String(doc.cik || '').padStart(10, '0');
    const title = doc.title || doc.entityName || ticker;
    return { facts, company: { ticker, title, cik } };
  } catch {
    return null;
  }
}

async function loadStaticManifest(): Promise<{
  /** Ticker symbols present in the static cache (list; legacy map keys also accepted). */
  files: string[];
  names: Record<string, string>;
  count: number;
} | null> {
  try {
    const r = await fetch(staticDataUrl('index.json', document.baseURI), {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const doc = await r.json();
    const rawFiles = doc?.files;
    const files = Array.isArray(rawFiles)
      ? rawFiles.map((x: unknown) => String(x)).filter(Boolean)
      : rawFiles && typeof rawFiles === 'object'
        ? Object.keys(rawFiles)
        : [];
    return {
      files,
      names: doc.names || {},
      count: typeof doc.count === 'number' ? doc.count : files.length,
    };
  } catch {
    return null;
  }
}

const exM = extractMetric;

type MetricSource = { secUnit: string | null; currency: string | null };

const fV = (v: any, u: string, source?: MetricSource) => {
  if (v == null) return '—';
  if (u === '$M')
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v / 1e6);
  if (u === '$') {
    const value = Number(v).toFixed(2);
    return source?.currency === 'USD' ? '$' + value : value;
  }
  if (u === '%') return v.toFixed(1) + '%';
  if (u === 'x') return v.toFixed(2) + 'x';
  if (u === '#M')
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v / 1e6);
  return String(v);
};

function displayUnit(unit: string, source?: MetricSource): string {
  if (unit === '$M' && source?.currency && source.currency !== 'USD') {
    return `${source.currency} M`;
  }
  if (unit === '$' && source?.currency && source.currency !== 'USD') {
    return source.currency === 'non-USD' ? 'non-USD/share' : `${source.currency}/share`;
  }
  return unit;
}

function metricTitle(label: string, unit: string, source?: MetricSource): string {
  if ((unit === '$M' || unit === '$') && source?.currency && source.currency !== 'USD') {
    return `${label} (${source.currency})`;
  }
  return label;
}
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

function proc(facts: any, mode: Mode, preferUsd: boolean) {
  const primaryCurrency = detectPrimaryCurrency(facts, mode);
  const ex: Record<string, any[]> = {};
  for (const [key, concepts] of Object.entries(CON)) {
    ex[key] = exM(facts, concepts, mode, { preferUsd, preferredCurrency: primaryCurrency });
  }
  const allE = Object.values(ex).flat() as any[];
  const source: Record<string, MetricSource> = {};
  for (const [key, rows] of Object.entries(ex)) {
    const first = rows[0];
    source[key] = {
      secUnit: first?._secUnit || null,
      currency: first?._currency || null,
    };
  }

  const pK = [...new Set(allE.map((row) => row._periodKey).filter(Boolean))];
  if (mode === 'I') {
    pK.sort((a, b) => String(a).localeCompare(String(b)));
  } else {
    pK.sort((a, b) => {
      const [ay, af = 'FY'] = String(a).split('-'),
        [by, bf = 'FY'] = String(b).split('-');
      if (ay !== by) return Number(ay) - Number(by);
      const order: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, FY: 4, Q4: 4 };
      return (order[af] || 0) - (order[bf] || 0);
    });
  }

  const periodLabels = new Map<string, string>();
  for (const row of allE) {
    if (row._periodKey && row._periodLabel && !periodLabels.has(row._periodKey)) {
      periodLabels.set(row._periodKey, row._periodLabel);
    }
  }
  const gv = (key: string, periodKey: any) =>
    ex[key]?.find((row: any) => row._periodKey === periodKey)?.val;
  const gl = (periodKey: any) => periodLabels.get(String(periodKey)) || String(periodKey);
  const currency = (key: string) => source[key]?.currency || null;
  const compatible = (...keys: string[]) => {
    const currencies = keys.map(currency).filter(Boolean);
    return new Set(currencies).size <= 1;
  };

  const ms: any = {};
  const metricKeys = new Set<string>();
  SEC.forEach((section) => section.metrics.forEach((metric) => metricKeys.add(metric.key)));
  for (const key of metricKeys) {
    ms[key] = pK.map((periodKey) => ({
      label: gl(periodKey),
      value: gv(key, periodKey),
      periodKey,
    }));
  }

  const computedSource: Record<string, MetricSource> = {};
  const computedCurrency = (key: string): string | null => {
    switch (key) {
      case 'fcf':
      case 'fcfPerShare':
        return compatible('ocf', 'capex') ? currency('ocf') || currency('capex') : null;
      case 'revenuePerShare':
        return currency('revenue');
      default:
        return null;
    }
  };

  const cs = (key: string) => {
    computedSource[key] = {
      secUnit: null,
      currency: computedCurrency(key),
    };
    return pK.map((periodKey) => {
      const rev = gv('revenue', periodKey),
        gp = gv('grossProfit', periodKey),
        ni = gv('netIncome', periodKey),
        oi = gv('operatingIncome', periodKey),
        ocf = gv('ocf', periodKey),
        cx = gv('capex', periodKey),
        eq = gv('equity', periodKey),
        ast = gv('assets', periodKey),
        ltd = gv('longTermDebt', periodKey),
        std = gv('shortTermDebt', periodKey),
        ca = gv('currentAssets', periodKey),
        cl = gv('currentLiabilities', periodKey),
        sh = gv('sharesOut', periodKey);
      let value: any;
      switch (key) {
        case 'grossMargin':
          value = compatible('grossProfit', 'revenue') && gp != null && rev ? (gp / rev) * 100 : null;
          break;
        case 'netMargin':
          value = compatible('netIncome', 'revenue') && ni != null && rev ? (ni / rev) * 100 : null;
          break;
        case 'opMargin':
          value = compatible('operatingIncome', 'revenue') && oi != null && rev ? (oi / rev) * 100 : null;
          break;
        case 'fcf':
          value = compatible('ocf', 'capex') && ocf != null && cx != null ? ocf - cx : null;
          break;
        case 'roe':
          value = compatible('netIncome', 'equity') && ni != null && eq ? (ni / eq) * 100 : null;
          break;
        case 'roa':
          value = compatible('netIncome', 'assets') && ni != null && ast ? (ni / ast) * 100 : null;
          break;
        case 'debtToEquity': {
          const currenciesMatch = compatible('longTermDebt', 'shortTermDebt', 'equity');
          const debt = (ltd || 0) + (std || 0);
          value = currenciesMatch && debt && eq ? debt / eq : null;
          break;
        }
        case 'currentRatio':
          value = compatible('currentAssets', 'currentLiabilities') && ca != null && cl ? ca / cl : null;
          break;
        case 'revenuePerShare':
          value = rev != null && sh ? rev / sh : null;
          break;
        case 'fcfPerShare': {
          const fcf = compatible('ocf', 'capex') && ocf != null && cx != null ? ocf - cx : null;
          value = fcf != null && sh ? fcf / sh : null;
          break;
        }
        default:
          value = null;
      }
      return { label: gl(periodKey), value, periodKey };
    });
  };

  const cS: any = {};
  SEC.forEach((section) =>
    (section.computed || []).forEach((computed) => {
      cS[computed.key] = cs(computed.key);
    }),
  );
  return {
    metricSeries: ms,
    computedSeries: cS,
    metricSource: source,
    computedSource,
    reporting: inspectReporting(facts, allE),
    primaryCurrency,
    preferUsd,
    periodKeys: pK,
    getLabel: gl,
  };
}

const MiniChart = ({
  data,
  color,
  unit,
  label,
  source,
  dark,
  scale,
}: {
  data: any[];
  color: { line: string; fill: string };
  unit: string;
  label: string;
  source?: MetricSource;
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
  if (valid.length === 0) return null;
  if (valid.length === 1) {
    const point = valid[0];
    return (
      <div
        ref={cRef}
        className={`rounded-lg p-4 border text-center ${dark ? 'bg-slate-900/50 border-slate-700/30' : 'bg-white/60 border-slate-200'}`}
      >
        <div
          className={`font-medium ${dark ? 'text-slate-400' : 'text-slate-600'}`}
          style={{ fontSize: Math.round(12 * scale) }}
        >
          {label}
        </div>
        <div className="mt-3 font-mono font-bold" style={{ color: color.line, fontSize: Math.round(20 * scale) }}>
          {fV(point.value, unit, source)}
          <span className={`ml-1 text-xs font-normal ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
            {displayUnit(unit, source)}
          </span>
        </div>
        <div className={`mt-1 text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
          {point.label}
        </div>
      </div>
    );
  }
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
      <div
        className={`mb-1 font-medium text-center ${dark ? 'text-slate-400' : 'text-slate-600'}`}
        style={{ fontSize: fsT }}
      >
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
  accent,
}: {
  value: string;
  options: PillOption[];
  onChange: (k: string) => void;
  dark: boolean;
  title?: string;
  accent: AccentPalette;
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
              ? accent.pillActive
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
  // Menus are session UI only: both start closed after a hard refresh.
  const [showDebug, setShowDebug] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [company, setCompany] = useState<any>(cached?.company || null);
  const [tickers, setTickers] = useState<any>(null);
  const [tkL, setTkL] = useState(false);
  const [wwwOk, setWwwOk] = useState(false);
  const [dataOk, setDataOk] = useState(!!cached?.company);
  // Configured proxy bases (editable in Settings; persisted)
  const [wwwProxyUrl, setWwwProxyUrl] = useState(
    () => localStorage.getItem(LS_WWW_PROXY) || DEFAULT_WWW_PROXY,
  );
  const [dataProxyUrl, setDataProxyUrl] = useState(
    () => localStorage.getItem(LS_DATA_PROXY) || DEFAULT_DATA_PROXY,
  );
  // Last successfully probed bases (may equal configured, or a fallback candidate)
  const [wwwBase, setWwwBase] = useState<string | null>(null);
  const [dataBase, setDataBase] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(prefs.mode || 'Y');
  const [dataSource, setDataSource] = useState<DataSource>(
    () => (prefs.dataSource as DataSource) || defaultDataSource(),
  );
  const [preferUsd, setPreferUsd] = useState<boolean>(() => prefs.preferUsd === true);
  const [view, setView] = useState<View>(prefs.view || 'C');
  const [dark, setDark] = useState(prefs.dark !== false);
  const [colorTheme, setColorTheme] = useState<ColorThemeId>(() =>
    normalizeColorTheme(prefs.colorTheme),
  );
  const [factsCache, setFactsCache] = useState<any>(cached?.facts || null);
  const [pd, setPd] = useState<any>(null);
  const [reporting, setReporting] = useState<ReportingInfo | null>(null);
  const [sug, setSug] = useState<any[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [selIdx, setSelIdx] = useState(-1);
  const [scaleSlider, setScaleSlider] = useState(prefs.scaleSlider ?? DEFAULT_SCALE_SLIDER);
  const iRef = useRef<HTMLInputElement>(null);
  const loadBtnRef = useRef<HTMLButtonElement>(null);
  const sRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const scale = sliderToScale(scaleSlider);

  const log = useCallback((msg: string) => {
    console.log(msg);
    setLogs((p) => [...p.slice(-29), msg]);
  }, []);

  useEffect(() => {
    if (cached?.facts && cached?.company) {
      const facts = normalizeFacts(cached.facts);
      const comp = cached.company;
      setCompany(comp);
      setFactsCache(facts);
      setTicker(comp.ticker || prefs.ticker || 'AAPL');
      const processed = proc(facts, mode, preferUsd);
      setPd(processed);
      setReporting(processed.reporting);
      setDataOk(true);
      log(`✅ Restored ${comp.ticker} (cache)`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sp({ ticker, mode, view, dark, colorTheme, scaleSlider, dataSource, preferUsd });
  }, [ticker, mode, view, dark, colorTheme, scaleSlider, dataSource, preferUsd]);

  // Keep last loaded companyfacts in localStorage across reloads/close
  useEffect(() => {
    if (company && factsCache) sc({ facts: factsCache, company });
  }, [company, factsCache]);

  useEffect(() => {
    const onLeave = () => {
      if (company && factsCache) sc({ facts: factsCache, company });
      sp({ ticker, mode, view, dark, colorTheme, scaleSlider, dataSource, preferUsd });
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [company, factsCache, ticker, mode, view, dark, scaleSlider, dataSource, preferUsd]);

  useEffect(() => {
    localStorage.setItem(LS_LANG, lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem(LS_WWW_PROXY, wwwProxyUrl);
  }, [wwwProxyUrl]);

  useEffect(() => {
    localStorage.setItem(LS_DATA_PROXY, dataProxyUrl);
  }, [dataProxyUrl]);

  useEffect(() => {
    const surface = SURFACE[colorTheme];
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.palette = colorTheme;
    document.documentElement.style.backgroundColor = dark ? surface.darkBg : surface.lightBg;
    document.documentElement.style.color = dark ? surface.darkFg : surface.lightFg;
    document.body.style.backgroundColor = dark ? surface.darkBg : surface.lightBg;
    document.body.style.color = dark ? surface.darkFg : surface.lightFg;
  }, [dark, colorTheme]);

  useEffect(() => {
    if (!factsCache) return;
    const processed = proc(normalizeFacts(factsCache), mode, preferUsd);
    setPd(processed);
    setReporting(processed.reporting);
  }, [mode, factsCache, preferUsd]);

  // After tickers load, enable load button focus if input already has a symbol
  useEffect(() => {
    if (!tickers) return;
    const has = !!(ticker || '').trim();
    if (has && document.activeElement === document.body) {
      loadBtnRef.current?.focus();
    }
  }, [tickers, ticker]);

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
        const r = await fetch(staticDataUrl('company_tickers.json', document.baseURI));
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

      const cands = [
        ...new Set(
          [wwwProxyUrl, ...WWW_CANDIDATES, ...UNIFIED].filter(Boolean) as string[],
        ),
      ];
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

  // On open: if ticker is non-empty, focus load button so Enter/Space runs search;
  // otherwise focus the input for typing.
  useEffect(() => {
    // wait until proxies/tickers init settles a tick
    const id = window.setTimeout(() => {
      const has = !!(ticker || '').trim();
      if (has) {
        loadBtnRef.current?.focus();
      } else {
        iRef.current?.focus();
      }
    }, 50);
    return () => window.clearTimeout(id);
    // only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (sym: string, opts?: { keepPrevious?: boolean }) => {
    sym = (sym || '').trim().toUpperCase();
    setError(null);
    if (!opts?.keepPrevious) {
      setCompany(null);
      setPd(null);
      setReporting(null);
      setFactsCache(null);
    }
    if (!sym) return;
    // Allow refresh even while tickers still loading if we already know CIK from company/cache
    setLoading(true);
    setLogs([]);
    try {
      let co: any = null;
      if (tickers) {
        co = (Object.values(tickers) as any[]).find((c) => c.ticker === sym);
      }
      if (!co && company?.ticker === sym && company?.cik) {
        co = { ticker: company.ticker, title: company.title, cik_str: Number(company.cik) };
      }
      if (!co && cached?.company?.ticker === sym && cached?.company?.cik) {
        co = {
          ticker: cached.company.ticker,
          title: cached.company.title,
          cik_str: Number(cached.company.cik),
        };
      }
      if (!co) {
        // CACHE may still have ./data/{TICKER}.json even if ticker map is stubby
        if (dataSource === 'cache') {
          const cachedFile = await loadStaticFacts(sym);
          if (cachedFile) {
            setDataOk(true);
            setWwwOk(true);
            setFactsCache(cachedFile.facts);
            setCompany(cachedFile.company);
            const processed = proc(cachedFile.facts, mode, preferUsd);
            setPd(processed);
            setReporting(processed.reporting);
            sc({ facts: cachedFile.facts, company: cachedFile.company });
            log(`${sym} → CIK ${cachedFile.company.cik}`);
            log(`✅ CACHE ./data/${sym}.json`);
            log('✅ Done');
            return;
          }
        }
        throw new Error(`"${sym}" not found`);
      }
      const cik = String(co.cik_str ?? co.cik).padStart(10, '0');
      log(`${sym} → CIK ${cik}`);

      // --- CACHE mode: same-origin ./data/{TICKER}.json (options-desk pattern) ---
      if (dataSource === 'cache') {
        const cachedFile = await loadStaticFacts(sym);
        if (cachedFile) {
          setDataOk(true);
          setWwwOk(true);
          setFactsCache(cachedFile.facts);
          setCompany(cachedFile.company);
          const processed = proc(cachedFile.facts, mode, preferUsd);
          setPd(processed);
          setReporting(processed.reporting);
          sc({ facts: cachedFile.facts, company: cachedFile.company });
          log(`✅ CACHE ./data/${sym}.json`);
          log('✅ Done');
          return;
        }
        // fall through to LIVE if static miss (and log)
        log(`CACHE miss ./data/${sym}.json — trying LIVE proxy`);
      }

      // --- LIVE mode: SEC via proxy ---
      const dataCands = [
        ...new Set(
          [dataProxyUrl, dataBase || '', ...DATA_CANDIDATES, ...UNIFIED].filter(
            Boolean,
          ) as string[],
        ),
      ];
      const { base, res } = await probe(
        dataCands,
        `/api/xbrl/companyfacts/CIK${cik}.json`,
      );
      setDataOk(true);
      setDataBase(base);
      log(`✅ data proxy: ${base}`);
      if (wwwBase) log(`✅ www proxy: ${wwwBase}`);
      const raw = await res.json();
      const facts = normalizeFacts(raw);
      if (!hasUsableFacts(facts)) throw new Error('No usable fact taxonomies in companyfacts');
      setFactsCache(facts);
      const comp = { title: co.title || raw?.entityName, cik, ticker: sym };
      setCompany(comp);
      const processed = proc(facts, mode, preferUsd);
      setPd(processed);
      setReporting(processed.reporting);
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
    // Select whole ticker so typing replaces it
    requestAnimationFrame(() => {
      try {
        iRef.current?.select();
      } catch {}
    });
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

  const a = ACCENT[colorTheme];
  const bg =
    colorTheme === 'fundamentals'
      ? dark
        ? 'bg-slate-950/95 text-slate-100'
        : 'bg-white/95 text-slate-900'
      : dark
        ? 'bg-slate-900/95 text-slate-100'
        : 'bg-white/95 text-slate-900';
  const bdr = dark ? 'border-slate-800' : 'border-slate-200';
  const card = dark
    ? 'bg-slate-800 border-slate-600 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-sm';
  const inp = dark
    ? `bg-slate-800 border-slate-700 ${a.textDark}`
    : `bg-slate-50 border-slate-300 ${a.textLight}`;
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
  const dotOn = dark ? a.dotOnDark : a.dotOnLight;
  const dotOff = dark ? 'bg-slate-600' : 'bg-slate-300';

  const tblFs = `${Math.round(14 * scale)}px`;
  const tblHFs = `${Math.round(11 * scale)}px`;
  const tblCellPy = `${Math.round(10 * scale)}px`;

  const showCurrencyPreference = Boolean(pd?.primaryCurrency && pd.primaryCurrency !== 'USD');
  const debugStatus = loading || tkL
    ? t('debug.loading', lang)
    : error
      ? `Error: ${error.split('\n')[0]}`
      : company && dataOk
        ? t('debug.ready', lang)
        : t('debug.idle', lang);

  return (
    <Fragment>
      <div className={`sticky top-0 z-50 ${bg} backdrop-blur-md border-b ${bdr}`}>
        <div className="px-4 xl:px-8">
          <div className="flex items-center gap-2 sm:gap-3 py-3">
            {/* 1. Debug popover — overlay, does not move the app */}
            <div className="relative flex-shrink-0" ref={debugRef}>
              <button
                type="button"
                onClick={() => setShowDebug((open) => !open)}
                title={t('tip.proxyToggle', lang)}
                aria-label={t('tip.proxyToggle', lang)}
                aria-expanded={showDebug}
                className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  showDebug
                    ? dark
                      ? a.chipActiveDark
                      : a.chipActiveLight
                    : dark
                      ? 'text-slate-600 hover:text-slate-400 hover:bg-slate-800'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
              >
                ⌘
              </button>

              {showDebug && (
                <div
                  role="dialog"
                  aria-label={t('debug.title', lang)}
                  className={`absolute left-0 top-full mt-2 w-[min(92vw,22rem)] z-[60] ${card} border rounded-xl shadow-xl p-3 space-y-3`}
                >
                  <div className={`font-bold text-sm ${t1}`}>⌘ {t('debug.title', lang)}</div>

                  <div className={`text-[10px] font-bold uppercase tracking-wide ${mt}`}>
                    {t('debug.overview', lang)}
                  </div>
                  <div className={`rounded-lg border ${bdr} divide-y ${bdr}`}>
                    <div className="flex items-start justify-between gap-3 px-3 py-2">
                      <span className={`text-xs ${mt}`}>{t('debug.status', lang)}</span>
                      <span className={`text-xs font-mono text-right break-words ${error ? 'text-red-500' : loading || tkL ? 'text-amber-500' : a.statusOk}`}>
                        {debugStatus}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3 px-3 py-2">
                      <span className={`text-xs ${mt}`}>{t('debug.company', lang)}</span>
                      <span className={`text-xs font-mono text-right ${t1}`}>
                        {company?.ticker || (ticker || '').trim().toUpperCase() || '—'}
                        {company?.cik ? ` · CIK ${company.cik}` : ''}
                      </span>
                    </div>
                    {company?.title && (
                      <div className={`px-3 py-2 text-xs break-words ${t2}`}>{company.title}</div>
                    )}
                    <div className="grid grid-cols-2 divide-x divide-inherit">
                      <div className="px-3 py-2">
                        <div className={`text-[10px] ${mt}`}>{t('debug.source', lang)}</div>
                        <div className={`text-xs font-mono font-semibold ${t1}`}>
                          {dataSource === 'cache' ? 'CACHE' : 'LIVE'}
                        </div>
                      </div>
                      <div className="px-3 py-2">
                        <div className={`text-[10px] ${mt}`}>{t('debug.period', lang)}</div>
                        <div className={`text-xs font-mono font-semibold ${t1}`}>{mode}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-inherit">
                      <div className="px-3 py-2">
                        <div className={`text-[10px] ${mt}`}>{t('debug.primaryCurrency', lang)}</div>
                        <div className={`text-xs font-mono font-semibold ${t1}`}>
                          {pd?.primaryCurrency || '—'}
                        </div>
                      </div>
                      <div className="px-3 py-2">
                        <div className={`text-[10px] ${mt}`}>{t('debug.preferUsd', lang)}</div>
                        <div className={`text-xs font-mono font-semibold ${t1}`}>
                          {preferUsd ? t('on', lang) : t('off', lang)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`text-[10px] font-bold uppercase tracking-wide pt-1 ${mt}`}>
                    {t('debug.reporting', lang)}
                  </div>
                  <div className={`rounded-lg border ${bdr} divide-y ${bdr}`}>
                    {[
                      {
                        label: `${t('debug.used', lang)} ${t('debug.taxonomies', lang)}`,
                        value: reporting?.usedTaxonomies.join(', '),
                      },
                      {
                        label: `${t('debug.used', lang)} ${t('debug.reports', lang)}`,
                        value: reporting?.usedForms.join(', '),
                      },
                      {
                        label: `${t('debug.used', lang)} ${t('debug.currencies', lang)}`,
                        value: reporting?.usedCurrencies.join(', '),
                      },
                      {
                        label: `${t('debug.available', lang)} ${t('debug.taxonomies', lang)}`,
                        value: reporting?.availableTaxonomies.join(', '),
                      },
                      {
                        label: `${t('debug.available', lang)} ${t('debug.reports', lang)}`,
                        value: reporting?.availableForms.join(', '),
                      },
                      {
                        label: `${t('debug.available', lang)} ${t('debug.currencies', lang)}`,
                        value: reporting?.availableCurrencies.join(', '),
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className={`text-xs ${mt}`}>{row.label}</span>
                        <span className={`text-xs font-mono text-right break-words ${t1}`}>
                          {row.value || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={`text-[10px] ${mt}`}>{t('debug.currencyScope', lang)}</div>
                  {reporting?.usedTaxonomies.includes('ifrs-full') &&
                    !reporting.availableTaxonomies.includes('us-gaap') &&
                    reporting.usedForms.includes('20-F') && (
                      <div className={`rounded-lg px-3 py-2 text-xs ${dark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'}`}>
                        IFRS (ifrs-full) · 20-F · not US-GAAP/10-K
                      </div>
                    )}

                  <div className={`text-[10px] font-bold uppercase tracking-wide pt-1 ${mt}`}>
                    {t('debug.connection', lang)}
                  </div>
                  <div className={`rounded-lg border ${bdr} divide-y ${bdr}`}>
                    {dataSource === 'live' ? (
                      <>
                        <div className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs ${mt}`}>www.sec.gov</span>
                            <span className={`text-xs font-mono ${wwwOk ? a.statusOk : 'text-red-500'}`}>
                              {wwwOk ? '● online' : '● offline'}
                            </span>
                          </div>
                          <div className={`mt-1 text-[10px] font-mono break-all ${t2}`}>
                            {wwwBase || wwwProxyUrl || DEFAULT_WWW_PROXY}
                          </div>
                        </div>
                        <div className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs ${mt}`}>data.sec.gov</span>
                            <span className={`text-xs font-mono ${dataOk ? a.statusOk : 'text-red-500'}`}>
                              {dataOk ? '● online' : '● offline'}
                            </span>
                          </div>
                          <div className={`mt-1 text-[10px] font-mono break-all ${t2}`}>
                            {dataBase || dataProxyUrl || DEFAULT_DATA_PROXY}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs ${mt}`}>Static cache</span>
                          <span className={`text-xs font-mono ${dataOk ? a.statusOk : mt}`}>
                            {dataOk ? '● loaded' : '● waiting'}
                          </span>
                        </div>
                        <div className={`mt-1 text-[10px] font-mono break-all ${t2}`}>
                          ./data/{company?.ticker || '{TICKER}'}.json
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={`text-[10px] font-bold uppercase tracking-wide pt-1 ${mt}`}>
                    {t('debug.activity', lang)}
                  </div>
                  <div className={`rounded-lg border ${bdr} p-2 max-h-40 overflow-y-auto ${scCls}`}>
                    {logs.length ? (
                      <div className="space-y-1">
                        {logs.slice(-10).map((entry, index) => (
                          <div key={`${index}-${entry}`} className={`text-[10px] font-mono whitespace-pre-wrap break-words ${entry.startsWith('❌') ? 'text-red-500' : entry.startsWith('✅') ? a.statusOk : t2}`}>
                            {entry}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-xs ${mt}`}>{t('debug.none', lang)}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Proxy online indicators */}
            <div
              className="flex gap-1.5 flex-shrink-0"
              title={t('tip.proxy', lang)}
              aria-label={t('tip.proxy', lang)}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${wwwOk ? dotOn : 'bg-red-500'}`} />
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  dataOk ? dotOn : tkL || loading ? 'bg-yellow-400 animate-pulse' : dotOff
                }`}
              />
            </div>

            {/* 3. Search input */}
            <div className="flex-1 min-w-0 relative" title={t('tip.search', lang)}>
              <input
                ref={iRef}
                type="text"
                value={ticker}
                onChange={hIC}
                onFocus={hIF}
                onClick={(e) => {
                  // Select all on click so a new symbol can be typed immediately
                  (e.target as HTMLInputElement).select();
                }}
                onKeyDown={hKD}
                placeholder={t('search.placeholder', lang)}
                title={t('tip.search', lang)}
                aria-label={t('tip.search', lang)}
                className={`w-full ${inp} border rounded-lg px-3 py-2 font-mono font-bold text-sm focus:outline-none ${a.focusBorder} transition-colors uppercase`}
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
                          dark ? a.textDark : a.textLight
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

            {/* 4. Search / load */}
            <button
              ref={loadBtnRef}
              type="button"
              onClick={() => {
                setShowSug(false);
                iRef.current?.blur();
                search(ticker);
              }}
              disabled={loading || !tickers}
              title={t('tip.load', lang)}
              aria-label={t('tip.load', lang)}
              className={`flex-shrink-0 flex items-center ${a.btn} text-white font-bold px-3 sm:px-4 py-2 rounded-lg text-sm transition-all active:scale-95 disabled:opacity-40`}
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
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              )}
            </button>

            {/* 5. Y / Q / I (annual / quarterly / foreign interim 6-K) */}
            <div title={t('tip.mode', lang)} className="flex-shrink-0">
              <Pill
                value={mode}
                options={[
                  { k: 'Y', l: 'Y' },
                  { k: 'Q', l: 'Q' },
                  { k: 'I', l: 'I' },
                ]}
                onChange={(k) => setMode(k as Mode)}
                dark={dark}
                accent={a}
                title={t('tip.mode', lang)}
              />
            </div>

            {/* 6. Tables / charts */}
            <div title={t('tip.view', lang)} className="flex-shrink-0">
              <Pill
                value={view}
                options={[
                  { k: 'C', l: '◔' },
                  { k: 'T', l: '⊞' },
                ]}
                onChange={(k) => setView(k as View)}
                dark={dark}
                accent={a}
                title={t('tip.view', lang)}
              />
            </div>

            {/* 6b. Data source CACHE/LIVE emoji log — sitting between tables/charts and themes */}
            <div title={t('tip.source', lang)} className="flex-shrink-0">
              <Pill
                value={dataSource}
                options={[
                  { k: 'cache', l: '💾' },
                  { k: 'live', l: '🌐' },
                ]}
                onChange={(k) => setDataSource(k as DataSource)}
                dark={dark}
                accent={a}
                title={`${t('tip.source', lang)}: ${t(`source.${dataSource}.hint`, lang)}`}
              />
            </div>

            {/* 7. Theme */}
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              title={t('tip.theme', lang)}
              aria-label={t('tip.theme', lang)}
              className={`flex-shrink-0 text-base leading-none px-2 py-1.5 rounded-lg transition-colors ${
                dark ? `${a.sun} hover:bg-slate-800` : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* 8. i18n */}
            <div title={t('tip.lang', lang)} className="flex-shrink-0">
              <Pill
                value={lang}
                options={[
                  { k: 'en', l: '🇺🇸' },
                  { k: 'ru', l: '🇷🇺' },
                ]}
                onChange={(k) => setLang(k as Language)}
                dark={dark}
                accent={a}
                title={t('tip.lang', lang)}
              />
            </div>

            {/* 9. Settings */}
            <div className="relative flex-shrink-0" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setShowSettings((open) => !open)}
                title={t('tip.settings', lang)}
                aria-label={t('tip.settings', lang)}
                aria-expanded={showSettings}
                className={`flex-shrink-0 text-base leading-none px-2 py-1.5 rounded-lg transition-colors ${
                  showSettings
                    ? dark
                      ? a.chipActiveDark
                      : a.chipActiveLight
                    : dark
                      ? 'text-slate-300 hover:bg-slate-800'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                ⚙️
              </button>
              {showSettings && (
                <div
                  className={`absolute right-0 top-full mt-2 w-[min(92vw,22rem)] z-[60] ${card} border rounded-xl shadow-xl p-3 space-y-3`}
                >
                  <div className={`font-bold text-sm ${t1}`}>⚙️ {t('settings.title', lang)}</div>

                  <div className={`text-[10px] font-bold uppercase tracking-wide ${mt}`}>
                    {t('settings.display', lang)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${t2}`}>{t('settings.theme', lang)}</span>
                    <Pill
                      value={dark ? 'dark' : 'light'}
                      options={[
                        { k: 'light', l: '☀️' },
                        { k: 'dark', l: '🌙' },
                      ]}
                      onChange={(k) => setDark(k === 'dark')}
                      dark={dark}
                      accent={a}
                      title={t('tip.theme', lang)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${t2}`} title={t('settings.colorTheme.hint', lang)}>
                      {t('settings.colorTheme', lang)}
                    </span>
                    <Pill
                      value={colorTheme}
                      options={[
                        { k: 'fundamentals', l: '📗' },
                        { k: 'options-desk', l: '📘' },
                      ]}
                      onChange={(k) => setColorTheme(normalizeColorTheme(k))}
                      dark={dark}
                      accent={a}
                      title={t('settings.colorTheme.hint', lang)}
                    />
                  </div>
                  <div className={`text-[10px] ${mt}`}>
                    {t(`colorTheme.${colorTheme}`, lang)} — {t('settings.colorTheme.hint', lang)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${t2}`}>{t('settings.lang', lang)}</span>
                    <Pill
                      value={lang}
                      options={[
                        { k: 'en', l: '🇺🇸' },
                        { k: 'ru', l: '🇷🇺' },
                      ]}
                      onChange={(k) => setLang(k as Language)}
                      dark={dark}
                      accent={a}
                      title={t('tip.lang', lang)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${t2}`}>{t('settings.view', lang)}</span>
                    <Pill
                      value={view}
                      options={[
                        { k: 'C', l: '◔' },
                        { k: 'T', l: '⊞' },
                      ]}
                      onChange={(k) => setView(k as View)}
                      dark={dark}
                      accent={a}
                      title={t('tip.view', lang)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${t2}`}>{t('settings.mode', lang)}</span>
                    <Pill
                      value={mode}
                      options={[
                        { k: 'Y', l: 'Y' },
                        { k: 'Q', l: 'Q' },
                        { k: 'I', l: 'I' },
                      ]}
                      onChange={(k) => setMode(k as Mode)}
                      dark={dark}
                      accent={a}
                      title={t('tip.mode', lang)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${t2}`} title={t(`source.${dataSource}.hint`, lang)}>
                      {t('settings.source', lang)}
                    </span>
                    <Pill
                      value={dataSource}
                      options={[
                        { k: 'cache', l: 'CACHE' },
                        { k: 'live', l: 'LIVE' },
                      ]}
                      onChange={(k) => setDataSource(k as DataSource)}
                      dark={dark}
                      accent={a}
                      title={t('tip.source', lang)}
                    />
                  </div>
                  <div className={`text-[10px] ${mt}`}>{t(`source.${dataSource}.hint`, lang)}</div>
                  {showCurrencyPreference && (
                    <>
                      <label
                        className="flex items-center justify-between gap-3 cursor-pointer"
                        title={t('settings.preferUsd.hint', lang)}
                      >
                        <span className={`text-xs ${t2}`}>{t('settings.preferUsd', lang)}</span>
                        <input
                          type="checkbox"
                          checked={preferUsd}
                          onChange={(event) => setPreferUsd(event.target.checked)}
                          className={`h-4 w-4 ${a.accentInput} cursor-pointer`}
                        />
                      </label>
                      <div className={`text-[10px] ${mt}`}>
                        {t('settings.preferUsd.hint', lang)}
                      </div>
                    </>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs ${t2}`}>{t('settings.scale', lang)}</span>
                      <span className={`text-xs font-mono ${mt}`}>{Math.round(scale * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] ${mt}`}>A</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={scaleSlider}
                        onChange={(e) => setScaleSlider(Number(e.target.value))}
                        className="scale-slider w-full"
                        title={`${t('settings.scale', lang)}: ${Math.round(scale * 100)}%`}
                      />
                      <span className={`text-xs font-bold ${mt}`}>A</span>
                    </div>
                  </div>

                  <div className={`text-[10px] font-bold uppercase tracking-wide pt-1 ${mt}`}>
                    {t('settings.data', lang)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className={`text-xs ${t2}`} htmlFor="proxy-www-url">
                        www
                      </label>
                      <span className={`text-xs font-mono ${wwwOk ? a.statusOk : 'text-red-500'}`}>
                        {wwwOk ? '● online' : '● offline'}
                      </span>
                    </div>
                    <input
                      id="proxy-www-url"
                      type="text"
                      value={wwwProxyUrl}
                      onChange={(e) => setWwwProxyUrl(e.target.value.trim())}
                      spellCheck={false}
                      title={t('settings.proxyWwwUrl', lang)}
                      placeholder={DEFAULT_WWW_PROXY}
                      className={`w-full ${inp} border rounded-lg px-2 py-1.5 font-mono text-[11px] focus:outline-none ${a.focusBorder}`}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <label className={`text-xs ${t2}`} htmlFor="proxy-data-url">
                        data
                      </label>
                      <span className={`text-xs font-mono ${dataOk ? a.statusOk : 'text-red-500'}`}>
                        {dataOk ? '● online' : '● offline'}
                      </span>
                    </div>
                    <input
                      id="proxy-data-url"
                      type="text"
                      value={dataProxyUrl}
                      onChange={(e) => setDataProxyUrl(e.target.value.trim())}
                      spellCheck={false}
                      title={t('settings.proxyDataUrl', lang)}
                      placeholder={DEFAULT_DATA_PROXY}
                      className={`w-full ${inp} border rounded-lg px-2 py-1.5 font-mono text-[11px] focus:outline-none ${a.focusBorder}`}
                    />
                    <div className={`text-[10px] space-y-0.5 font-mono ${mt}`}>
                      <div>
                        probed www: {wwwBase || '—'}
                      </div>
                      <div>
                        probed data: {dataBase || '—'}
                      </div>
                      {company && (
                        <div className="pt-1 break-all">
                          {company.ticker} · {company.title} · CIK {company.cik}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setWwwProxyUrl(DEFAULT_WWW_PROXY);
                        setDataProxyUrl(DEFAULT_DATA_PROXY);
                      }}
                      className={`w-full text-[11px] font-semibold py-1.5 rounded-lg border ${bdr} ${hR} ${t1}`}
                      title={t('settings.proxyReset', lang)}
                    >
                      ↺ {t('settings.proxyReset', lang)}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWwwOk(false);
                        setDataOk(false);
                        init();
                      }}
                      className={`w-full text-[11px] font-semibold py-1.5 rounded-lg border ${bdr} ${hR} ${t1}`}
                      title={t('proxy.retry', lang)}
                    >
                      {t('proxy.retry', lang)}
                    </button>
                  </div>
                  <div className="space-y-1">
                    <div className={`text-[10px] ${mt}`}>{t('proxy.actual', lang)}</div>
                    <pre
                      className={`${dark ? a.monoBlockDark : a.monoBlockLight} p-2 rounded text-[11px] font-mono overflow-x-auto`}
                    >{PROXY_COMMAND}</pre>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cc();
                      setCompany(null);
                      setPd(null);
                      setReporting(null);
                      setFactsCache(null);
                      setDataOk(false);
                      log('cache cleared');
                    }}
                    className={`w-full text-xs font-semibold py-2 rounded-lg border ${bdr} ${hR} ${t1}`}
                    title={t('settings.clearCache', lang)}
                  >
                    🗑️ {t('settings.clearCache', lang)}
                  </button>

                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <div className="px-4 xl:px-8 py-6">
        {!tickers && !tkL && (
          <div className={`${card} border rounded-xl p-5 mb-6 text-sm max-w-3xl mx-auto`}>
            <p className={`font-bold mb-1 ${t1}`}>{t('proxy.title', lang)}</p>
            <p className={`text-xs mb-3 ${mt}`}>{t('proxy.orBun', lang)}</p>
            <pre
              className={`${dark ? a.monoBlockDark : a.monoBlockLight} p-3 rounded text-xs font-mono overflow-x-auto`}
            >{PROXY_COMMAND}</pre>
            <button onClick={init} className={`mt-3 ${a.statusOk} text-xs hover:underline`}>
              {t('proxy.retry', lang)}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl mb-6 text-sm flex flex-col gap-2 animate-fade-in max-w-3xl mx-auto">
            <div className="flex items-start gap-2 whitespace-pre-wrap">
              <span className="flex-shrink-0 mt-0.5">✕</span>
              <span className="flex-1 font-mono text-xs">{error}</span>
            </div>
            {error.includes('Proxy not reachable') && (
              <pre
                className={`${dark ? a.monoBlockDark : 'bg-red-50 text-red-700'} ml-5 p-2 rounded text-[11px] font-mono overflow-x-auto`}
              >{PROXY_COMMAND}</pre>
            )}
            <div className="pl-5">
              <button onClick={init} className="text-xs hover:underline font-semibold">
                {t('error.retry', lang)}
              </button>
            </div>
          </div>
        )}

        {company && !loading && pd && (
          <div className="space-y-6 animate-fade-in">
            {SEC.map((section) => {
              const { metricSeries, computedSeries, metricSource, computedSource } = pd;
              const allM = [
                ...section.metrics.map((m) => ({
                  ...m,
                  series: metricSeries[m.key],
                  source: metricSource[m.key],
                })),
                ...(section.computed || []).map((c) => ({
                  ...c,
                  series: computedSeries[c.key],
                  source: computedSource[c.key],
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
                  <h3
                    className={`font-semibold ${clr.text} min-w-0 truncate`}
                    style={{ fontSize: `${Math.round(16 * scale)}px` }}
                  >
                    {t(section.titleKey, lang) || section.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-shrink-0" title={t('settings.scale', lang)}>
                    <span className={`text-[10px] ${mt}`}>A</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={scaleSlider}
                      onChange={(e) => setScaleSlider(Number(e.target.value))}
                      className="scale-slider w-20"
                      title={`${t('settings.scale', lang)}: ${Math.round(scale * 100)}%`}
                      aria-label={t('settings.scale', lang)}
                    />
                    <span className={`text-xs font-bold ${mt}`}>A</span>
                  </div>
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
                          label={metricTitle(metricLabel(m.key, m.label, lang), m.unit, m.source)}
                          source={m.source}
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
                              {metricLabel(m.key, m.label, lang)}{' '}
                              <span className={`text-xs ${mt}`}>({displayUnit(m.unit, m.source)})</span>
                            </td>
                            {m.series.map((d: any, j: number) => (
                              <td
                                key={j}
                                className={`px-3 text-right font-mono ${
                                  d.value != null && d.value < 0 ? nc : t1
                                }`}
                                style={{ paddingTop: tblCellPy, paddingBottom: tblCellPy }}
                              >
                                {fV(d.value, m.unit, m.source)}
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
