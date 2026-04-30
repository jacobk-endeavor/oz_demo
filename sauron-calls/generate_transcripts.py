#!/usr/bin/env python3
"""Generate synthetic Russin Lumber sales transcripts from calls.json using OpenRouter."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import random
import shutil
import sys
import time
from pathlib import Path

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from identities import (  # noqa: E402
    russin_rep_for_call_index,
    terms_voice_for_tone,
)
from transcript_qc import transcript_violations, transcript_violations_strict  # noqa: E402

BASE_URL = "https://openrouter.ai/api/v1"

# Product keys sent in prompts (omit catalog_spec and other heavy catalog fields).
_PROMPT_PRODUCT_KEYS = (
    "product_id",
    "short_name",
    "category",
    "typical_unit",
    "description",
    "lead_time_days",
    "certifications_common",
    "substitution_notes",
)


def product_prompt_slice(p: dict) -> dict:
    return {k: p[k] for k in _PROMPT_PRODUCT_KEYS if k in p}


SYSTEM_PROMPT = """You write realistic B2B wholesale lumber and building-materials phone sales calls.

Roles:
- Russin: Russin Lumber inside sales / account manager. They MUST identify themselves only by the first name given as RUSSIN_REP_FIRST_NAME in the user task (one of: Jacob, Sami, Ryan, Joanna). Do not invent a different Russin rep name.
- Buyer: Purchasing contact at the customer. They MUST introduce themselves with the exact BUYER_CONTACT_FULL_NAME from CUSTOMER_JSON the first time (full name). After that, first name alone is fine.

Hard bans (violations make the transcript unusable):
- No square brackets anywhere in dialogue (no [Your Name], [Buyer Name], stage directions, etc.).
- No "Contact-" plus hex/adjacent codes. No internal-looking IDs in speech.
- No snake_case codes (buyer_id, etc.) or words "synthetic" / "CRM" in dialogue.
- Russin must not greet with "Is this Contact-…?" or similar—use normal names and company only.

Line format (strict):
- Every non-empty dialogue line MUST start with exactly "Russin:" or "Buyer:" (those exact prefixes, capital R and B). Never use the rep's first name or any other word as the prefix.
- The Russin employee's words appear only after "Russin:". They should introduce themselves in the first Russin line as something like "Russin Lumber, this is {RUSSIN_REP_FIRST_NAME}" — matching RUSSIN_REP_FIRST_NAME from the task.
- The customer's words appear only after "Buyer:". The buyer gives their own name and company on a Buyer: line (using BUYER_CONTACT_FULL_NAME from the task the first time).

If line format is wrong, the output is invalid.

Length and products:
- Roughly 18–40 dialogue lines when plausible; shorter OK for a quick stock check.
- Reference at least 2–3 products using ONLY short_name strings from PRODUCTS_JSON.
- Realistic grades, dimensions, BF/LF/units, truck/LTL, substitution talk; no invented exact dollar amounts.

Payment / terms:
- Follow TERMS_VOICE in the user task. Do not casually grant NET 30 or unlimited credit on the phone. Prefer "quote and account file govern," and mention credit review when TERMS_VOICE says to.

Outcome must match OUTCOME in the task. Return ONLY valid JSON per schema. No markdown fences."""

MAX_RETRIES = 4
BACKOFF = (1, 2, 4, 8)


def load_dotenv(path: Path) -> None:
    """Populate os.environ from a simple KEY=VALUE file. Does not override existing vars."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        os.environ[key] = val


def openrouter_api_key() -> str:
    """Accept OPENROUTER_API_KEY or openrouter_api_key from env / .env."""
    for name in ("OPENROUTER_API_KEY", "openrouter_api_key"):
        v = os.environ.get(name, "").strip()
        if v:
            return v
    return ""


def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def post_chat(
    client: httpx.Client,
    model: str,
    messages: list[dict[str, str]],
    *,
    max_tokens: int = 4096,
) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.75,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    last_err: Exception | None = None
    for attempt, wait in enumerate(BACKOFF):
        try:
            r = client.post("/chat/completions", json=payload)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = e
            if attempt < len(BACKOFF) - 1:
                time.sleep(wait)
    raise last_err  # type: ignore[misc]


