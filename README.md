# fundamentals

SEC EDGAR Financial Fundamentals Dashboard — React + TypeScript + Tailwind CSS v4 (Parcel build) + GitHub Pages.

> **RU:** Дашборд фундаментальных данных публичных компаний США на базе бесплатного API SEC EDGAR. Статическое приложение: React + TypeScript + Tailwind v4, сборка Parcel, деплой на GitHub Pages.

## 📚 Документация

| Документ | Описание |
|----------|----------|
| [findings.en.md](docs/findings.en.md) | Архитектурный обзор (EN) |
| [findings.ru.md](docs/findings.ru.md) | Архитектурный обзор (RU) |
| [REQUIREMENTS.en.md](docs/REQUIREMENTS.en.md) | Требования для AI-агентов (EN) |
| [REQUIREMENTS.ru.md](docs/REQUIREMENTS.ru.md) | Требования для AI-агентов (RU) |
| [docs/README.md](docs/README.md) | Навигация по документации |

---

## Быстрый старт / Quick start

Runtime-compatible dual SEC proxy + app:

```bash
git clone https://github.com/daggerok/fundamentals.git
cd fundamentals

# оба SEC-прокси / both SEC proxies
bun install -E && bun serve:proxy
```

Для локального UI запустите `bun serve:app` в другом терминале.
Откройте: **http://localhost:1234** (Parcel)  
Прокси (как в runtime):

| Порт | Host | Пример URL |
|------|------|------------|
| **8011** | `www.sec.gov` | `http://localhost:8011/proxy/files/company_tickers.json` |
| **8012** | `data.sec.gov` | `http://localhost:8012/proxy/api/xbrl/companyfacts/CIK0000320193.json` |

`bun serve:proxy` поднимает **оба** Bun SEC-прокси с корректным `User-Agent`; `bun serve:app` отдельно запускает Parcel.

---

## Прокси (обязательно для live SEC data)

### Вариант A — dual Bun SEC proxy (runtime-compatible) ✅ default

```bash
bun install -E && bun serve:proxy
```

Команда запускает оба прокси с обязательным SEC `User-Agent`: `www.sec.gov` на `8011` и `data.sec.gov` на `8012`. Для локального UI отдельно выполните `bun serve:app`.

Приложение само **пробивает** кандидатов `http://localhost:{8011,8010,8080,3000,8012}/proxy` (логика как в runtime).

### Вариант B — один современный Bun-прокси (User-Agent + оба хоста)

```bash
# Терминал 1
bun ./scripts/fundamentals-local-proxy.ts          # MODE=both, port 8012

# Терминал 2
bun run serve:app
```

`scripts/fundamentals-local-proxy.ts` принимает и runtime-пути (`/proxy/...`), и прямые (`/api/...`, `/files/...`), и выставляет обязательный `User-Agent` для SEC.

Можно эмулировать два порта runtime:

```bash
MODE=www  PORT=8011 bun ./scripts/fundamentals-local-proxy.ts &
MODE=data PORT=8012 bun ./scripts/fundamentals-local-proxy.ts &
```

### Вариант C — Cloudflare Worker (hosted GitHub Pages)

См. `scripts/cloudflare-worker.js` — SEC-релей с CORS + User-Agent.  
В UI (Settings ⚙) укажите base URL воркера; app также умеет unified base.

---

## Сборка

```bash
bun run build
bun run build-github-pages   # public-url=/fundamentals/
```

На GitHub Pages тикеры берутся из статического `data/company_tickers.json` (workflow `update-data.yml`). Company facts по-прежнему требуют прокси / Worker.

---

## Команды

```bash
bun install -E
bun serve:proxy            # оба Bun SEC-прокси (8011 + 8012)
bun serve:app              # только Parcel
bun ./scripts/fundamentals-local-proxy.ts # unified Bun proxy
bun run all                # fundamentals-local-proxy.ts + Parcel
bun start / bun ps / bun logs / bun restart / bun stop / bun kill
bun run build
bun run build-github-pages
```

---

## Структура (options-desk baseline)

```
fundamentals/
├── src/
│   ├── index.html
│   ├── index.css
│   └── main.tsx              # SPA (proxy probe + UI)
├── scripts/
│   ├── fundamentals-local-proxy.ts          # Bun SEC proxy (runtime-compatible)
│   ├── cloudflare-worker.js  # hosted SEC proxy
│   └── fundamentals-data.py         # pre-fetch company_tickers
├── data/
│   ├── company_tickers.json  # static cache for GitHub Pages
│   └── index.json
├── docs/
├── .github/workflows/
│   ├── ci.yaml
│   ├── github-pages.yml
│   └── update-data.yml
└── package.json
```

