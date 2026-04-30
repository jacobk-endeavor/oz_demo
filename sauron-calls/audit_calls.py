#!/usr/bin/env python3
"""Scan calls.json transcripts with transcript_qc rules. Exit 1 if any fail."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from transcript_qc import transcript_violations, transcript_violations_strict  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Also run transcript_violations_strict (needs metadata.contact_name, russin_rep, etc.).",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="Flag calls with missing/empty transcripts as failures.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    data = json.loads((root / "calls.json").read_text(encoding="utf-8"))
    bad: list[tuple[str, list[str]]] = []

    for c in data["calls"]:
        t = (c.get("transcript") or "").strip()
        if not t:
            if args.require_all:
                bad.append((c["call_id"], ["missing or empty transcript"]))
            continue
        v = transcript_violations(t)
        if not v and args.strict:
            cust = c.get("customer") or {}
            md = c.get("metadata") or {}
            v = transcript_violations_strict(
                t,
                russin_rep=(md.get("russin_rep") or ""),
                buyer_full_name=(cust.get("contact_name") or ""),
                company_name=(cust.get("company_name") or ""),
                terms_tone=md.get("terms_tone"),
            )
        if v:
            bad.append((c["call_id"], v))

    if not bad:
        scope = "baseline" + (" + strict" if args.strict else "")
        print(f"All evaluated transcripts passed QC ({scope}).")
        sys.exit(0)
    print(f"{len(bad)} call(s) failed QC:", file=sys.stderr)
    for cid, v in bad[:50]:
        print(f"  {cid}: {v}", file=sys.stderr)
    if len(bad) > 50:
        print(f"  … and {len(bad) - 50} more", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
