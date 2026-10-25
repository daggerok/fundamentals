/**
 * =============================================================================
 * Fundamentals — Cloudflare Worker proxy (deploy for public GitHub Pages)
 * -----------------------------------------------------------------------------
 * INFRASTRUCTURE (not part of the 3-file app source).
 *
 * WHY: SEC EDGAR (www.sec.gov + data.sec.gov) has no browser CORS and requires
 *      a descriptive User-Agent. A free Cloudflare Worker gives your public
 *      GitHub Pages site a stable CORS-enabled endpoint.
 *
 * DEPLOY (free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker.
 *   2. Paste this file, Deploy. You get https://<name>.<you>.workers.dev
 *   3. A fork on another Pages origin changes ALLOW_ORIGIN below.
 *
 * LOCKED DOWN: only the two SEC resources the app reads are relayed (the ticker
 * map and one company's companyfacts), and browsers on other origins get 403.
 *
 * USE FROM THE APP:
 *   - Unified proxy base = your Worker URL (no trailing slash)
 *   - Company tickers:  GET {base}/api/company_tickers
 *                       GET {base}/files/company_tickers.json
 *                       GET {base}/proxy/files/company_tickers.json
 *   - Company facts:    GET {base}/api/xbrl/companyfacts/CIK0000320193.json
 *                       GET {base}/proxy/api/xbrl/companyfacts/CIK0000320193.json
 *
 * Compatible with fundamentals-runtime local-cors-proxy `/proxy/...` shapes.
 * =============================================================================
 */

// The GitHub Pages origin of the app; requests from any other browser origin get 403.
const ALLOW_ORIGIN = "https://daggerok.github.io";

const UA = "Maksim Kostromin daggerok@gmail.com";

function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    Vary: "Origin",
  };
}

const PROXY_LABEL_WIDTH = 6;
function logProxy(proxy, localPathOrUrl, remoteUrl) {
  console.log(`${String(proxy).padEnd(PROXY_LABEL_WIDTH)} | ${localPathOrUrl} -> ${remoteUrl}`);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

async function relay(target) {
  const res = await fetch(target, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
    },
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
      ...cors(),
    },
  });
}

function stripProxyPrefix(pathname) {
  if (pathname === "/proxy") return "/";
  if (pathname.startsWith("/proxy/")) return pathname.slice("/proxy".length) || "/";
  return pathname;
}

const COMPANYFACTS = /^\/api\/xbrl\/companyfacts\/CIK\d{10}\.json$/;

/** Only what the dashboard reads; query strings are not forwarded. */
function resolveTarget(pathname) {
  const path = stripProxyPrefix(pathname);

  if (path === "/api/company_tickers" || path === "/files/company_tickers.json") {
    return { host: "WWW", target: "https://www.sec.gov/files/company_tickers.json" };
  }
  if (COMPANYFACTS.test(path)) {
    return { host: "DATA", target: `https://data.sec.gov${path}` };
  }
  return null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOW_ORIGIN) {
      return json({ error: "origin not allowed", origin }, 403);
    }
    if (request.method !== "GET" && request.method !== "OPTIONS") {
      return json({ error: "method not allowed" }, 405);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "fundamentals-sec-worker",
        endpoints: [
          "/api/company_tickers",
          "/files/company_tickers.json",
          "/proxy/files/company_tickers.json",
          "/api/xbrl/companyfacts/CIK0000320193.json",
          "/proxy/api/xbrl/companyfacts/CIK0000320193.json",
        ],
      });
    }

    const resolved = resolveTarget(url.pathname);
    if (!resolved) return json({ error: "not found", path: url.pathname }, 404);

    logProxy(resolved.host, url.pathname, resolved.target);
    try {
      return await relay(resolved.target);
    } catch (e) {
      return json({ error: e?.message || "relay failed", target: resolved.target }, 502);
    }
  },
};
