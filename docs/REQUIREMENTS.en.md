# REQUIREMENTS: SEC EDGAR Financial Fundamentals Dashboard

**Project:** fundamentals  
**Version:** 0.1 (Prototype)  
**Date:** 2026-07-13  
**Purpose:** This document captures the functional and non-functional requirements for the app. It is intended to be used when discussing the project with AI agents, for agentic development, forking, or building a production showcase version.

---

## 1. Overview / Vision

A lightweight, self-contained web application that allows users to:
- Search for US public companies by ticker or name
- Fetch and display key financial fundamentals using free SEC EDGAR XBRL data
- Explore Income Statement, Cash Flow, Balance Sheet, and Per-Share metrics
- View both tabular data and simple charts
- Switch between Annual (Y) and Quarterly (Q) views
- Customize display (dark mode, zoom/scale)

**Core Goal (Prototype):** Deliver a working single-file HTML experience that demonstrates SEC data usage with **zero build step** for the end user.

**Future Goal (Showcase):** A polished, maintainable demo that can be used as a reference for financial data exploration tools.

---

## 2. Functional Requirements

### 2.1 Core Features (MVP)

| ID  | Requirement | Priority | Notes |
|-----|-------------|----------|-------|
| F-01 | Search / autocomplete for tickers and company names | High | Uses `company_tickers.json` from www.sec.gov |
| F-02 | Load CompanyFacts via `data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json` | High | Primary data source |
| F-03 | Display Income Statement section (Revenue, Gross Profit, Net Income, EPS, R&D, SG&A, margins) | High | |
| F-04 | Display Cash Flow section (OCF, CapEx, FCF, Dividends, Buybacks, D&A) | High | |
| F-05 | Display Balance Sheet section (Assets, Liabilities, Equity, Cash, Debt, ratios) | High | |
| F-06 | Display Per Share & Other section (Shares, Revenue/Share, FCF/Share) | Medium | |
| F-07 | Toggle between Annual (Y) and Quarterly (Q) modes | High | |
| F-08 | Toggle between Table view and Chart view (per section or global) | High | Charts are mini SVG line + area |
| F-09 | Persistent user preferences (ticker, mode, view, dark, scale) | Medium | localStorage |
| F-10 | Local caching of last loaded company data | Medium | localStorage (facts + company) |
| F-11 | Debug / logs console (toggleable) | Low | |
| F-12 | Proxy health indicators (www + data dots) | Medium | |

### 2.2 Data Mapping & Computations

- Support multiple US-GAAP concept names per metric (e.g. several possible keys for "Revenue")
- Compute derived metrics:
  - Gross Margin, Operating Margin, Net Margin
  - Free Cash Flow (OCF - CapEx)
  - ROE, ROA, Debt/Equity, Current Ratio
  - Revenue per Share, FCF per Share
- Filter and deduplicate facts by form (10-K / 10-Q) and period (FY / Qx)
- Graceful handling of missing values (`—`)

### 2.3 User Interface

- Responsive (desktop-first, mobile usable)
- Dark / Light mode (persistent)
- Font scale slider (per section header)
- Real-time suggestions dropdown with keyboard navigation (↑↓, Enter, Esc)
- Loading states and error messages
- Sticky top bar with search + controls

### 2.4 Data Sources & Proxies (Current)

- `https://www.sec.gov/files/company_tickers.json` (via local proxy)
- `https://data.sec.gov/api/xbrl/companyfacts/CIK{...}.json` (via local proxy)
- Recommended local proxies:
  - `bunx local-cors-proxy --proxyUrl https://www.sec.gov --port 8011`
  - `bunx local-cors-proxy --proxyUrl https://data.sec.gov --port 8012`

### 2.5 Out of Scope (Current Prototype)

- User accounts / authentication
- Historical filings beyond CompanyFacts
- Multi-company comparison
- Export (CSV, PDF, Excel)
- Charts beyond simple inline SVG
- Filtering / search within results
- Mobile-optimized charts
- Offline mode beyond basic cache
- Real-time data updates
- Investment advice or disclaimers (currently minimal)

