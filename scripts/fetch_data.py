#!/usr/bin/env python3
"""
Fundamentals — build-time pre-fetch for GitHub Pages (static cache)
Modeled exactly after options-desk/scripts/fetch_data.py style.

Fetches company_tickers.json from SEC (for static use in the app).

RUN (with uv or pip):
  python scripts/fetch_data.py
  or via GitHub Action (update-data.yml)

OUTPUT:
  data/company_tickers.json
  data/index.json   (manifest)
"""

import json
import os
import sys
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
INDEX_PATH = os.path.join(DATA_DIR, "index.json")

UA = "fundamentals-demo contact@daggerok.github.io"

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

def _log(msg):
    print(f"[{_now_iso()}] {msg}", flush=True)

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    import requests
    headers = {"User-Agent": UA, "Accept": "application/json"}

    _log("Fetching company_tickers.json from SEC...")
    r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=headers, timeout=30)
    r.raise_for_status()
    tickers = r.json()

    tickers_path = os.path.join(DATA_DIR, "company_tickers.json")
    with open(tickers_path, "w") as f:
        json.dump(tickers, f, separators=(",", ":"))
    _log(f"Wrote {tickers_path} ({len(tickers)} entries)")

    # Minimal index.json for consistency with options-desk pattern
    index = {
        "files": {"company_tickers.json": _now_iso()},
        "count": len(tickers),
        "generated": _now_iso(),
        "names": {},
        "no_options": {},
    }
    with open(INDEX_PATH, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    _log(f"Wrote {INDEX_PATH}")

    _log("DONE: fundamentals data pre-fetch complete")

if __name__ == "__main__":
    main()
