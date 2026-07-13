#!/usr/bin/env python3
# =============================================================================
# Fundamentals — build-time SEC company_tickers pre-fetch (static cache)
# -----------------------------------------------------------------------------
# INFRASTRUCTURE (not part of the 3-file app source: index.html / index.css / main.tsx).
# Modeled after options-desk/scripts/fetch_data.py + uv workflow.
#
# RUN (uv recommended, same as options-desk):
#   uv run python scripts/fetch_data.py
#   # or:
#   uv run --with requests python scripts/fetch_data.py
#   # optional override:
#   SEC_USER_AGENT="Your Name you@example.com" uv run python scripts/fetch_data.py
#
# OUTPUT:
#   data/company_tickers.json
#   data/index.json   (manifest: files / count / generated / names / no_options)
#
# SEC requires a descriptive User-Agent with a contact email, otherwise 403:
#   https://www.sec.gov/os/webmaster-faq#code-support
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

# SEC rejects generic/bot-like UAs (403). Prefer real name + email contact.
# Override anytime: SEC_USER_AGENT="Jane Doe jane@example.com"
DEFAULT_UA = "Maksim Kostromin daggerok@gmail.com"
UA = os.environ.get("SEC_USER_AGENT", DEFAULT_UA).strip() or DEFAULT_UA

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
MAX_RETRIES = 3
RETRY_SLEEP_SEC = 1.5


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def fetch_company_tickers(session) -> dict:
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        _log(f"GET {SEC_TICKERS_URL} (attempt {attempt}/{MAX_RETRIES}, UA={UA!r})")
        try:
            r = session.get(SEC_TICKERS_URL, headers=_headers(), timeout=60)
            if r.status_code == 403:
                snippet = (r.text or "")[:200].replace("\n", " ")
                raise RuntimeError(
                    "SEC returned 403 Forbidden. Their fair-access policy requires a "
                    "descriptive User-Agent with a real contact email, e.g.\n"
                    '  SEC_USER_AGENT="Your Name you@example.com" uv run python scripts/fetch_data.py\n'
                    f"Current UA: {UA!r}\n"
                    f"Body: {snippet}"
                )
            r.raise_for_status()
            data = r.json()
            if not isinstance(data, dict):
                raise TypeError(f"unexpected payload type {type(data)}")
            return data
        except Exception as e:
            last_err = e
            _log(f"WARN: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_SLEEP_SEC * attempt)
    assert last_err is not None
    raise last_err


def main() -> int:
    try:
        import requests
    except ImportError:
        _log("ERROR: requests is required. Run via: uv run python scripts/fetch_data.py")
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    try:
        with requests.Session() as session:
            tickers = fetch_company_tickers(session)
    except Exception as e:
        _log(f"ERROR: failed to fetch company_tickers.json: {e}")
        return 1

    TICKERS_PATH.write_text(json.dumps(tickers, separators=(",", ":")), encoding="utf-8")
    _log(f"Wrote {TICKERS_PATH} ({len(tickers)} entries)")

    # Preserve names/no_options if previous index exists
    prev_names: dict = {}
    prev_no_options: dict = {}
    if INDEX_PATH.exists():
        try:
            prev = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
            prev_names = prev.get("names") or {}
            prev_no_options = prev.get("no_options") or {}
        except Exception:
            pass

    index = {
        "files": {"company_tickers.json": _now_iso()},
        "count": len(tickers),
        "generated": _now_iso(),
        "names": prev_names,
        "no_options": prev_no_options,
    }
    INDEX_PATH.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    _log(f"Wrote {INDEX_PATH}")
    _log("DONE: fundamentals data pre-fetch complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
