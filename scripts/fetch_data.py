#!/usr/bin/env python3
# =============================================================================
# Fundamentals — build-time SEC static cache (options-desk coverage-first)
# -----------------------------------------------------------------------------
# Same-origin files for GitHub Pages (copied to dist/data via ncp):
#   data/company_tickers.json     SEC ticker map (search)
#   data/{TICKER}.json            companyfacts for CACHE mode
#   data/index.json               manifest: files (ticker list), count, names
#                                 (no per-ticker timestamps / no `generated` —
#                                 freshness uses filesystem mtime; git only sees
#                                 real content changes)
#
# RUN:
#   uv run python scripts/fetch_data.py
#   MAX_FETCHES=100 uv run python scripts/fetch_data.py
#   TICKERS="AAPL MSFT" uv run python scripts/fetch_data.py   # explicit only
#   UNIVERSE_SIZE=500 SKIP_FRESH_HOURS=0 MAX_FETCHES=50 uv run python scripts/fetch_data.py
#
# QUEUE (when TICKERS not set) — options-desk style:
#   1) MISSING symbols from company_tickers (coverage-first)
#   2) then STALE cached files (oldest first refresh)
#   Fresh files are skipped. MAX_FETCHES caps successful NEW writes per run.
#
# ENV:
#   TICKERS / TICKER       optional explicit list (space/comma)
#   MAX_FETCHES            max successful companyfacts writes this run (default 40)
#   UNIVERSE_SIZE          max symbols from company_tickers to consider (default 0 = all)
#   REQUEST_SLEEP          seconds between SEC calls (default 0.25)
#   SKIP_FRESH_HOURS       skip re-fetch if file younger than N hours (default 24)
#   MAX_RETRIES            HTTP retries per request (default 3)
#   SEC_USER_AGENT         "Name email@example.com"
#   MIN_FACTS_BYTES        reject tiny/useless payloads (default 5000)
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

MAX_FETCHES = int(os.environ.get("MAX_FETCHES", "40"))
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "3"))
REQUEST_SLEEP = float(os.environ.get("REQUEST_SLEEP", os.environ.get("REQUEST_SLEEP_MINUTES", "0.25")))
# If someone still passes REQUEST_SLEEP_MINUTES=1 meaning seconds, keep seconds.
# If they pass a large value thinking minutes, clamp is not applied — document as seconds.
SKIP_FRESH_HOURS = float(os.environ.get("SKIP_FRESH_HOURS", "24"))
UNIVERSE_SIZE = int(os.environ.get("UNIVERSE_SIZE", "0"))  # 0 = entire company_tickers map
MIN_FACTS_BYTES = int(os.environ.get("MIN_FACTS_BYTES", "5000"))
FORCE_TICKERS_REFRESH = os.environ.get("FORCE_TICKERS_REFRESH", "").lower() in (
    "1", "true", "yes", "on",
)

