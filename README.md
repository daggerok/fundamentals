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

## Быстрый старт (с использованием Bun)

```bash
git clone https://github.com/daggerok/fundamentals.git
cd fundamentals
bun install -E
```

### Запуск с прокси (рекомендуется)

```bash
# Терминал 1 — прокси
bun ./scripts/sec-proxy.ts

# Терминал 2 — приложение
bun run serve
```

Откройте http://localhost:1234 (или порт, который покажет Parcel).

### Сборка

```bash
bun run build
bun run build-github-pages   # для GitHub Pages с правильным public URL
```

---

## Ключевые концепции (вдохновлено options-desk)

### 1. Прокси (Bun)

- `scripts/sec-proxy.ts` — релей для `www.sec.gov` + `data.sec.gov` + префетчинг тикеров
- Обязательный `User-Agent`
- Поддержка `/api/company_tickers` и `/api/search`

### 2. SPA: TypeScript + React + TSX + Tailwind v4

- `src/main.tsx` (или эквивалент) — всё приложение
- `src/index.html` + `src/index.css`
- Используется **Parcel** (не Vite/Webpack)

### 3. Пре-фетчинг тикеров для GitHub Pages

- GitHub Action (`update-data.yml`) скачивает `company_tickers.json` в `data/`
- Приложение использует локальный `data/company_tickers.json` как статический кэш
- На GitHub Pages работает **без прокси** для тикеров

### 4. i18n (EN / RU)

- Полная поддержка английского и русского
- Переключатель языка в шапке и настройках

### 5. Bun вместо npm

- `bun install -E`
- `bun run serve`
- `bun ./scripts/sec-proxy.ts`

---

## Основные команды

```bash
bun install -E          # установка
bun run serve           # dev сервер (Parcel)
bun run build           # production сборка
bun run build-github-pages
bun ./scripts/sec-proxy.ts   # прокси для разработки
```

---

## Структура проекта (по образцу options-desk)

```
fundamentals/
├── src/
│   ├── index.html
│   ├── index.css
│   └── main.tsx            # ← основное приложение
├── scripts/
│   └── sec-proxy.ts
├── data/
│   └── company_tickers.json   # префетчится в CI
├── .github/workflows/
│   ├── ci.yaml
│   ├── github-pages.yml
│   └── update-data.yml
├── package.json
└── README.md
```

---

## Следующие шаги (рекомендуется)

1. Перенести логику из старого `index.html` в `src/main.tsx` (React + TS)
2. Добавить типы для SEC данных
3. Реализовать провайдеры (CACHE / PROXY)
4. Добавить i18n (аналогично options-desk)
5. Настроить кэш + настройки в localStorage

Готовы продолжить миграцию — скажите «go» или «продолжай».

---

*Проект переведён на современный стек по образцу https://github.com/daggerok/options-desk/*