async def post_chat_async(
    client: httpx.AsyncClient,
    model: str,
    messages: list[dict[str, str]],
    *,
    max_tokens: int = 4096,
) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.75,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    last_err: Exception | None = None
    for attempt, wait in enumerate(BACKOFF):
        try:
            r = await client.post("/chat/completions", json=payload)
            if r.status_code in (429, 500, 502, 503, 504):
                await asyncio.sleep(float(wait))
                continue
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = e
            if attempt < len(BACKOFF) - 1:
                await asyncio.sleep(float(wait))
    raise last_err  # type: ignore[misc]


def _call_seq_index(call: dict) -> int:
    return int(call["call_id"].rsplit("_", 1)[-1]) - 1


def buyer_voice_payload(buyer: dict) -> dict:
    dc = buyer["default_contact"]
    full = (dc.get("full_name") or f"{dc.get('given_name', '').strip()} {dc.get('family_name', '').strip()}").strip()
    tone = buyer.get("terms_tone", "established_open_account")
    voice = buyer.get("terms_voice") or terms_voice_for_tone(tone)
    return {
        "company_name": buyer["company_name"],
        "customer_type": buyer["customer_type"],
        "ship_to": buyer["ship_to"],
        "buyer_contact_full_name": full,
        "buyer_contact_title": dc.get("title", "Purchasing"),
        "terms_tone": tone,
        "terms_voice": voice,
    }


def build_user_task(call: dict, buyer: dict, products_subset: list[dict], russin_rep_first: str) -> str:
    voice = buyer_voice_payload(buyer)
    return f"""TASK: Generate one complete sales-call transcript.

SEED: {call["metadata"]["generation_seed"]}
RUSSIN_REP_FIRST_NAME: {russin_rep_first}  (Russin MUST use only this first name when giving their name)
BUYER_CONTACT_FULL_NAME: {voice["buyer_contact_full_name"]}  (Buyer MUST use this exact full name on first introduction)
OUTCOME (conversational end state — must match this): {call["outcome_target"]}
SCENARIO_TAG: {call["scenario_tag"]}
TERMS_VOICE:
{voice["terms_voice"]}

CUSTOMER_JSON:
{json.dumps(voice, indent=2)}

PRODUCTS_JSON (only reference these product short_names):
{json.dumps([product_prompt_slice(p) for p in products_subset], indent=2)}

Respond with JSON exactly in this shape:
{{
  "transcript": "<multi-line string, Russin: ... and Buyer: ... lines>",
  "summary_one_line": "<string>",
  "products_mentioned": ["<short_name from PRODUCTS_JSON>", "..."],
  "outcome": "<must equal OUTCOME string exactly>",
  "scenario_tag": "<must equal SCENARIO_TAG exactly>",
  "buyer_company": "<company name>"
}}
"""


def find_buyer(buyers: list[dict], buyer_id: str) -> dict:
    for b in buyers:
        if b["buyer_id"] == buyer_id:
            return b
    raise KeyError(buyer_id)


def products_for_buyer(products: list[dict], product_ids: list[str]) -> list[dict]:
    by_id = {p["product_id"]: p for p in products}
    return [by_id[pid] for pid in product_ids if pid in by_id]


def _rng(seed_hex: str) -> random.Random:
    h = hashlib.sha256(seed_hex.encode()).digest()
    return random.Random(int.from_bytes(h[:8], "big"))


