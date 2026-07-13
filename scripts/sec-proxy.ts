#!/usr/bin/env bun
/**
 * =============================================================================
 * Fundamentals — LOCAL DEV data proxy (Bun): SEC EDGAR + pre-fetched tickers
 * -----------------------------------------------------------------------------
 * INFRASTRUCTURE (not part of the 3-file app source).
 *
 * WHY:
 *   - SEC EDGAR (www.sec.gov + data.sec.gov) requires a proper User-Agent header.
 *   - No CORS headers on SEC responses.
 *   - Pre-fetched company_tickers.json for GitHub Pages static use.
 *   This tiny Bun server relays those requests with permissive CORS for LOCAL
 *   development.
 *
 * RUN:  bun ./scripts/sec-proxy.ts        (defaults to port 8012)
 *       PORT=8012 bun ./scripts/sec-proxy.ts
 *
 * USE FROM THE APP (Settings / README):
 *   - Proxy base URL = http://localhost:8012
 *   - Company tickers:   GET /api/company_tickers  or /files/company_tickers.json
 *   - Company facts:     GET /api/xbrl/companyfacts/CIK0000320193.json
 *
 * DEPLOY (optional): the same logic can be ported to Cloudflare Worker.
 * =============================================================================
 */

const PORT = Number(process.env.PORT ?? 8012);

const UA = "fundamentals-demo contact@daggerok.github.io";

const PROXY_LABEL_WIDTH = 6; // "SEC   "

function logProxy(proxy: string, localPathOrUrl: string, remoteUrl: string): void {
  const col = proxy.padEnd(PROXY_LABEL_WIDTH);
  console.log(`${col} | ${localPathOrUrl} -> ${remoteUrl}`);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Simple relay with required User-Agent
async function relay(target: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(target, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
      ...CORS,
    },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Pre-fetched / live company tickers (used by GitHub Pages + suggestions)
    if (
      url.pathname === "/api/company_tickers" ||
      url.pathname === "/files/company_tickers.json"
    ) {
      const target = "https://www.sec.gov/files/company_tickers.json";
      logProxy("SEC", url.pathname, target);
      try {
        return await relay(target);
      } catch (e) {
        return json({ error: "Failed to fetch company_tickers" }, 502);
      }
    }

    // www.sec.gov (company_tickers, etc.)
    if (url.pathname.startsWith("/files/")) {
      const target = `https://www.sec.gov${url.pathname}${url.search}`;
      logProxy("SEC", url.pathname + url.search, target);
      return await relay(target);
    }

    // data.sec.gov (xbrl/companyfacts etc.)
    if (url.pathname.startsWith("/api/")) {
      const path = url.pathname.replace(/^\/api/, "");
      const target = `https://data.sec.gov${path}${url.search}`;
      logProxy("SEC", url.pathname + url.search, target);
      return await relay(target);
    }

    // Health / info
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "fundamentals-sec-proxy",
        endpoints: [
          "/api/company_tickers",
          "/files/company_tickers.json",
          "/api/xbrl/companyfacts/CIK0000320193.json",
        ],
      });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`\n🚀 Fundamentals SEC proxy running at http://localhost:${PORT}`);
console.log(`   SEC     | http://localhost:${PORT}/api/company_tickers`);
console.log(`   SEC     | http://localhost:${PORT}/api/xbrl/companyfacts/CIK0000320193.json`);
console.log(`   (relay logs below: "SEC   | $localPath -> $remoteUrl")\n`);