---

## 3. Non-Functional Requirements

### 3.1 Performance

- Initial page load < 5s on good connection (current heavy due to Babel)
- Search + load time for a company < 3s (excluding proxy)
- Smooth interactions (no jank on scale change or view toggle)
- localStorage usage < 4MB per entry

### 3.2 Reliability & Compliance

- Must respect SEC rate limits: **max 10 requests/second per IP** (target ≤ 8)
- **MUST** send valid `User-Agent` header on all SEC requests:
  - Format: `ApplicationName contact@email.com`
- Must handle 403, 429, network errors gracefully
- Must not exceed reasonable request volume in demos

### 3.3 Security

- No credentials stored in code
- No direct browser calls to SEC without proper headers (current violation)
- CORS handled via local proxy (or future server proxy)
- No execution of untrusted content beyond controlled Babel (acknowledged risk)

### 3.4 Maintainability

- Currently: Single self-contained `index.html` (intentional for prototype)
- Code must remain readable in one file for now
- All configuration (metric mappings, colors, proxy ports) should be easy to locate and modify

### 3.5 Accessibility & Usability

- Basic keyboard support (already present)
- Semantic structure where possible
- Clear labels and units
- Error states that guide the user (proxy instructions, retry)

### 3.6 Portability & Deployment

- Works when opened directly (`file://`) with proxies (limited)
- Works via `bunx serve` / any static server
- Deployable to GitHub Pages (requires working proxy solution for live demo)
- No Node.js / build tools required for end users

---

## 4. Technical Constraints (Current)

- **Single HTML file** with everything inline (React, Tailwind via CDN, Babel standalone)
- React 18 via UMD CDN
- `@babel/standalone` for JSX transpilation at runtime
- Tailwind via `https://cdn.tailwindcss.com`
- No external build step / bundler for the current version
- Data fetched client-side only
- English primary language (metrics and UI)

**Known intentional trade-offs:**
- Runtime Babel (slow load, large bundle)
- No TypeScript
- No tests
- Monolithic code

---

## 5. Future / Showcase Requirements (When Forking)

When creating a renamed showcase version, consider the following:

| Category | Requirement |
|----------|-------------|
| Build | Use Vite / Parcel / esbuild. Output can still be a single HTML via plugins if desired |
| Backend/Proxy | Replace local-cors-proxy with serverless function or Cloudflare Worker |
| Data | Add proper User-Agent + rate limiter. Consider bulk data downloads |
| Tech | Add TypeScript, component extraction, proper state management (Zustand / Jotai) |
| Features | Multi-ticker comparison, export, better charts (Recharts / Chart.js), historical filings |
| UX | Full accessibility audit, better mobile experience, onboarding |
| Quality | Unit + E2E tests, CI/CD, linting, automated security checks |
| Legal | Add prominent SEC data attribution + "Not financial advice" disclaimer |
| Performance | Preload popular tickers or use server-side caching |
| Deployment | GitHub Pages + live demo with working proxy, or Vercel/Netlify |

---

## 6. Success Metrics (for future versions)

- Users can load any major ticker without errors
- All core metrics render for at least top 50 S&P companies
- Page loads in < 2s after removing Babel
- Zero 403s from SEC when properly configured
- Easy for other developers to understand and extend

---

## 7. Glossary

- **CIK**: Central Index Key (10-digit identifier for SEC filers)
- **XBRL**: eXtensible Business Reporting Language
- **CompanyFacts**: SEC endpoint returning all tagged financial facts for a company
- **10-K / 10-Q**: Annual / Quarterly reports
- **us-gaap**: Primary taxonomy namespace in SEC filings

---

## 8. References

- [SEC EDGAR API documentation](https://www.sec.gov/edgar/sec-api-documentation)
- [data.sec.gov CompanyFacts](https://data.sec.gov/api/xbrl/companyfacts/)
- Original inspiration article (see README)
- SEC rate limits and User-Agent requirements (see findings documents)

---

*This document is living. Update it as requirements evolve.*