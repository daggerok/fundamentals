#!/usr/bin/env python3
# =============================================================================
# Fundamentals — build-time SEC static cache (options-desk pattern)
# -----------------------------------------------------------------------------
# Produces same-origin files for GitHub Pages (copied to dist/data via ncp):
#   data/company_tickers.json     SEC ticker map (search)
#   data/{TICKER}.json            companyfacts for CACHE mode
#   data/index.json               manifest: files, count, generated, names
#
# RUN:
#   uv run python scripts/fetch_data.py
#   TICKERS="AAPL MSFT NVDA" MAX_FETCHES=20 uv run python scripts/fetch_data.py
#
# ENV: TICKERS, MAX_FETCHES (40), REQUEST_SLEEP_MINUTES (0.2), SKIP_FRESH_HOURS (24),
#      SEC_USER_AGENT ("Name email@example.com")
# =============================================================================

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
INDEX_PATH = DATA_DIR / "index.json"
TICKERS_PATH = DATA_DIR / "company_tickers.json"

DEFAULT_UA = "Maksim Kostromin daggerok@gmail.com"
UA = os.environ.get("SEC_USER_AGENT", DEFAULT_UA).strip() or DEFAULT_UA
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

REQUEST_SLEEP_MINUTES = float(os.environ.get("REQUEST_SLEEP_MINUTES", "1"))
SKIP_FRESH_HOURS = float(os.environ.get("SKIP_FRESH_HOURS", "1"))
MAX_FETCHES = int(os.environ.get("MAX_FETCHES", "40"))
MAX_RETRIES = int(os.environ.get("MAX_FETCHES", "3"))

DEFAULT_TICKERS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "XOM", "JNJ", "WMT", "MA", "PG", "HD", "CVX", "MRK",
    "ABBV", "PEP", "KO", "AVGO", "COST", "LLY", "ADBE", "CRM", "CSCO", "ACN",
    "MCD", "NFLX", "AMD", "INTC", "ORCL", "TXN", "QCOM", "IBM", "INTU", "AMAT",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _log(msg: str) -> None:
    print(f"[{_now_iso()}] {msg}", flush=True)


def _headers() -> dict[str, str]:
    return {
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }


def _session():
    import requests
    s = requests.Session()
    s.headers.update(_headers())
    return s


