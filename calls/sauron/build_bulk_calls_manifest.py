#!/usr/bin/env python3
"""Build calls.json with N stubs covering all scenario × outcome pairs evenly."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

SCENARIOS = [
    "RUSH_JOB",
    "SPEC_SUBSTITUTION",
    "FREIGHT_CONSTRAINED",
    "FIRST_TIME_BUYER",
    "PRICE_PUSHBACK",
    "STOCK_CHECK",
    "MULTI_LINE_JOB_QUOTE",
    "ADD_ON_REORDER",
]
OUTCOMES = [
    "VERBAL_COMMIT",
    "QUOTE_FOLLOWUP",
    "CALLBACK_SCHEDULED",
    "NURTURE_STALL",
    "NOT_A_FIT",
]


def seed_str(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--total",
        type=int,
        default=2000,
        help="Total calls (default 2000). Must be divisible by len(SCENARIOS)*len(OUTCOMES) unless --flex",
    )
    parser.add_argument(
        "--calls-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not copy existing calls.json to calls.backup_before_bulk.json",
    )
    args = parser.parse_args()

    d = args.calls_dir
    buyers_data = json.loads((d / "buyers.json").read_text(encoding="utf-8"))
    buyers = buyers_data["buyers"]
    n_buyers = len(buyers)

    pairs: list[tuple[str, str]] = [(s, o) for s in SCENARIOS for o in OUTCOMES]
    n_pairs = len(pairs)  # 40
    if args.total % n_pairs != 0:
        raise SystemExit(f"--total {args.total} must be divisible by {n_pairs} (scenario×outcome pairs)")
    n_layers = args.total // n_pairs

    calls_path = d / "calls.json"
    if calls_path.is_file() and not args.no_backup:
        bak = d / "calls.backup_before_bulk.json"
        shutil.copy2(calls_path, bak)
        print(f"Backed up existing calls to {bak}")

    base = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    calls: list[dict] = []

    for layer in range(n_layers):
        for pi, (scenario, outcome) in enumerate(pairs):
            i = layer * n_pairs + pi
            seq = i + 1
            b = buyers[(i * 17 + layer * 3 + pi) % n_buyers]
            bid = b["buyer_id"]
            pids = b["product_ids"]
            tier = b.get("annual_volume_tier", "M")
            terms_tone = b.get("terms_tone", "established_open_account")
            call_id = f"call_russin_{seq:05d}"
            calls.append({
                "call_id": call_id,
                "schema_version": "1.0",
                "created_at": base,
                "updated_at": base,
                "supplier": {
                    "name": "Russin Lumber",
                    "party_type": "seller",
                    "default_rep_role": "inside_sales",
                },
                "buyer_id": bid,
                "customer": {
                    "company_name": b["company_name"],
                    "contact_name": b["default_contact"]["full_name"],
                },
                "channel": "phone",
                "language": "en-US",
                "scenario_tag": scenario,
                "outcome_target": outcome,
                "primary_product_ids": pids[: min(8, len(pids))],
                "metadata": {
                    "generation_seed": seed_str(call_id, bid, scenario, outcome, str(layer)),
                    "priority": "high" if tier == "XL" else "normal",
                    "compliance_flags": [],
                    "transcript_status": "pending",
                    "target_turn_range": [18, 40],
                    "account_tier_volume": tier,
                    "terms_tone": terms_tone,
                    "coverage_layer": layer,
                    "coverage_pair_index": pi,
                },
                "transcript": None,
            })

    out = {
        "schema_version": "1.1",
        "call_count": len(calls),
        "manifest_note": (
            f"Stratified: {n_pairs} scenario×outcome pairs × {n_layers} layers = {len(calls)}. "
            f"Scenarios: {', '.join(SCENARIOS)}. Outcomes: {', '.join(OUTCOMES)}."
        ),
        "calls": calls,
    }
    calls_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(calls)} call stubs to {calls_path}")
    print(
        "Next: python3 generate_transcripts.py --concurrency 25 --strict-qc",
    )


if __name__ == "__main__":
    main()