# Priority seed: fetched first among MISSING (not a hard queue limit)
PRIORITY_TICKERS = [
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
        except FileNotFoundError:
            raise
        except Exception as e:
            last = e
            _log(f"WARN attempt {attempt}/{MAX_RETRIES}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(1.0 * attempt)
    assert last is not None
    raise last


def load_company_tickers(session) -> dict:
    if (
        not FORCE_TICKERS_REFRESH
        and TICKERS_PATH.exists()
        and TICKERS_PATH.stat().st_size > 10_000
    ):
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
    """TICKER -> {cik, title}. SEC order is roughly larger/more active first."""
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
        # first wins (keep SEC order / first occurrence)
        if t in out:
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


def cached_symbols() -> set[str]:
    return {
        p.stem
        for p in DATA_DIR.glob("*.json")
        if p.name not in ("index.json", "company_tickers.json")
    }


def is_fresh(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < MIN_FACTS_BYTES:
        return False
    age_h = (_now().timestamp() - path.stat().st_mtime) / 3600.0
    return age_h < SKIP_FRESH_HOURS


def file_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def build_work_queue(tmap: dict[str, dict]) -> tuple[list[str], int, int, int]:
    """
    Coverage-first queue (options-desk style):
      missing (priority seed first, then rest of universe) + stale (oldest first).
    Returns (queue, n_missing, n_stale, n_fresh).
    """
    existing = cached_symbols()
    universe = list(tmap.keys())
    if UNIVERSE_SIZE > 0:
        universe = universe[:UNIVERSE_SIZE]

    missing = [s for s in universe if s not in existing]
    # Priority seed first among missing
    prio = [s for s in PRIORITY_TICKERS if s in set(missing)]
    rest_missing = [s for s in missing if s not in set(prio)]
    missing_ordered = prio + rest_missing

    stale: list[tuple[float, str]] = []
    fresh = 0
    for s in existing:
        path = DATA_DIR / f"{s}.json"
        if is_fresh(path):
            fresh += 1
        else:
            stale.append((file_mtime(path), s))
    stale.sort(key=lambda x: x[0])  # oldest first
    stale_syms = [s for _, s in stale]

    queue = missing_ordered + stale_syms
    _log(
        f"queue plan: universe={len(universe)} missing={len(missing_ordered)} "
        f"(priority={len(prio)}) stale={len(stale_syms)} fresh_skipped={fresh} "
        f"total_queued={len(queue)} MAX_FETCHES={MAX_FETCHES}"
    )
    if not missing_ordered and stale_syms:
        _log("coverage complete for current universe — refreshing oldest caches")
    return queue, len(missing_ordered), len(stale_syms), fresh


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
    text = json.dumps(payload, separators=(",", ":"))
    if len(text.encode("utf-8")) < MIN_FACTS_BYTES:
        raise ValueError(
            f"payload too small ({len(text)} B < MIN_FACTS_BYTES={MIN_FACTS_BYTES}); "
            "likely empty/non-operating entity"
        )
    # Keep every usable SEC taxonomy. Most issuers use us-gaap or ifrs-full,
    # but valid companyfacts may also contain other/custom taxonomies.
    fobj = payload.get("facts") or {}
    usable = isinstance(fobj, dict) and any(
        isinstance(taxonomy, dict)
        and any(
            isinstance(fact, dict)
            and isinstance(fact.get("units"), dict)
            and any(isinstance(rows, list) and rows for rows in fact["units"].values())
            for fact in taxonomy.values()
        )
        for taxonomy in fobj.values()
    )
    if not usable:
        present = list(fobj.keys())[:12] if isinstance(fobj, dict) else []
        raise ValueError(f"no usable companyfacts taxonomies (present: {present})")
    path.write_text(text, encoding="utf-8")
    return path


def _normalize_files_list(raw) -> list[str]:
    """Accept legacy {TICKER: updatedISO} maps or plain ticker lists."""
    if isinstance(raw, dict):
        return sorted(str(k) for k in raw.keys() if k and k != "company_tickers.json")
    if isinstance(raw, list):
        return sorted({str(x) for x in raw if x and str(x) != "company_tickers.json"})
    return []


def rebuild_index(names: dict[str, str]) -> bool:
    """Rewrite data/index.json only when the ticker set / names / skiplist change.

    Shape (no timestamps): { files: [TICKER, ...], count, names, no_options? }.
    Freshness for the fetcher uses filesystem mtime (see is_fresh / file_mtime),
    so we deliberately do NOT store per-ticker `updated` or a global `generated`
    stamp — those only churned git commits when no data content changed.
    Returns True if the file was written.
    """
    tickers: list[str] = []
    for p in sorted(DATA_DIR.glob("*.json")):
        if p.name in ("index.json", "company_tickers.json"):
            continue
        tickers.append(p.stem)
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
            if doc.get("title"):
                names[p.stem] = doc["title"]
        except Exception:
            pass

    prev: dict = {}
    prev_no_options: dict = {}
    if INDEX_PATH.exists():
        try:
            prev = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
            if not isinstance(prev, dict):
                prev = {}
            prev_no_options = prev.get("no_options") or {}
            for k, v in (prev.get("names") or {}).items():
                names.setdefault(k, v)
        except Exception:
            prev = {}

    files = sorted(tickers)
    names_sorted = dict(sorted(names.items()))
    index = {
        "files": files,
        "count": len(files),
        "names": names_sorted,
        "no_options": prev_no_options,
    }

    prev_normalized = {
        "files": _normalize_files_list(prev.get("files")),
        "count": len(_normalize_files_list(prev.get("files"))),
        "names": dict(sorted((prev.get("names") or {}).items())) if isinstance(prev.get("names"), dict) else {},
        "no_options": prev_no_options if isinstance(prev_no_options, dict) else {},
    }
    # Also rewrite once when migrating off legacy timestamp fields.
    legacy = "generated" in prev or isinstance(prev.get("files"), dict)
    if prev_normalized == index and not legacy:
        _log(f"index: unchanged ({len(files)} ticker caches) — skip rewrite")
        return False

    INDEX_PATH.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    _log(f"index: wrote {INDEX_PATH} ({index['count']} ticker caches)")
    return True


def resolve_meta(tmap: dict[str, dict], sym: str) -> tuple[str, dict] | None:
    meta = tmap.get(sym)
    if meta:
        return sym, meta
    alt = sym.replace(".", "-") if "." in sym else sym.replace("-", ".")
    meta = tmap.get(alt)
    if meta:
        return alt, meta
    return None


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
        n_missing = n_stale = n_fresh = 0
        _log(f"queue: {len(queue)} from TICKERS env (explicit; ignores coverage queue)")
    else:
        queue, n_missing, n_stale, n_fresh = build_work_queue(tmap)

    names: dict[str, str] = {}
    fetched = skipped = failed = 0

    for i, sym in enumerate(queue, start=1):
        if fetched >= MAX_FETCHES:
            _log(
                f"STOP: reached MAX_FETCHES={MAX_FETCHES} successful writes "
                f"(queue remaining={len(queue) - i + 1}; re-run to continue coverage)"
            )
            break

        resolved = resolve_meta(tmap, sym)
        if not resolved:
            _log(f"SKIP [{i}/{len(queue)}] {sym}: not in company_tickers")
            failed += 1
            continue
        sym, meta = resolved
        path = DATA_DIR / f"{sym}.json"

        # Explicit TICKERS still honor freshness unless SKIP_FRESH_HOURS=0
        if is_fresh(path):
            _log(f"FRESH [{i}/{len(queue)}] {sym}: skip (<{SKIP_FRESH_HOURS}h)")
            skipped += 1
            names[sym] = meta.get("title") or sym
            continue

        cik = meta["cik"]
        url = SEC_FACTS_URL.format(cik=cik)
        phase = "coverage" if not path.exists() else "refresh"
        _log(f"FETCH [{i}/{len(queue)}] {phase} {sym} CIK{cik} (writes={fetched}/{MAX_FETCHES})")
        try:
            if REQUEST_SLEEP > 0:
                time.sleep(REQUEST_SLEEP)
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

    # Keep names for fresh-skipped files too
    for s in cached_symbols():
        if s not in names:
            try:
                doc = json.loads((DATA_DIR / f"{s}.json").read_text(encoding="utf-8"))
                names[s] = doc.get("title") or s
            except Exception:
                names[s] = s

    rebuild_index(names)
    _log(
        f"DONE: fetched={fetched} skipped_fresh={skipped} failed={failed} "
        f"cached_total={len(cached_symbols())} map={len(tmap)}"
    )
    if not override and n_missing:
        still_missing = n_missing - fetched  # rough
        if still_missing > 0 and fetched >= MAX_FETCHES:
            _log(
                f"HINT: coverage incomplete — re-run with MAX_FETCHES={MAX_FETCHES} "
                f"(or higher) to continue downloading missing tickers"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