def _get_json(session, url: str) -> dict:
    last: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = session.get(url, timeout=90)
            if r.status_code == 403:
                raise RuntimeError(
                    "SEC 403 Forbidden — descriptive User-Agent with contact email required.\n"
                    f'  SEC_USER_AGENT="Your Name you@example.com" uv run python scripts/fetch_data.py\n'
                    f"Current UA: {UA!r}"
                )
            if r.status_code == 404:
                raise FileNotFoundError(f"404 {url}")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last = e
            _log(f"WARN attempt {attempt}/{MAX_RETRIES}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(1.0 * attempt)
    assert last is not None
    raise last


def load_company_tickers(session) -> dict:
    if TICKERS_PATH.exists() and TICKERS_PATH.stat().st_size > 10_000:
        try:
            data = json.loads(TICKERS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and len(data) >= 50:
                _log(f"tickers: using existing {TICKERS_PATH} ({len(data)} entries)")
                return data
        except Exception:
            pass
    _log(f"tickers: fetching {SEC_TICKERS_URL}")
    data = _get_json(session, SEC_TICKERS_URL)
    if not isinstance(data, dict):
        raise TypeError(f"unexpected company_tickers type {type(data)}")
    TICKERS_PATH.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    _log(f"tickers: wrote {TICKERS_PATH} ({len(data)} entries)")
    return data


def ticker_index(company_tickers: dict) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in company_tickers.values():
        if not isinstance(row, dict):
            continue
        t = str(row.get("ticker") or "").upper().strip()
        if not t:
            continue
        cik = str(row.get("cik_str") or row.get("cik") or "").strip()
        if not cik:
            continue
        out[t] = {
            "cik": cik.zfill(10),
            "title": row.get("title") or t,
            "cik_str": row.get("cik_str", cik),
        }
    return out


def parse_tickers_env() -> list[str] | None:
    raw = (os.environ.get("TICKERS") or os.environ.get("TICKER") or "").replace(",", " ").strip()
    if not raw:
        return None
    return [s.upper().strip() for s in raw.split() if s.strip()]


def is_fresh(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 100:
        return False
    age_h = (_now().timestamp() - path.stat().st_mtime) / 3600.0
    return age_h < SKIP_FRESH_HOURS


def write_ticker_cache(symbol: str, meta: dict, raw: dict) -> Path:
    path = DATA_DIR / f"{symbol}.json"
    facts = raw.get("facts") if isinstance(raw.get("facts"), dict) else raw
    payload = {
        "symbol": symbol,
        "ticker": symbol,
        "cik": meta["cik"],
        "title": meta.get("title") or raw.get("entityName") or symbol,
        "updated": _now_iso(),
        "source": "sec-companyfacts",
        "entityName": raw.get("entityName"),
        "facts": facts,
    }
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return path


def rebuild_index(names: dict[str, str]) -> None:
    files: dict[str, str] = {}
    for p in sorted(DATA_DIR.glob("*.json")):
        if p.name in ("index.json", "company_tickers.json"):
            continue
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
            files[p.stem] = doc.get("updated") or _now_iso()
            if doc.get("title"):
                names[p.stem] = doc["title"]
        except Exception:
            files[p.stem] = _now_iso()
    if TICKERS_PATH.exists():
        files["company_tickers.json"] = _now_iso()
    prev_no_options: dict = {}
    if INDEX_PATH.exists():
        try:
            prev = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
            prev_no_options = prev.get("no_options") or {}
            for k, v in (prev.get("names") or {}).items():
                names.setdefault(k, v)
        except Exception:
            pass
    index = {
        "files": dict(sorted(files.items())),
        "count": len([k for k in files if k != "company_tickers.json"]),
        "generated": _now_iso(),
        "names": dict(sorted(names.items())),
        "no_options": prev_no_options,
    }
    INDEX_PATH.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    _log(f"index: wrote {INDEX_PATH} ({index['count']} ticker caches)")


def main() -> int:
    try:
        import requests  # noqa: F401
    except ImportError:
        _log("ERROR: requests required — uv run python scripts/fetch_data.py")
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    session = _session()
    company_tickers = load_company_tickers(session)
    tmap = ticker_index(company_tickers)
    _log(f"tickers map size: {len(tmap)}")

    override = parse_tickers_env()
    if override:
        queue = override
        _log(f"queue: {len(queue)} from TICKERS env")
    else:
        existing = sorted(
            p.stem for p in DATA_DIR.glob("*.json")
            if p.name not in ("index.json", "company_tickers.json")
        )
        queue, seen = [], set()
        for s in DEFAULT_TICKERS + existing:
            if s not in seen:
                queue.append(s)
                seen.add(s)
        _log(f"queue: {len(queue)} (defaults + existing caches)")

    names: dict[str, str] = {}
    fetched = skipped = failed = 0

    for i, sym in enumerate(queue, start=1):
        if fetched >= MAX_FETCHES:
            _log(f"STOP: MAX_FETCHES={MAX_FETCHES}")
            break
        meta = tmap.get(sym)
        if not meta:
            alt = sym.replace(".", "-") if "." in sym else sym.replace("-", ".")
            meta = tmap.get(alt)
            if meta:
                sym = alt
        if not meta:
            _log(f"SKIP [{i}/{len(queue)}] {sym}: not in company_tickers")
            failed += 1
            continue
        path = DATA_DIR / f"{sym}.json"
        if is_fresh(path):
            _log(f"FRESH [{i}/{len(queue)}] {sym}: skip (<{SKIP_FRESH_HOURS}h)")
            skipped += 1
            names[sym] = meta.get("title") or sym
            continue
        cik = meta["cik"]
        url = SEC_FACTS_URL.format(cik=cik)
        _log(f"FETCH [{i}/{len(queue)}] {sym} CIK{cik}")
        try:
            time.sleep(REQUEST_SLEEP_MINUTES)
            raw = _get_json(session, url)
            out = write_ticker_cache(sym, meta, raw)
            fetched += 1
            names[sym] = meta.get("title") or raw.get("entityName") or sym
            _log(f"OK [{i}/{len(queue)}] {sym}: {out.name} ({out.stat().st_size} B)")
        except FileNotFoundError:
            _log(f"NO_FACTS [{i}/{len(queue)}] {sym}: 404")
            failed += 1
        except Exception as e:
            _log(f"ERROR [{i}/{len(queue)}] {sym}: {e}")
            failed += 1

    rebuild_index(names)
    _log(f"DONE: fetched={fetched} skipped_fresh={skipped} failed={failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
