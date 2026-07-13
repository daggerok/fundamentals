# fundamentals

Fundamentals app using SEC free financial data API [article](https://dev.to/m0dus/the-sec-has-a-free-financial-data-api-that-nobody-talks-about-dfi)

<!-- https://arena.ai/c/019f1c6c-8842-7637-852c-fdba43e83e64 -->

## Быстрый старт / Quick start

1. Запустите прокси для www.sec.gov:

```bash
bunx local-cors-proxy --proxyUrl https://www.sec.gov --port 8011
```

2. Запустите прокси для data.sec.gov:

```bash
bunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012
```

3. Запустите статический сервер:

```bash
bunx serve .
```

4. Откройте приложение:

```bash
open http://localhost:3000/
```

---

## 📚 Документация / Documentation

Все документы находятся в директории `docs/`:

| Документ | Описание |
|----------|----------|
| [findings.en.md](docs/findings.en.md) | Архитектурный обзор (английский) — технологии, библиотеки, проблемы, рекомендации |
| [findings.ru.md](docs/findings.ru.md) | Архитектурный обзор (русский) |
| [REQUIREMENTS.en.md](docs/REQUIREMENTS.en.md) | Требования к приложению (английский) — для общения с AI-агентами и разработки |
| [REQUIREMENTS.ru.md](docs/REQUIREMENTS.ru.md) | Требования к приложению (русский) |

> Эти документы были подготовлены в рамках архитектурного ревью для удобства дальнейшей разработки и форка showcase-версии.

---

## О приложении / About

Приложение позволяет анализировать фундаментальные данные публичных компаний США с использованием бесплатного API SEC EDGAR (XBRL).

- Поиск по тикеру или названию компании
- Годовой и квартальный режимы
- Таблицы + мини-графики
- Income Statement, Cash Flow, Balance Sheet, Per Share метрики
- Вычисляемые коэффициенты (маржи, FCF, ROE и др.)
- Тёмная/светлая тема, масштабирование, кэширование

---

## Ограничения текущей версии

- Однофайловое HTML-приложение (намеренно для прототипа)
- Требует локальных прокси (CORS)
- Использует Babel standalone в браузере (для демонстрации)

Для production / showcase-версии рекомендуется перейти на сборку (Vite и т.п.) + серверный прокси.

---

## Ссылки

- [GitHub Pages](https://daggerok.github.io/fundamentals/)
- [SEC EDGAR API](https://www.sec.gov/edgar/sec-api-documentation)

*Проект находится в активной разработке.*