def generate_offline(call: dict, buyer: dict, product_rows: list[dict]) -> dict:
    """Template-based transcript when no LLM API is available (seed-stable, scenario-aware)."""
    rng = _rng(call["metadata"]["generation_seed"])
    rep = russin_rep_for_call_index(_call_seq_index(call))
    names = [p["short_name"] for p in product_rows]
    if len(names) < 2:
        picks = names * 3
    else:
        picks = rng.sample(names, min(4, len(names))) + [rng.choice(names), rng.choice(names)]
    a, b, c = picks[0], picks[1], picks[2]
    city = buyer["ship_to"]["city"]
    co = buyer["company_name"]
    ctype = buyer["customer_type"].replace("_", " ")
    scenario = call["scenario_tag"]
    outcome = call["outcome_target"]
    dc = buyer["default_contact"]
    full = (dc.get("full_name") or f"{dc.get('given_name', '')} {dc.get('family_name', '')}").strip()
    tone = buyer.get("terms_tone", "established_open_account")

    scenario_note = {
        "RUSH_JOB": "We get it—crews are burning daylight on this.",
        "SPEC_SUBSTITUTION": "If the spec cedar is tight I need a clean sub letter.",
        "FREIGHT_CONSTRAINED": "Dock space is a mess—might need a drop trailer.",
        "FIRST_TIME_BUYER": "If anything's new on the account, credit may want it in writing—that's normal.",
        "PRICE_PUSHBACK": "I know everyone's shopping it—I'll keep it honest.",
        "STOCK_CHECK": "Just need a quick reality check on hand.",
        "MULTI_LINE_JOB_QUOTE": "It's a package deal—several lines on one job.",
        "ADD_ON_REORDER": "Small add-on from what you shipped last month.",
    }.get(scenario, "")

    closure = {
        "VERBAL_COMMIT": (
            "Russin: Okay, I'll book the material on verbal—I'll shoot the confirmation with totals.\n"
            "Buyer: Yeah, go ahead—send the confirmation and we'll release.\n"
            "Russin: You're set—thanks for the order."
        ),
        "QUOTE_FOLLOWUP": (
            "Russin: I'll email the formal quote with line items and freight—should be within the hour.\n"
            "Buyer: Perfect—I'll run it past the estimator and reply same day if it tracks.\n"
            "Russin: Sounds good—ping me if anything looks off."
        ),
        "CALLBACK_SCHEDULED": (
            "Russin: Want me to call you tomorrow mid-morning with mill feedback?\n"
            "Buyer: Ten thirty works—I've got the cut list finalized by then.\n"
            "Russin: I'll put you on my calendar."
        ),
        "NURTURE_STALL": (
            "Buyer: Let me talk to the owner—we're not dead, just slow rolling the schedule.\n"
            "Russin: No problem—I'll keep the numbers warm a few days.\n"
            "Buyer: Appreciate it—I'll reach back when we know more."
        ),
        "NOT_A_FIT": (
            "Buyer: I think we're going to park this—our incumbent's already stocking the mix.\n"
            "Russin: Fair enough—if the job changes or lead times blow out, call us.\n"
            "Buyer: Will do—thanks for the time."
        ),
    }[outcome]

    if tone == "needs_written_confirmation":
        terms_block = [
            "Buyer: Make sure terms match what we can sign—purchasing will want it on the quote.",
            "Russin: Agreed—the written quote and your file are what count. If credit sees anything off-pattern they'll reach out; I'm not promising terms over the phone.",
        ]
    else:
        terms_block = [
            "Buyer: Same rhythm as our usual account unless something flags.",
            "Russin: Right—I'll still put it on paper so everyone's clear; nothing verbal that outruns the quote.",
        ]

    first = full.split()[0] if full else "there"
    lines: list[str] = [
        f"Russin: Russin Lumber, this is {rep}—who do I have?",
        f"Buyer: {full} with {co} in {city}.",
        f"Russin: Hey {first}—what are we chasing today?",
        f"Buyer: Need to line up some {a} and probably touch {b}—maybe {c} depending on tally.",
        f"Russin: Got it. Will-call or delivery into {city}?",
        f"Buyer: {rng.choice(['Deliver to the yard in ' + city + '.', 'We will flatbed it—will-call works.', 'Jobsite drop if you can coordinate.'])}",
        f"Russin: Quantities—rough board feet or piece count?",
        f"Buyer: {rng.choice(['Ballpark twenty bundles on the dimension side.', 'Still firming—think a truck and a half.', 'Smaller patch job—few units to get us through the week.'])}",
        f"Russin: Timeline?",
        f"Buyer: {rng.choice(['Looking at next Friday if inventory cooperates.', 'Hot—need something moving this week.', 'Flexible two weeks out.'])}",
        f"Russin: Grade call—standard stocking or specs on the prints?",
        f"Buyer: {rng.choice(['What you run for #2 is fine unless you see split.', 'Prints say clear-ish appearance—call me if you need to deviate.'])}",
    ]
    if scenario_note:
        lines.append(f"Russin: {scenario_note}")
    lines.extend(
        [
            "Russin: Let me check live inventory—hang on… yeah, we can work with that mix or close.",
            f"Buyer: What about {b}—still long lead or moving?",
            "Russin: Not terrible—I'd quote a range subject to mill list, nothing crazy on paper until I confirm.",
            "Buyer: Freight and offload—fork on site?",
            "Russin: We can set delivery with liftgate or yard offload—you tell me what's easier for your crew.",
        ]
    )
    lines.extend(terms_block)
    lines.extend(closure.split("\n"))
    transcript = "\n".join(lines)
    summary = f"{co} ({ctype}) — {scenario}: {a}/{b}, outcome {outcome}."
    return {
        "transcript": transcript,
        "summary_one_line": summary,
        "products_mentioned": [a, b, c],
        "outcome": outcome,
        "scenario_tag": scenario,
        "buyer_company": co,
    }


