#!/usr/bin/env bun
/**
 * =============================================================================
 * Fundamentals — LOCAL DEV proxy (Bun): SEC EDGAR www + data + pre-fetched tickers
 * -----------------------------------------------------------------------------
 * - Relays requests to www.sec.gov and data.sec.gov with proper User-Agent
 * - Adds permissive CORS for localhost development
 * - Exposes /api/company_tickers (pre-fetched at build time for GitHub Pages)
 * - Supports search suggestions from pre-fetched tickers
 *
 * RUN: bun ./scripts/sec-proxy.ts
 *      PORT=8012 bun ./scripts/sec-proxy.ts
 *
 * USE FROM THE APP (Settings / README):
 *   - Proxy base URL: http://localhost:8012
 *   - www:   /files/company_tickers.json
 *   - data:  /api/xbrl/companyfacts/CIK{10}.json
 *
 * DEPLOY: same logic can be ported to Cloudflare Worker for hosted demo
 * =============================================================================
 */

const PORT = Number(process.env.PORT ?? 8012);
const UA = "fundamentals-demo contact@daggerok.github.io";

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

function logProxy(local: string, remote: string) {
  console.log(`[SEC] ${local} -> ${remote}`);
}

async function relay(target: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(target, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      ...(init?.headers || {}),
    },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json", ...CORS },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // === Pre-fetched tickers (used by GitHub Pages + suggestions) ===
    if (url.pathname === "/api/company_tickers" || url.pathname === "/files/company_tickers.json") {
      // In real app this would be served from dist/data or static file
      // For dev we can proxy or serve a local copy
      const target = "https://www.sec.gov/files/company_tickers.json";
      logProxy(url.pathname, target);
      try {
        return await relay(target);
      } catch (e) {
        return json({ error: "Failed to fetch company_tickers" }, 502);
      }
    }

    // === www.sec.gov (company tickers, etc) ===
    if (url.pathname.startsWith("/files/") || url.pathname.startsWith("/proxy/files/")) {
      const path = url.pathname.replace(/^\/proxy/, "");
      const target = `https://www.sec.gov${path}${url.search}`;
      logProxy(url.pathname + url.search, target);
      return relay(target);
    }

    // === data.sec.gov (companyfacts, etc) ===
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/proxy/api/")) {
      const path = url.pathname.replace(/^\/proxy/, "");
      const target = `https://data.sec.gov${path}${url.search}`;
      logProxy(url.pathname + url.search, target);
      return relay(target);
    }

    // === Health / info ===
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "fundamentals-sec-proxy",
        endpoints: [
          "/files/company_tickers.json",
          "/api/company_tickers",
          "/api/xbrl/companyfacts/CIK0000320193.json",
        ],
      });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`\n🚀 Fundamentals SEC proxy running at http://localhost:${PORT}`);
console.log(`   www     → http://localhost:${PORT}/files/company_tickers.json`);
console.log(`   data    → http://localhost:${PORT}/api/xbrl/companyfacts/CIK0000320193.json`);
console.log(`   tickers → http://localhost:${PORT}/api/company_tickers\n`);