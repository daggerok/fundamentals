#!/usr/bin/env bun
/**
 * =============================================================================
 * Fundamentals — LOCAL DEV SEC proxy (Bun)
 * -----------------------------------------------------------------------------
 * INFRASTRUCTURE (not part of the 3-file app source).
 *
 * WHY:
 *   - SEC EDGAR (www.sec.gov + data.sec.gov) requires a proper User-Agent.
 *   - No CORS headers on SEC responses.
 *   - fundamentals-runtime used two `local-cors-proxy` processes
 *     (ports 8011 / 8012, path prefix `/proxy`). This single Bun server can
 *     replace both: one process, correct User-Agent, same URL shapes.
 *
 * RUN (default — data host, port 8012):
 *   bun ./scripts/sec-proxy.ts
 *   PORT=8012 bun ./scripts/sec-proxy.ts
 *
 * RUN as www host (port 8011, like fundamentals-runtime):
 *   MODE=www PORT=8011 bun ./scripts/sec-proxy.ts
 *
 * RUN unified (both www + data on one port — recommended):
 *   MODE=both PORT=8012 bun ./scripts/sec-proxy.ts
 *
 * URL shapes accepted (compatible with fundamentals-runtime + app):
 *   http://localhost:8011/proxy/files/company_tickers.json   → www.sec.gov
 *   http://localhost:8012/proxy/api/xbrl/companyfacts/...    → data.sec.gov
 *   http://localhost:8012/api/company_tickers
 *   http://localhost:8012/api/xbrl/companyfacts/CIK....json
 *   http://localhost:8012/files/company_tickers.json
 *
 * DEPLOY: same logic can be ported to Cloudflare Worker (scripts/cloudflare-worker.js).
 * =============================================================================
 */

const PORT = Number(process.env.PORT ?? 8012);
/** "data" | "www" | "both" — default "both" so one process covers runtime dual-proxy URLs */
const MODE = (process.env.MODE ?? "both").toLowerCase();

const UA = "Maksim Kostromin daggerok@gmail.com";

const PROXY_LABEL_WIDTH = 6;

function logProxy(proxy: string, localPathOrUrl: string, remoteUrl: string): void {
  const col = proxy.padEnd(PROXY_LABEL_WIDTH);
  console.log(`${col} | ${localPathOrUrl} -> ${remoteUrl}`);
}

const CORS: Record<string, string> = {
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

async function relay(target: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(target, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate",
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

/** Strip optional `/proxy` prefix used by local-cors-proxy / fundamentals-runtime */
function stripProxyPrefix(pathname: string): string {
  if (pathname === "/proxy") return "/";
  if (pathname.startsWith("/proxy/")) return pathname.slice("/proxy".length) || "/";
  return pathname;
}

function resolveTarget(pathname: string, search: string): { host: "WWW" | "DATA"; target: string } | null {
  const path = stripProxyPrefix(pathname);

  // Convenience alias used by the SPA
  if (path === "/api/company_tickers" || path === "/files/company_tickers.json") {
    return {
      host: "WWW",
      target: `https://www.sec.gov/files/company_tickers.json${search}`,
    };
  }

  // www.sec.gov paths
  if (path.startsWith("/files/")) {
    return { host: "WWW", target: `https://www.sec.gov${path}${search}` };
  }

  // data.sec.gov — app and local-cors-proxy use `/api/...` which maps to data host root
  if (path.startsWith("/api/")) {
    // `/api/xbrl/...` → `https://data.sec.gov/api/xbrl/...`  OR without extra /api?
    // data.sec.gov real path is `/api/xbrl/companyfacts/...`
    return { host: "DATA", target: `https://data.sec.gov${path}${search}` };
  }

  // raw xbrl path without /api prefix (defensive)
  if (path.startsWith("/xbrl/")) {
    return { host: "DATA", target: `https://data.sec.gov${path}${search}` };
  }

  return null;
}

function modeAllows(host: "WWW" | "DATA"): boolean {
  if (MODE === "both") return true;
  if (MODE === "www") return host === "WWW";
  // default / "data"
  return host === "DATA";
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "fundamentals-sec-proxy",
        mode: MODE,
        port: PORT,
        note: "Compatible with fundamentals-runtime local-cors-proxy URL shapes (/proxy/...)",
        endpoints: [
          "/proxy/files/company_tickers.json",
          "/proxy/api/xbrl/companyfacts/CIK0000320193.json",
          "/api/company_tickers",
          "/files/company_tickers.json",
          "/api/xbrl/companyfacts/CIK0000320193.json",
        ],
      });
    }

    const resolved = resolveTarget(url.pathname, url.search);
    if (!resolved) {
      return json({ error: "not found", path: url.pathname }, 404);
    }

    if (!modeAllows(resolved.host)) {
      return json(
        {
          error: `this proxy instance is MODE=${MODE} and does not serve ${resolved.host} routes`,
          hint: "Use MODE=both, or run two instances (MODE=www PORT=8011 + MODE=data PORT=8012)",
        },
        400,
      );
    }

    logProxy(resolved.host, url.pathname + url.search, resolved.target);
    try {
      return await relay(resolved.target);
    } catch (e: any) {
      return json({ error: e?.message || "relay failed", target: resolved.target }, 502);
    }
  },
});

console.log(`\n🚀 Fundamentals SEC proxy running at http://localhost:${PORT} (MODE=${MODE})`);
console.log(`   Runtime-compatible:`);
console.log(`     http://localhost:${PORT}/proxy/files/company_tickers.json`);
console.log(`     http://localhost:${PORT}/proxy/api/xbrl/companyfacts/CIK0000320193.json`);
console.log(`   Direct:`);
console.log(`     http://localhost:${PORT}/api/company_tickers`);
console.log(`     http://localhost:${PORT}/api/xbrl/companyfacts/CIK0000320193.json`);
console.log(`   (relay logs: "WWW|DATA | $localPath -> $remoteUrl")\n`);
