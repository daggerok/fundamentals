/// <reference types="bun" />
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import worker from '../scripts/fundamentals-cloudflare-proxy.js';

const PAGES = 'https://daggerok.github.io';
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Call the worker; SEC is never contacted, the relay target is captured instead. */
async function call(path: string, init: RequestInit = {}) {
  const targets: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    targets.push(String(input));
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const res: Response = await worker.fetch(new Request(`https://w.example${path}`, init));
  return { status: res.status, origin: res.headers.get('Access-Control-Allow-Origin'), targets };
}

describe('Cloudflare Worker relays only what the app reads', () => {
  test('ticker map and companyfacts reach SEC, without query strings', async () => {
    expect((await call('/files/company_tickers.json?x=1')).targets).toEqual([
      'https://www.sec.gov/files/company_tickers.json',
    ]);
    const facts = await call('/proxy/api/xbrl/companyfacts/CIK0000320193.json', { headers: { Origin: PAGES } });
    expect(facts.targets).toEqual(['https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json']);
    expect(facts.origin).toBe(PAGES);
  });

  test('other SEC paths and the old /raw passthrough are 404 and never relayed', async () => {
    for (const path of [
      '/raw?url=https%3A%2F%2Fwww.sec.gov%2Fcgi-bin%2Fbrowse-edgar',
      '/files/other.json',
      '/api/xbrl/frames/us-gaap/Revenues/USD/CY2024.json',
      '/api/xbrl/companyfacts/CIK320193.json',
      '/xbrl/companyfacts/CIK0000320193.json',
    ]) {
      const res = await call(path);
      expect([path, res.status]).toEqual([path, 404]);
      expect(res.targets).toEqual([]);
    }
  });

  test('a browser on another origin gets 403', async () => {
    const res = await call('/files/company_tickers.json', { headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
    expect(res.targets).toEqual([]);
  });
});

describe('fundamentals-data.py stops on SEC 403', () => {
  test('one 403 aborts the run without retries and the exit code is 1', () => {
    const script = fileURLToPath(new URL('../scripts/fundamentals-data.py', import.meta.url));
    const code = [
      'import importlib.util, json, os, sys, tempfile, types',
      'from pathlib import Path',
      'sys.modules.setdefault("requests", types.ModuleType("requests"))',
      'spec = importlib.util.spec_from_file_location("fd", sys.argv[1])',
      'fd = importlib.util.module_from_spec(spec); spec.loader.exec_module(fd)',
      'fd.DATA_DIR = Path(tempfile.mkdtemp())',
      'fd.TICKERS_PATH = fd.DATA_DIR / "company_tickers.json"',
      'fd.INDEX_PATH = fd.DATA_DIR / "index.json"',
      'fd.REQUEST_SLEEP = 0',
      'tickers = {str(i): {"cik_str": 1000 + i, "ticker": f"T{i}", "title": "x" * 200} for i in range(60)}',
      'fd.TICKERS_PATH.write_text(json.dumps(tickers))',
      'calls = []',
      'class Res: status_code = 403',
      'class Session:',
      '    def get(self, url, timeout=None):',
      '        calls.append(url); return Res()',
      'fd._session = lambda: Session()',
      'os.environ["TICKERS"] = "T1 T2 T3"',
      'rc = fd.main()',
      'print(json.dumps({"rc": rc, "calls": len(calls)}))',
    ].join('\n');
    const out = execFileSync('python3', ['-c', code, script], { encoding: 'utf8' });
    expect(JSON.parse(out.trim().split('\n').pop()!)).toEqual({ rc: 1, calls: 1 });
  });
});
