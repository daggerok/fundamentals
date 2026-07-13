# fundamentals

Fundamentals app using SEC free financial data API.

## Быстрый старт / Quick start (точно как в fundamentals-runtime)

```bash
bun install -E

bun stop ; bun kill ; bun ps ; bun start ; bun logs
```

Откройте: **http://localhost:1234**

---

## Запуск с прокси (рекомендуется)

### Вариант 1: Один современный прокси (лучший способ)

**Терминал 1** (прокси — обрабатывает и www.sec.gov и data.sec.gov):
```bash
bun ./scripts/sec-proxy.ts
```

**Терминал 2** (приложение):
```bash
bun run serve
```

Приложение откроется на http://localhost:1234

### Вариант 2: Два отдельных прокси (как было в fundamentals-runtime)

```bash
# Терминал 1
bunx local-cors-proxy --proxyUrl https://www.sec.gov --port 8011

# Терминал 2
bunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012

# Терминал 3
bun run serve
```

---

## Команды через pm2 (как в fundamentals-runtime)

```bash
bun start      # запустить всё
bun ps
bun logs
bun restart
bun stop
bun kill
```

---

## Сборка

```bash
bun run build
bun run build-github-pages
```

---

## Полезные ссылки

- GitHub Pages: https://daggerok.github.io/fundamentals/
- [fundamentals-runtime](https://github.com/daggerok/fundamentals-runtime) — предыдущая версия

Готово. Выполни команды из раздела "Быстрый старт" и приложение запустится.