def _clear_call_for_regenerate(c: dict) -> None:
    c["transcript"] = None
    md = c["metadata"]
    md["transcript_status"] = "pending"
    md.pop("model", None)
    md.pop("llm_summary_one_line", None)
    md.pop("products_mentioned", None)
    md.pop("russin_rep", None)
    md.pop("qc_warnings", None)


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    load_dotenv(script_dir / ".env")

    parser = argparse.ArgumentParser()
    parser.add_argument("--calls-dir", type=Path, default=script_dir)
    parser.add_argument("--model", default=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini"))
    parser.add_argument("--limit", type=int, default=0, help="Max calls to generate (0 = all pending)")
    parser.add_argument("--sleep", type=float, default=0.4, help="Seconds between API requests (serial mode only)")
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        metavar="N",
        help=(
            "Parallel OpenRouter requests when N>1 (same API key). Start with 4–8; back off if you see 429s. "
            "Ignored in --offline mode."
        ),
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use local template transcripts (no OpenRouter key).",
    )
    parser.add_argument(
        "--regenerate",
        action="store_true",
        help=(
            "Clear transcripts first. With --limit N, only the first N calls (by call_id) are cleared; "
            "other calls are left unchanged. Without --limit, all calls are cleared."
        ),
    )
    parser.add_argument(
        "--no-qc",
        action="store_true",
        help="Skip transcript_qc checks and retries (debug only).",
    )
    parser.add_argument("--qc-retries", type=int, default=2, help="Extra LLM attempts after QC failure")
    parser.add_argument(
        "--strict-qc",
        action="store_true",
        help="After baseline QC passes, run stricter checks (name/company presence, line counts, NET 30 vs terms_tone).",
    )
    args = parser.parse_args()

    key = openrouter_api_key()
    use_offline = args.offline or not key
    if not key and not args.offline:
        print(
            "Note: OpenRouter key not set (OPENROUTER_API_KEY or openrouter_api_key in .env) — "
            "using offline template transcripts. Set the key for LLM-generated dialogs.",
            file=sys.stderr,
        )

    d = args.calls_dir
    catalog = load_json(d / "products.json")
    buyers_data = load_json(d / "buyers.json")
    calls_data = load_json(d / "calls.json")

    products = catalog["products"]
    buyers = buyers_data["buyers"]
    calls: list[dict] = calls_data["calls"]

    if args.regenerate:
        ordered = sorted(calls, key=lambda c: c["call_id"])
        if args.limit:
            to_clear = ordered[: args.limit]
            print(
                f"Regenerate subset: clearing {len(to_clear)} call(s) "
                f"({to_clear[0]['call_id']} … {to_clear[-1]['call_id']}); others unchanged.",
                flush=True,
            )
            for c in to_clear:
                _clear_call_for_regenerate(c)
        else:
            print("Regenerate all: clearing every call.", flush=True)
            for c in calls:
                _clear_call_for_regenerate(c)

    ordered = sorted(calls, key=lambda c: c["call_id"])
    pending = [c for c in ordered if not c.get("transcript")]
    if args.limit:
        pending = pending[: args.limit]

    if not pending:
        print("No pending calls (all have transcripts).")
        return

    backup_path = d / "calls.backup.json"
    shutil.copy2(d / "calls.json", backup_path)
    print(f"Backup: {backup_path}", flush=True)

    if use_offline:
        print("Mode: offline (template transcripts). Omit --offline and set OPENROUTER_API_KEY for LLM.", flush=True)

    generated = 0
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://local.dev/russin-transcripts",
        "X-Title": "Russin transcript generator",
    }

    client_cm = (
        httpx.Client(base_url=BASE_URL, headers=headers, timeout=httpx.Timeout(120.0))
        if not use_offline and max(1, args.concurrency) == 1
        else None
    )

    out_path = d / "calls.json"

    def save_calls() -> None:
        calls_data["call_count"] = calls_data.get("call_count", len(calls))
        out_path.write_text(json.dumps(calls_data, indent=2) + "\n", encoding="utf-8")

    def make_qc(buyer: dict, russin_rep: str):
        def qc_transcript(text: str) -> list[str]:
            if args.no_qc:
                return []
            v = transcript_violations(text)
            if v:
                return v
            if args.strict_qc:
                vo = buyer_voice_payload(buyer)
                return transcript_violations_strict(
                    text,
                    russin_rep=russin_rep,
                    buyer_full_name=vo["buyer_contact_full_name"],
                    company_name=buyer["company_name"],
                    terms_tone=buyer.get("terms_tone"),
                )
            return []

        return qc_transcript

    async def run_parallel_llm() -> int:
        n = max(1, args.concurrency)
        print(f"Parallel mode: concurrency={n} (one API key; reduce if OpenRouter returns 429).", flush=True)
        sem = asyncio.Semaphore(n)
        save_lock = asyncio.Lock()
        total = len(pending)
        ok_count = 0

        timeout = httpx.Timeout(120.0)
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=timeout) as aclient:

            async def process_one(idx: int, call: dict) -> None:
                nonlocal ok_count
                buyer = find_buyer(buyers, call["buyer_id"])
                russin_rep = russin_rep_for_call_index(_call_seq_index(call))
                qc_transcript = make_qc(buyer, russin_rep)

                async with sem:
                    print(f"[{idx+1}/{total}] {call['call_id']} …", flush=True)
                    user = build_user_task(
                        call,
                        buyer,
                        products_for_buyer(products, buyer["product_ids"]),
                        russin_rep,
                    )
                    messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user},
                    ]
                    parsed: dict | None = None
                    attempts = 1 if args.no_qc else 1 + max(0, args.qc_retries)
                    for attempt in range(attempts):
                        try:
                            raw = await post_chat_async(aclient, args.model, messages)
                        except Exception as e:
                            print(f"  {call['call_id']} HTTP error: {e}", file=sys.stderr)
                            parsed = None
                            break
                        try:
                            parsed = json.loads(raw)
                        except json.JSONDecodeError as e:
                            print(
                                f"  {call['call_id']} JSON parse error: {e}\n  Raw (truncated): {raw[:500]}…",
                                file=sys.stderr,
                            )
                            parsed = None
                            break
                        t = (parsed.get("transcript") or "").strip()
                        last_bad = qc_transcript(t)
                        if not last_bad:
                            break
                        if attempt + 1 >= attempts:
                            print(
                                f"  {call['call_id']} QC still failing after {attempts} attempt(s): {last_bad}",
                                file=sys.stderr,
                            )
                            break
                        fulln = buyer_voice_payload(buyer)["buyer_contact_full_name"]
                        messages.append({
                            "role": "user",
                            "content": (
                                f"The previous JSON failed quality checks ({'; '.join(last_bad)}). "
                                f"Reply with a completely new JSON object of the same schema. "
                                f"Every line must start with Russin: or Buyer: only. "
                                f"Russin must introduce as Russin Lumber, this is {russin_rep!r}. "
                                f"Buyer must introduce themselves with {fulln!r} on a Buyer: line. "
                                "No square brackets, no Contact- IDs, no placeholder labels."
                                + (
                                    " Strict round: include buyer name tokens and company in dialogue, "
                                    "at least 6 lines, Russin rep name inside Russin: lines, avoid casual NET 30 "
                                    "if TERMS_VOICE says written confirmation."
                                    if args.strict_qc
                                    else ""
                                )
                            ),
                        })

                    transcript = (parsed.get("transcript") or "").strip() if parsed else ""

                if not transcript:
                    return

                async with save_lock:
                    call["customer"] = {
                        "company_name": buyer["company_name"],
                        "contact_name": buyer_voice_payload(buyer)["buyer_contact_full_name"],
                    }
                    call["transcript"] = transcript
                    call["metadata"]["transcript_status"] = "generated"
                    call["metadata"]["model"] = args.model
                    call["metadata"]["llm_summary_one_line"] = parsed.get("summary_one_line")
                    call["metadata"]["products_mentioned"] = parsed.get("products_mentioned") or []
                    call["metadata"]["russin_rep"] = russin_rep
                    qc_issues = qc_transcript(transcript)
                    if qc_issues:
                        call["metadata"]["qc_warnings"] = qc_issues
                    else:
                        call["metadata"].pop("qc_warnings", None)
                    call["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    ok_count += 1
                    save_calls()

            await asyncio.gather(*(process_one(i, c) for i, c in enumerate(pending)))
        return ok_count

    try:
        if not use_offline and max(1, args.concurrency) > 1:
            generated = asyncio.run(run_parallel_llm())
        else:
            for i, call in enumerate(pending):
                buyer = find_buyer(buyers, call["buyer_id"])
                subset = products_for_buyer(products, buyer["product_ids"])
                print(f"[{i+1}/{len(pending)}] {call['call_id']} …", flush=True)

                russin_rep = russin_rep_for_call_index(_call_seq_index(call))
                qc_transcript = make_qc(buyer, russin_rep)

                if use_offline:
                    parsed = generate_offline(call, buyer, subset)
                else:
                    assert client_cm is not None
                    user = build_user_task(call, buyer, subset, russin_rep)
                    messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user},
                    ]
                    parsed = None
                    attempts = 1 if args.no_qc else 1 + max(0, args.qc_retries)
                    for attempt in range(attempts):
                        raw = post_chat(client_cm, args.model, messages)
                        try:
                            parsed = json.loads(raw)
                        except json.JSONDecodeError as e:
                            print(f"  JSON parse error: {e}\n  Raw (truncated): {raw[:500]}…", file=sys.stderr)
                            parsed = None
                            break
                        t = (parsed.get("transcript") or "").strip()
                        last_bad = qc_transcript(t)
                        if not last_bad:
                            break
                        if attempt + 1 >= attempts:
                            print(f"  QC still failing after {attempts} attempt(s): {last_bad}", file=sys.stderr)
                            break
                        fulln = buyer_voice_payload(buyer)["buyer_contact_full_name"]
                        messages.append({
                            "role": "user",
                            "content": (
                                f"The previous JSON failed quality checks ({'; '.join(last_bad)}). "
                                f"Reply with a completely new JSON object of the same schema. "
                                f"Every line must start with Russin: or Buyer: only. "
                                f"Russin must introduce as Russin Lumber, this is {russin_rep!r}. "
                                f"Buyer must introduce themselves with {fulln!r} on a Buyer: line. "
                                "No square brackets, no Contact- IDs, no placeholder labels."
                                + (
                                    " Strict round: include buyer name tokens and company in dialogue, "
                                    "at least 6 lines, Russin rep name inside Russin: lines, avoid casual NET 30 "
                                    "if TERMS_VOICE says written confirmation."
                                    if args.strict_qc
                                    else ""
                                )
                            ),
                        })
                    if parsed is None:
                        continue

                transcript = (parsed.get("transcript") or "").strip()
                if not transcript:
                    print("  Empty transcript, skip", file=sys.stderr)
                    continue

                call["customer"] = {
                    "company_name": buyer["company_name"],
                    "contact_name": buyer_voice_payload(buyer)["buyer_contact_full_name"],
                }
                call["transcript"] = transcript
                call["metadata"]["transcript_status"] = "generated"
                call["metadata"]["model"] = "offline_template_v1" if use_offline else args.model
                call["metadata"]["llm_summary_one_line"] = parsed.get("summary_one_line")
                call["metadata"]["products_mentioned"] = parsed.get("products_mentioned") or []
                call["metadata"]["russin_rep"] = russin_rep
                qc_issues = qc_transcript(transcript)
                if qc_issues:
                    call["metadata"]["qc_warnings"] = qc_issues
                else:
                    call["metadata"].pop("qc_warnings", None)
                call["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                generated += 1
                save_calls()
                if not use_offline:
                    time.sleep(args.sleep)
    finally:
        if client_cm is not None:
            client_cm.close()

    print(f"Done. Generated {generated} transcript(s). Wrote {out_path}")


if __name__ == "__main__":
    main()
