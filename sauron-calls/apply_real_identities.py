#!/usr/bin/env python3
"""Replace synthetic Contact-* IDs with realistic buyer names; sync calls.json customer blocks."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Run from repo: python calls/apply_real_identities.py
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from identities import (
    buyer_contact_at_index,
    terms_tone_for_buyer,
    terms_voice_for_tone,
)


def main() -> None:
    root = Path(__file__).resolve().parent
    buyers_path = root / "buyers.json"
    calls_path = root / "calls.json"

    data = json.loads(buyers_path.read_text(encoding="utf-8"))
    buyers = data["buyers"]

    for i, b in enumerate(buyers):
        g, f, full = buyer_contact_at_index(i)
        dc = b["default_contact"]
        dc["given_name"] = g
        dc["family_name"] = f
        dc["full_name"] = full
        dc.pop("synthetic_name", None)
        tier = b.get("annual_volume_tier", "M")
        b["terms_tone"] = terms_tone_for_buyer(tier, i)
        b["terms_voice"] = terms_voice_for_tone(b["terms_tone"])
        b["payment_terms_typical"] = "Per quote and approved account file"

    buyers_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    cmap = {b["buyer_id"]: b["default_contact"]["full_name"] for b in buyers}
    tones = {b["buyer_id"]: b["terms_tone"] for b in buyers}

    calls_data = json.loads(calls_path.read_text(encoding="utf-8"))
    for c in calls_data["calls"]:
        bid = c["buyer_id"]
        cust = c["customer"]
        cust["contact_name"] = cmap[bid]
        cust.pop("contact_synthetic", None)
        c.setdefault("metadata", {})["terms_tone"] = tones[bid]

    calls_path.write_text(json.dumps(calls_data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {len(buyers)} buyers and {len(calls_data['calls'])} calls.")


if __name__ == "__main__":
    main()
