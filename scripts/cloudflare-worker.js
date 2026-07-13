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
 *   3. (Recommended) lock ALLOW_ORIGIN below to your Pages origin.
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

// Lock this to your site in production, e.g. "https://daggerok.github.io".
const ALLOW_ORIGIN = "*";

const UA = "fundamentals-demo contact@daggerok.github.io";

function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
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

function resolveTarget(pathname, search) {
  const path = stripProxyPrefix(pathname);

  if (path === "/api/company_tickers" || path === "/files/company_tickers.json") {
    return { host: "WWW", target: `https://www.sec.gov/files/company_tickers.json${search}` };
  }
  if (path.startsWith("/files/")) {
    return { host: "WWW", target: `https://www.sec.gov${path}${search}` };
  }
  if (path.startsWith("/api/")) {
    return { host: "DATA", target: `https://data.sec.gov${path}${search}` };
  }
  if (path.startsWith("/xbrl/")) {
    return { host: "DATA", target: `https://data.sec.gov${path}${search}` };
  }
  return null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

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

    // Optional generic passthrough: /raw?url=<encoded>
    if (url.pathname === "/raw") {
      const target = url.searchParams.get("url");
      if (!target) return json({ error: "missing url" }, 400);
      try {
        const u = new URL(target);
        if (!["www.sec.gov", "data.sec.gov", "efts.sec.gov"].includes(u.hostname)) {
          return json({ error: "host not allowed" }, 403);
        }
        logProxy("RAW", "/raw", target);
        return await relay(target);
      } catch (e) {
        return json({ error: String(e) }, 400);
      }
    }

    const resolved = resolveTarget(url.pathname, url.search);
    if (!resolved) return json({ error: "not found", path: url.pathname }, 404);

    logProxy(resolved.host, url.pathname + url.search, resolved.target);
    try {
      return await relay(resolved.target);
    } catch (e) {
      return json({ error: e?.message || "relay failed", target: resolved.target }, 502);
    }
  },
};
