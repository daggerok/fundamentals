# Architect Review: SEC EDGAR Fundamentals Dashboard

**Date:** 2026-07-13  
**Reviewer:** Architect (Arena Agent)  
**Repo:** https://github.com/daggerok/fundamentals  
**Scope:** Quick architectural review of the single-file HTML + React + Babel standalone app. Focus on technology, libraries, tools, architecture, security, and maintainability. Acknowledging the intentional prototype nature (single self-contained file).

---

## Executive Summary

The app is a functional, self-contained prototype for exploring US public company fundamentals using the free SEC EDGAR XBRL data (`data.sec.gov` + `www.sec.gov`). 

It successfully delivers:
- Ticker search + autocomplete
- Annual / Quarterly views
- Income statement, Cash flow, Balance sheet, Per-share metrics + computed ratios
- Charts + tables
- Dark mode + responsive UI
- Local caching + persistence

**Key takeaway:** The implementation proves the concept beautifully for demos and personal use. **However, from a production / long-term architecture perspective, there are several major issues** — primarily around compliance with SEC API requirements, runtime compilation in the browser, monolithic code structure, and data extraction robustness.

The biggest red flags (apart from intentional Babel runtime usage):
- Missing required `User-Agent` header → will result in 403s from SEC.
- No rate limiting / retry strategy.
- Fragile XBRL concept mapping.
- Everything in a 35KB single HTML file (JSX + logic + config + styles).

**Recommendation:** Keep as a great showcase/prototype. For any production fork or showcase, move to a proper build pipeline + server-side proxy + better data layer.

---

## Strengths

- **Excellent self-contained demo**: Single file, zero install for the end user (after proxies). Perfect for GitHub Pages / quick sharing.
- **Good UX for prototype**: Fast feedback, suggestions, keyboard nav, scale control, dark/light.
- **Smart local proxy approach**: Uses `local-cors-proxy` + dual ports for www + data.
- **Solid React patterns in one file**: Hooks, useMemo, useCallback, local state, computed series.
- **Comprehensive metric coverage**: Good attempt at mapping multiple GAAP concepts.
- **Caching**: Basic localStorage works well for quick reloads.
- **Visuals**: Clean Tailwind + inline SVG mini-charts.
- **Topics alignment**: React, Tailwind, Babel standalone, GitHub Pages — exactly as tagged.

---

## Critical Issues (Must Fix)

### 1. SEC API Compliance & Security (High)

- **Missing User-Agent header** (CRITICAL):
  - SEC **requires** `User-Agent: <AppName> <contact@email.com>` on **every** request.
  - Current code uses plain `fetch(...)` → **403 Forbidden** on real usage.
  - Source: SEC docs + widespread reports (2026).

- **No rate limiting**:
  - Hard 10 req/sec per IP across all EDGAR domains.
  - Current probing + search can easily trigger blocks (especially during dev).

- **No retry / backoff / error handling** for 429/403.

- **Proxy-only approach**:
  - Relies on `local-cors-proxy` running locally. Not portable, not suitable for hosted version (`daggerok.github.io`).

- **No HTTPS enforcement / CORS handling** for production.

**Fixes needed**:
- Always send proper User-Agent.
- Implement simple client rate limiter (e.g. 8 req/sec + queue).
- Add server-side proxy (or Cloudflare Worker / Vercel Edge) for hosted demos.
- Document required headers.

### 2. Runtime Babel in Browser (Acknowledged but Problematic)

- Using `@babel/standalone@7.24.0` (July 2024 version — already outdated).
- Transpiles the entire React app **at runtime** on every page load.
- **Problems**:
  - Large payload (~1.5–2MB+ for Babel + React UMD).
  - Slow initial load (compilation overhead).
  - Not suitable for production (Babel docs explicitly discourage it).
  - Security surface (executing compiler in browser).
  - No tree-shaking, no minification.

**Alternatives recommended**:
- Build-time: Vite + React + Tailwind (output single HTML possible via plugins or `html-inline`).
- Or keep prototype but switch to production UMD React only (no Babel) + vanilla JS for future.
- For true zero-build: Consider **Alpine.js** + **HTMX** or **Svelte** (smaller standalone).

### 3. Data Extraction & XBRL Robustness (High)

- Hardcoded `CON` map with ~25 concepts — good start but **incomplete and brittle**.
  - Many companies use extensions or different tags.
  - No fallback for common variants (e.g. different revenue tags per industry).
  - `exM()` filtering by `form` / `fp` is simplistic (misses amended filings, different fiscal calendars).

- Computed metrics (margins, FCF, ratios) assume perfect data presence — no graceful degradation for missing values.

- **No handling of**:
  - Restatements / amended filings.
  - Different units (some facts may be in shares vs USD).
  - Dimensional contexts.
  - Pre-XBRL historical data (limited).

- Caching stores raw facts but no metadata (last fetched, version).

**Risk**: Incorrect or missing numbers for many tickers beyond mega-caps.