---

## Полезные ссылки

- GitHub Pages: https://daggerok.github.io/fundamentals/
- [fundamentals-runtime](https://github.com/daggerok/fundamentals-runtime) — предыдущая Babel/HTML версия (источник dual-proxy UX)
- [options-desk](https://github.com/daggerok/options-desk) — архитектурный baseline
- [SEC EDGAR API](https://www.sec.gov/edgar/sec-api-documentation)

---

## Dependency updates (как в csv)

- **CI** job `npm-check-updates` — на каждый push/PR проверяет, что `bunx npm-check-updates -u` + install + build проходят (без коммита).
- **Ручной апгрейд и push**: Actions → **Dependency Updates** → Run workflow (ветка, commit message). Обновляет `package.json` / `bun.lock`, билдит, коммитит и пушит, затем триггерит GitHub Pages.

---

## UI

UI mirrors [fundamentals-runtime](https://github.com/daggerok/fundamentals-runtime) (search bar header, dual proxy dots, console, colored section cards, ⊞/◔, scale slider, full metric set). **Difference:** EN/RU i18n via 🇺🇸/🇷🇺 pill.


---

## Data pre-fetch (Python / uv)

Same pattern as [options-desk](https://github.com/daggerok/options-desk):

```bash
# requires uv (https://docs.astral.sh/uv/)
uv run python scripts/fundamentals-data.py

SEC blocks generic User-Agents (HTTP 403). The script defaults to a descriptive
contact UA. Override if needed:

```bash
SEC_USER_AGENT="Your Name you@example.com" uv run python scripts/fundamentals-data.py
```

# or:
bun run data:fetch
```

Writes `data/company_tickers.json` + `data/index.json`.  
GitHub Action **Update SEC data** runs this on a schedule via `astral-sh/setup-uv`.

---

## Static CACHE (options-desk pattern)

Pre-fetch SEC companyfacts into `data/{TICKER}.json`, then `postbuild` copies `data/` → `dist/data/` for GitHub Pages.

```bash
# coverage-first: download MISSING tickers from company_tickers.json (then refresh stale)
MAX_FETCHES=50 uv run python scripts/fundamentals-data.py

# or only specific symbols
TICKERS="AAPL MSFT NVDA" uv run python scripts/fundamentals-data.py

# force re-fetch even if "fresh"
SKIP_FRESH_HOURS=0 MAX_FETCHES=10 TICKERS="AAPL" uv run python scripts/fundamentals-data.py

bun run build   # ncp → dist/data/
```

`MAX_FETCHES` only caps **successful writes this run**. Re-run to continue covering the ~9k SEC ticker map (missing first). Fresh files (`SKIP_FRESH_HOURS`, default 24h) are skipped automatically.


In the app **Settings → Data source**:
- **CACHE** (default on GitHub Pages): load app-relative `./data/{TICKER}.json`. The browser resolves this to `/fundamentals/data/TSM.json` on this project's Pages deployment and `/data/TSM.json` on localhost.
- **LIVE** (default on localhost): resolve ticker → CIK with `company_tickers.json`, then fetch SEC companyfacts via the data proxy.

SEC companyfacts payloads are keyed by CIK and do **not** guarantee a `symbol` field. The app keeps the searched ticker from `company_tickers.json`; the pre-fetch script adds `symbol` and `ticker` only to the local cache wrapper.

The report selector supports:
- **Y** — annual `10-K`, `20-F`, and `40-F` reports.
- **Q** — quarterly `10-Q` reports, plus annual FY reference points.
- **I** — foreign interim `6-K` reports, labeled from their actual period (`H1`, `9M`, or date range) rather than pretending they are discrete quarters.

Metric extraction searches every returned taxonomy, including `us-gaap`, `ifrs-full`, and custom taxonomies. **Prefer USD currency** in Settings is off by default: the app uses the detected issuer currency, while enabling it selects SEC-provided USD units for each recognized metric when that same metric has USD data. No FX conversion is performed. Non-USD chart names show the selected currency, such as `Revenue (TWD)` or `Revenue (non-USD)`; USD titles remain unchanged. Only unavailable metrics are omitted.

Debug distinguishes response-wide **Available currencies** from metric-level **Used currencies**. For example, ASML's response contains a few USD facts for derivatives, commitments, and option exercise prices, but its recognized revenue and statement metrics are EUR-only, so enabling USD preference does not change those EUR charts.

GitHub Action **Update SEC data** grows the cache on a schedule (`MAX_FETCHES` per run).
