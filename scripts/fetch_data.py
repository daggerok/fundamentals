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
#
# OUTPUT:
#   data/company_tickers.json
#   data/index.json   (manifest: files / count / generated / names / no_options)
# =============================================================================

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
INDEX_PATH = DATA_DIR / "index.json"
TICKERS_PATH = DATA_DIR / "company_tickers.json"

UA = "fundamentals-demo contact@daggerok.github.io"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log(msg: str) -> None:
    print(f"[{_now_iso()}] {msg}", flush=True)


def main() -> int:
    try:
        import requests
    except ImportError:
        _log("ERROR: requests is required. Run via: uv run python scripts/fetch_data.py")
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": UA, "Accept": "application/json"}

    _log(f"Fetching company_tickers.json from SEC… {SEC_TICKERS_URL}")
    r = requests.get(SEC_TICKERS_URL, headers=headers, timeout=60)
    r.raise_for_status()
    tickers = r.json()
    if not isinstance(tickers, dict):
        _log(f"ERROR: unexpected payload type {type(tickers)}")
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
