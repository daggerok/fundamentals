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

Точно как в [fundamentals-runtime](https://github.com/daggerok/fundamentals-runtime) — dual `local-cors-proxy` + app:

```bash
git clone https://github.com/daggerok/fundamentals.git
cd fundamentals
bun install -E

bun stop ; bun kill ; bun ps ; bun start ; bun logs
```

Откройте: **http://localhost:1234** (Parcel)  
Прокси (как в runtime):

| Порт | Host | Пример URL |
|------|------|------------|
| **8011** | `www.sec.gov` | `http://localhost:8011/proxy/files/company_tickers.json` |
| **8012** | `data.sec.gov` | `http://localhost:8012/proxy/api/xbrl/companyfacts/CIK0000320193.json` |

`bun start` поднимает **оба** `local-cors-proxy` + Parcel (`npm run serve` = `serve:proxy-www` + `serve:proxy-data` + `serve:app`).

---

## Прокси (обязательно для live SEC data)

### Вариант A — dual local-cors-proxy (как fundamentals-runtime) ✅ default

```bash
# Терминал 1
bunx local-cors-proxy --proxyUrl https://www.sec.gov --port 8011

# Терминал 2
bunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012

# Терминал 3
bun run serve:app
```

или одной командой:

```bash
bun run serve          # parallel: proxy-www + proxy-data + app
# / pm2:
bun start
```

Приложение само **пробивает** кандидатов `http://localhost:{8011,8010,8080,3000,8012}/proxy` (логика как в runtime).

### Вариант B — один современный Bun-прокси (User-Agent + оба хоста)

```bash
# Терминал 1
bun ./scripts/sec-proxy.ts          # MODE=both, port 8012

# Терминал 2
bun run serve:app
```

`scripts/sec-proxy.ts` принимает и runtime-пути (`/proxy/...`), и прямые (`/api/...`, `/files/...`), и выставляет обязательный `User-Agent` для SEC.

Можно эмулировать два порта runtime:

```bash
MODE=www  PORT=8011 bun ./scripts/sec-proxy.ts &
MODE=data PORT=8012 bun ./scripts/sec-proxy.ts &
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
bun run serve              # dual local-cors-proxy + Parcel (runtime-style)
bun run serve:app          # только Parcel
bun ./scripts/sec-proxy.ts # unified Bun proxy
bun run all                # sec-proxy.ts + Parcel
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
│   ├── sec-proxy.ts          # Bun SEC proxy (runtime-compatible)
│   ├── cloudflare-worker.js  # hosted SEC proxy
│   └── fetch_data.py         # pre-fetch company_tickers
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