### 4. Architecture & Code Quality

- **Monolithic single file** (35k lines HTML):
  - Violates separation of concerns.
  - Extremely hard to test, review, or extend.
  - All logic, config, UI, styles in one place.
  - JSX embedded in `<script type="text/babel">`.

- Global constants (`CON`, `SEC`, `TC`) mixed with React components.
- Heavy inline functions (`proc`, `exM`, `fV`) inside the script — no modules.
- State management is fine for size, but will explode when adding features (filters, comparisons, export).

- No TypeScript despite being in topics (uses plain JS with some TS-like intent).

- No error boundaries, no loading states per section.

---

## Performance & Scalability

- **Initial load**: Heavy (React UMD + Babel standalone + Tailwind + fonts + Google Fonts preconnect).
- **Runtime**: SVG charts are efficient, but `proc()` recomputes on every mode change (minor).
- **Memory**: localStorage capped at 4MB — will fail for large companies or long histories.
- **No virtualization** for tables (fine now).
- **No offline support** beyond cache.
- Scale slider is nice but applied only to fonts — not full responsive scaling.

**Hosted version** (`daggerok.github.io`) will break without a proxy (CORS + rate limits).

---

## UX / Accessibility / Polish

**Good**:
- Suggestions + keyboard support.
- Scale control (per section header).
- Persistent preferences.
- Console debug toggle.

**Missing / needs improvement**:
- No ARIA labels, roles, focus management.
- Error messages could be more actionable.
- No "Export CSV / PDF" or shareable links.
- No multi-company comparison.
- Ticker input allows any value (no validation).
- No indication of data freshness or source filing date.
- Mobile: tables scroll ok, but charts cramped on small screens.
- No help / legend for metrics.

---

## Technology / Libraries / Tooling Assessment

| Category          | Current                          | Assessment                          | Recommendation |
|-------------------|----------------------------------|-------------------------------------|--------------|
| UI Framework      | React 18 UMD + Tailwind CDN     | Good for prototype                 | Keep for now or move to build |
| Transpiler        | Babel Standalone 7.24           | **Bad** for prod                   | Remove or build-time only |
| Styling           | Tailwind via CDN                | Excellent quick start              | Fine |
| Data Source       | data.sec.gov XBRL (CompanyFacts)| Correct choice                     | Good |
| Proxy             | local-cors-proxy (manual)       | Works for dev                      | Replace with proper proxy |
| State             | React hooks + localStorage      | Adequate                           | Fine for size |
| Charts            | Custom SVG                      | Lightweight, good                  | Consider Recharts if built |
| Build / Deploy    | None (GitHub Pages direct)      | Simple                             | Add Vite or Parcel for prod |
| Testing           | None                            | **Missing**                        | Add Playwright / Vitest |
| CI/CD             | None                            | **Missing**                        | Add GitHub Actions |
| Auth / Headers    | None                            | **Critical gap**                   | Add User-Agent + rate limit |
| Caching           | localStorage                    | Basic                              | Upgrade to IndexedDB + TTL |

**Other notes**:
- Babel version pinned to old 7.24.0.
- React production UMD used — good choice.
- No package.json / dependencies managed (intentional).

---

## Risks

- SEC blocks / rate limits on public demos.
- Incorrect financial numbers → bad user decisions.
- Hard to maintain / fork beyond prototype.
- SEO / accessibility issues for hosted version.
- Legal: Always attribute data to SEC + do not provide investment advice without disclaimers.

---

## Quick Wins (Low Effort, High Impact)

1. Add proper `User-Agent` header (e.g. `fundamentals-demo contact@yourdomain.com`).
2. Implement basic client-side rate limiting (delay between fetches).
3. Add `User-Agent` + `Accept` headers explicitly.
4. Improve `CON` mapping with more fallbacks + logging of unmatched concepts.
5. Extract config to `window.SEC_CONFIG` or separate script tag.
6. Add simple disclaimer + data source attribution.
7. Document exact proxy setup + hosted limitations in README.
8. Add GitHub Pages workflow + basic lint.

---

## Long-term Recommendations

- **For showcase fork**: Convert to Vite + React + TypeScript. Use serverless proxy (e.g. Vercel / Netlify Functions) or official bulk data.
- Consider **server-side rendering** or pre-computed snapshots for popular tickers.
- Integrate real charting lib + export features.
- Add company comparison, peer benchmarking, historical trends.
- Use SEC bulk files (`companyfacts.zip`) for offline-first version.
- Consider shifting to a more sustainable stack: **HTMX + Tailwind** or full **Next.js** if expanding.

---

## Conclusion

Excellent proof-of-concept and a very cool single-file achievement. It demonstrates deep understanding of SEC data and creative frontend engineering.

**For immediate use**: Add the User-Agent + rate limit fixes today.

**For long-term / renamed showcase**: Refactor out of the single file + remove Babel runtime.

Great work on the concept!

---

*Generated during architect review. Ready for discussion.*