#!/usr/bin/env python3
"""
Two-part pipeline:

Part 1 — strip `calls.json` to transcripts-only (`call_id`, `transcript`).
Part 2 — LLM reconstructs structured fields using `products.json`, compares to
gold labels from the original file on N calls, and runs an LLM-as-judge pass.

Loads `calls/sauron/.env` (does not override existing env vars). Uses OpenRouter via the
OpenAI-compatible API (`OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`,
`OPENROUTER_JUDGE_MODEL`). Summary-vs-gold comparison uses embeddings:
`OPENROUTER_EMBEDDING_MODEL` (default openai/text-embedding-3-small) and
`OPENROUTER_SUMMARY_SIM_THRESHOLD` (default 0.78).

Examples:
  python rebuild_call_metadata_pipeline.py strip \\
    --input ../calls.json --output ../calls_transcripts_only.json

  python rebuild_call_metadata_pipeline.py reconstruct \\
    --gold ../calls.json --minimal ../calls_transcripts_only.json \\
    --products ../products.json --sample-size 10 --seed 42 \\
    --predictions-out ../artifacts/metadata_predictions_sample.json \\
    --report-out ../artifacts/metadata_judge_report.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys
from pathlib import Path
from typing import Any

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore

SCENARIO_TAGS = [
    "RUSH_JOB",
    "SPEC_SUBSTITUTION",
    "FREIGHT_CONSTRAINED",
    "FIRST_TIME_BUYER",
    "PRICE_PUSHBACK",
    "STOCK_CHECK",
    "MULTI_LINE_JOB_QUOTE",
    "ADD_ON_REORDER",
]

OUTCOME_TARGETS = [
    "VERBAL_COMMIT",
    "QUOTE_FOLLOWUP",
    "CALLBACK_SCHEDULED",
    "NURTURE_STALL",
    "NOT_A_FIT",
]

ACCOUNT_TIERS = ["S", "M", "XL"]

# Glosses for prompts — align with synthetic dataset stratification in calls.json manifest_note.
SCENARIO_TAG_GUIDELINES: dict[str, str] = {
    "RUSH_JOB": "Expedited timing / deadline pressure; rush quotes or faster-than-normal fulfillment.",
    "SPEC_SUBSTITUTION": "Changing mills, profiles, grades, or engineered substitutions vs an existing spec.",
    "FREIGHT_CONSTRAINED": "Truck capacity, delivery windows, transit limits, or freight scheduling dominates.",
    "FIRST_TIME_BUYER": "New-account posture: approvals, credit/terms explanation, onboarding friction.",
    "PRICE_PUSHBACK": "Margin/price resistance, competitor pricing, need for sharper numbers.",
    "STOCK_CHECK": "Primarily availability / inventory / lead-time confirmation.",
    "MULTI_LINE_JOB_QUOTE": "Bundling several product lines or a broader job package in one quote.",
    "ADD_ON_REORDER": "Follow-on reorder, supplement to prior job, add-on SKUs to existing relationship.",
}

OUTCOME_TARGET_GUIDELINES: dict[str, str] = {
    "VERBAL_COMMIT": "Buyer commits verbally to proceed (order path, firm go-ahead, or explicit yes to moving forward).",
    "QUOTE_FOLLOWUP": "Call ends with quote preparation/sending; buyer waiting on written quote/terms.",
    "CALLBACK_SCHEDULED": "Concrete next touch scheduled (time/date or definite follow-up call).",
    "NURTURE_STALL": "No commitment; buyer still weighing options, timeline slips, or soft deferral.",
    "NOT_A_FIT": "Hard decline, mismatch, or clear decision not to pursue.",
}


def prompt_option_block(title: str, keys: list[str], guide: dict[str, str]) -> str:
    lines = [title]
    for k in keys:
        lines.append(f"  - {k}: {guide[k]}")
    return "\n".join(lines)


CLOSED_ENUM_REMINDER = (
    "CLOSED VOCABULARY (mandatory):\n"
    "- scenario_tag MUST be EXACTLY one token from this list — copy verbatim (same spelling, ALL_CAPS):\n"
    f"  {SCENARIO_TAGS}\n"
    "- outcome_target MUST be EXACTLY one token from this list — copy verbatim:\n"
    f"  {OUTCOME_TARGETS}\n"
    "Do not output synonyms, prose descriptions, or shortened labels for those two fields. "
    "Only one enum token each. primary_product_ids MUST use only product_id values from the catalog table above."
)


SCRIPT_DIR = Path(__file__).resolve().parent
SAURON_CALLS_ROOT = SCRIPT_DIR.parent
DEFAULT_INPUT = SAURON_CALLS_ROOT / "calls.json"

OPENROUTER_BASE_URL_DEFAULT = "https://openrouter.ai/api/v1"


def load_dotenv(path: Path) -> None:
    """Populate os.environ from a simple KEY=VALUE file (matches generate_transcripts.py)."""
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
    for name in ("OPENROUTER_API_KEY", "openrouter_api_key"):
        v = os.environ.get(name, "").strip()
        if v:
            return v
    return ""


def openrouter_client() -> Any:
    """OpenAI SDK client pointed at OpenRouter."""
    key = openrouter_api_key()
    if not key:
        return None
    referer = os.environ.get("OPENROUTER_HTTP_REFERER", "").strip()
    title = os.environ.get("OPENROUTER_APP_NAME", "calls/sauron metadata pipeline").strip()
    headers: dict[str, str] = {}
    if referer:
        headers["HTTP-Referer"] = referer
    if title:
        headers["X-Title"] = title
    base_url = os.environ.get("OPENROUTER_BASE_URL", OPENROUTER_BASE_URL_DEFAULT).strip()
    kw: dict[str, Any] = {"base_url": base_url, "api_key": key}
    if headers:
        kw["default_headers"] = headers
    return OpenAI(**kw)


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def cmd_strip(args: argparse.Namespace) -> None:
    inp = Path(args.input).resolve()
    out = Path(args.output).resolve()
    raw = load_json(inp)
    calls = raw.get("calls") or []
    minimal_calls = [{"call_id": c["call_id"], "transcript": c["transcript"]} for c in calls]
    payload = {
        "schema_version": "transcripts_only.1",
        "call_count": len(minimal_calls),
        "manifest_note": (
            "Stripped from full calls.json: only call_id and transcript are retained "
            "for metadata reconstruction experiments."
        ),
        "calls": minimal_calls,
    }
    save_json(out, payload)
    print(f"Wrote {len(minimal_calls)} calls to {out}")


def compact_product_catalog(products_doc: dict[str, Any]) -> tuple[list[str], dict[str, str]]:
    rows: list[str] = []
    id_to_short: dict[str, str] = {}
    for p in products_doc.get("products") or []:
        pid = p["product_id"]
        sn = p.get("short_name") or pid
        id_to_short[pid] = sn
        rows.append(f"{pid}\t{sn}")
    return rows, id_to_short


def extractor_json_schema(product_ids: list[str]) -> dict[str, Any]:
    pid_enum = sorted(product_ids)
    return {
        "name": "reconstructed_call_metadata",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "call_id": {"type": "string"},
                "customer": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "company_name": {"type": "string"},
                        "contact_name": {"type": "string"},
                    },
                    "required": ["company_name", "contact_name"],
                },
                "scenario_tag": {"type": "string", "enum": SCENARIO_TAGS},
                "outcome_target": {"type": "string", "enum": OUTCOME_TARGETS},
                "primary_product_ids": {
                    "type": "array",
                    "items": {"type": "string", "enum": pid_enum},
                },
                "metadata": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "account_tier_volume": {"type": "string", "enum": ACCOUNT_TIERS},
                        "llm_summary_one_line": {"type": "string"},
                        "products_mentioned": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Product short names as in catalog (e.g. CEDAR LMD).",
                        },
                        "russin_rep": {
                            "type": "string",
                            "description": "Russin rep first name only.",
                        },
                    },
                    "required": [
                        "account_tier_volume",
                        "llm_summary_one_line",
                        "products_mentioned",
                        "russin_rep",
                    ],
                },
            },
            "required": [
                "call_id",
                "customer",
                "scenario_tag",
                "outcome_target",
                "primary_product_ids",
                "metadata",
            ],
        },
        "strict": True,
    }


def judge_json_schema() -> dict[str, Any]:
    return {
        "name": "metadata_extraction_eval",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "overall_reliability_0_to_100": {"type": "integer"},
                "per_call_verdicts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "call_id": {"type": "string"},
                            "overall_call_score_0_to_100": {"type": "integer"},
                            "fields": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "path": {"type": "string"},
                                        "gold_value_json": {"type": "string"},
                                        "predicted_value_json": {"type": "string"},
                                        "alignment": {
                                            "type": "string",
                                            "enum": ["exact", "close", "partial", "wrong", "not_applicable"],
                                        },
                                        "score_0_to_100": {"type": "integer"},
                                        "rationale": {"type": "string"},
                                    },
                                    "required": [
                                        "path",
                                        "gold_value_json",
                                        "predicted_value_json",
                                        "alignment",
                                        "score_0_to_100",
                                        "rationale",
                                    ],
                                },
                            },
                        },
                        "required": ["call_id", "overall_call_score_0_to_100", "fields"],
                    },
                },
                "aggregate_notes": {"type": "string"},
                "systematic_failure_modes": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "overall_reliability_0_to_100",
                "per_call_verdicts",
                "aggregate_notes",
                "systematic_failure_modes",
            ],
        },
        "strict": True,
    }


def gold_slice(call: dict[str, Any]) -> dict[str, Any]:
    md = call.get("metadata") or {}
    return {
        "call_id": call["call_id"],
        "customer": call["customer"],
        "scenario_tag": call["scenario_tag"],
        "outcome_target": call["outcome_target"],
        "primary_product_ids": call["primary_product_ids"],
        "metadata": {
            "account_tier_volume": md.get("account_tier_volume"),
            "llm_summary_one_line": md.get("llm_summary_one_line"),
            "products_mentioned": md.get("products_mentioned"),
            "russin_rep": md.get("russin_rep"),
        },
    }


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().upper())


def heuristic_scores(gold: dict[str, Any], pred: dict[str, Any]) -> dict[str, Any]:
    """Cheap deterministic checks alongside LLM judge."""

    def eq_slot(g: Any, p: Any, *, normalizer=lambda x: x) -> bool:
        return normalizer(g) == normalizer(p)

    g_cust, p_cust = gold["customer"], pred["customer"]
    customer_company_ok = eq_slot(g_cust["company_name"], p_cust["company_name"], normalizer=norm_ws)
    customer_contact_ok = eq_slot(g_cust["contact_name"], p_cust["contact_name"], normalizer=norm_ws)

    scenario_ok = gold["scenario_tag"] == pred["scenario_tag"]
    outcome_ok = gold["outcome_target"] == pred["outcome_target"]

    g_ids = set(gold["primary_product_ids"])
    p_ids = set(pred["primary_product_ids"])
    if not g_ids and not p_ids:
        prod_ids_f1 = 1.0
    else:
        inter = len(g_ids & p_ids)
        prec = inter / len(p_ids) if p_ids else 0.0
        rec = inter / len(g_ids) if g_ids else 0.0
        prod_ids_f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0

    g_md, p_md = gold["metadata"], pred["metadata"]
    tier_ok = g_md.get("account_tier_volume") == p_md.get("account_tier_volume")

    g_rep = (g_md.get("russin_rep") or "").strip().lower()
    p_rep = (p_md.get("russin_rep") or "").strip().lower()
    rep_ok = g_rep == p_rep

    g_pm = {norm_ws(x) for x in (g_md.get("products_mentioned") or [])}
    p_pm = {norm_ws(x) for x in (p_md.get("products_mentioned") or [])}
    if not g_pm and not p_pm:
        pm_jaccard = 1.0
    else:
        pm_jaccard = len(g_pm & p_pm) / len(g_pm | p_pm) if (g_pm | p_pm) else 0.0

    return {
        "customer_company_name_exact": customer_company_ok,
        "customer_contact_name_exact": customer_contact_ok,
        "scenario_tag_exact": scenario_ok,
        "outcome_target_exact": outcome_ok,
        "primary_product_ids_f1": round(prod_ids_f1, 4),
        "account_tier_volume_exact": tier_ok,
        "russin_rep_exact_ci": rep_ok,
        "products_mentioned_jaccard": round(pm_jaccard, 4),
    }


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def embedding_vectors(client: Any, model: str, texts: list[str]) -> list[list[float]]:
    resp = client.embeddings.create(model=model, input=texts)
    if not resp.data:
        raise ValueError("No embedding data received")
    ordered = sorted(resp.data, key=lambda d: d.index)
    return [item.embedding for item in ordered]


def summary_semantic_metrics(
    client: Any,
    embedding_model: str,
    gold_summary: str,
    pred_summary: str,
    threshold: float,
) -> dict[str, Any]:
    g = (gold_summary or "").strip()
    p = (pred_summary or "").strip()
    if not g or not p:
        return {
            "llm_summary_embedding_cosine": None,
            "llm_summary_semantic_match": None,
        }
    try:
        vec_g, vec_p = embedding_vectors(client, embedding_model, [g, p])
    except Exception:
        return {
            "llm_summary_embedding_cosine": None,
            "llm_summary_semantic_match": None,
            "llm_summary_embedding_error": True,
        }
    cos = cosine_similarity(vec_g, vec_p)
    return {
        "llm_summary_embedding_cosine": round(cos, 4),
        "llm_summary_semantic_match": cos >= threshold,
    }


def openai_parse(
    client: OpenAI,
    model: str,
    messages: list[dict[str, str]],
    schema: dict[str, Any],
    *,
    max_tokens: int = 16384,
) -> dict[str, Any]:
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        response_format={
            "type": "json_schema",
            "json_schema": schema,
        },
    )
    content = resp.choices[0].message.content
    if not content:
        raise RuntimeError("Empty completion content")
    return json.loads(content)


def cmd_reconstruct(args: argparse.Namespace) -> None:
    if OpenAI is None:
        print("Install deps: pip install -r scripts/requirements-metadata-eval.txt", file=sys.stderr)
        sys.exit(1)
    load_dotenv(SAURON_CALLS_ROOT / ".env")
    client = openrouter_client()
    if client is None:
        print(
            "Set OPENROUTER_API_KEY in calls/sauron/.env (or the environment).",
            file=sys.stderr,
        )
        sys.exit(1)
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip()

    gold_path = Path(args.gold).resolve()
    minimal_path = Path(args.minimal).resolve()
    products_path = Path(args.products).resolve()

    gold_doc = load_json(gold_path)
    minimal_doc = load_json(minimal_path)
    products_doc = load_json(products_path)

    catalog_lines, _ = compact_product_catalog(products_doc)
    product_ids = [line.split("\t", 1)[0] for line in catalog_lines]
    catalog_block = "\n".join(catalog_lines)

    gold_by_id = {c["call_id"]: c for c in gold_doc["calls"]}
    minimal_calls = minimal_doc["calls"]
    if args.ordered_first:
        sample_ids = [c["call_id"] for c in minimal_calls[: args.sample_size]]
        sample_mode = "ordered_first"
    else:
        rng = random.Random(args.seed)
        sample_ids = [c["call_id"] for c in minimal_calls]
        if args.sample_size < len(sample_ids):
            sample_ids = rng.sample(sample_ids, args.sample_size)
        else:
            sample_ids = sample_ids[: args.sample_size]
        sample_mode = "random"

    schema_def = extractor_json_schema(product_ids)

    scenario_prompt = prompt_option_block(
        "scenario_tag — choose exactly ONE code that best matches the dominant arc:",
        SCENARIO_TAGS,
        SCENARIO_TAG_GUIDELINES,
    )
    outcome_prompt = prompt_option_block(
        "outcome_target — choose exactly ONE code for how the call resolves:",
        OUTCOME_TARGETS,
        OUTCOME_TARGET_GUIDELINES,
    )

    system_extractor = f"""You reconstruct structured metadata from Russin Lumber inside-sales call transcripts.
Use ONLY the transcript wording and reasonable business inference. Do not invent customers or products not supported by the transcript.

{CLOSED_ENUM_REMINDER}

Product catalog (product_id and catalog short_name):
{catalog_block}

{scenario_prompt}

{outcome_prompt}

Other rules:
- Choose scenario_tag and outcome_target by reading the transcript end-state and dominant arc, then pick the single best token from each closed list above (verbatim).
- primary_product_ids: choose zero or more product_id values from the catalog that are clearly discussed as SKUs/lines to quote or buy. Prefer precision over recall.
- metadata.products_mentioned: list catalog short_names (second column) for products clearly discussed; match spelling style from catalog short_name.
- metadata.account_tier_volume: MUST be exactly one of {", ".join(ACCOUNT_TIERS)} — no other string. If the transcript gives no volume signals, infer conservatively from order sizes or relationship cues; if impossible, choose \"M\".
- customer.company_name and customer.contact_name: from Buyer introductions.
- metadata.russin_rep: first name of the Russin representative only.
- metadata.llm_summary_one_line: one factual sentence summarizing the call."""

    predictions: list[dict[str, Any]] = []
    heuristics: list[dict[str, Any]] = []
    embedding_model = os.environ.get("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small").strip()
    summary_cos_threshold = float(os.environ.get("OPENROUTER_SUMMARY_SIM_THRESHOLD", "0.78"))

    for cid in sample_ids:
        row = next(c for c in minimal_calls if c["call_id"] == cid)
        transcript = row["transcript"]
        user_payload = {
            "call_id": cid,
            "transcript": transcript,
            "choose_scenario_tag_from_only_these_strings": SCENARIO_TAGS,
            "choose_outcome_target_from_only_these_strings": OUTCOME_TARGETS,
            "choose_account_tier_volume_from_only_these_strings": ACCOUNT_TIERS,
        }
        user_msg = json.dumps(user_payload, ensure_ascii=False)

        pred = openai_parse(
            client,
            model,
            messages=[
                {"role": "system", "content": system_extractor},
                {"role": "user", "content": user_msg},
            ],
            schema=schema_def,
        )
        if pred.get("call_id") != cid:
            pred["call_id"] = cid

        predictions.append(pred)
        gold = gold_slice(gold_by_id[cid])
        checks = heuristic_scores(gold, pred)
        checks.update(
            summary_semantic_metrics(
                client,
                embedding_model,
                gold["metadata"].get("llm_summary_one_line") or "",
                pred["metadata"].get("llm_summary_one_line") or "",
                summary_cos_threshold,
            )
        )
        heuristics.append({"call_id": cid, "heuristic_checks": checks})

    predictions_out = Path(args.predictions_out).resolve()
    save_json(
        predictions_out,
        {
            "schema_version": "metadata_predictions.1",
            "provider": "openrouter",
            "openrouter_base_url": os.environ.get("OPENROUTER_BASE_URL", OPENROUTER_BASE_URL_DEFAULT),
            "model": model,
            "summary_semantic_eval": {
                "embedding_model": embedding_model,
                "cosine_threshold_declares_match": summary_cos_threshold,
            },
            "sample_mode": sample_mode,
            "sample_seed": args.seed if sample_mode == "random" else None,
            "sample_call_ids": sample_ids,
            "predictions": predictions,
            "heuristic_vs_gold": heuristics,
        },
    )

    judge_payload = []
    for cid in sample_ids:
        judge_payload.append(
            {
                "call_id": cid,
                "transcript": next(c["transcript"] for c in minimal_calls if c["call_id"] == cid),
                "gold_standard": gold_slice(gold_by_id[cid]),
                "model_prediction": next(p for p in predictions if p["call_id"] == cid),
            }
        )

    judge_system = """You are an impartial evaluator judging another model's structured extraction against a gold JSON label set.
Gold labels are authoritative ground truth for this benchmark.

You MUST output exactly one object in per_call_verdicts for EVERY call_id in the user payload, in the same order as given.

For each call, score field-level alignment. Use \"exact\" only when values match after obvious normalization (case/spacing) where appropriate for strings.

For metadata.llm_summary_one_line: do NOT compare verbatim. Judge semantic equivalence only — same core facts (who, what products/situation, outcome shape). Different wording or sentence voice should still score \"close\" or \"exact\" if meaning matches; score \"partial\" only if important facts differ or are missing.

For metadata.products_mentioned lists, \"close\"/\"partial\"/\"wrong\" based on overlap of meaning with catalog-style names.

Be strict on enumerated scenario_tag and outcome_target versus gold unless the transcript clearly supports the prediction over gold.

Return structured JSON only."""

    judge_user = json.dumps(
        {
            "evaluation_task": "Compare predictions to gold_standard for each call_id.",
            "required_verdict_count": len(judge_payload),
            "call_ids_in_order": [x["call_id"] for x in judge_payload],
            "calls": judge_payload,
        },
        ensure_ascii=False,
    )

    judge_model = os.environ.get("OPENROUTER_JUDGE_MODEL", model).strip()
    judge_result = openai_parse(
        client,
        judge_model,
        messages=[
            {"role": "system", "content": judge_system},
            {"role": "user", "content": judge_user},
        ],
        schema=judge_json_schema(),
        max_tokens=16384,
    )

    report_out = Path(args.report_out).resolve()
    save_json(
        report_out,
        {
            "schema_version": "metadata_judge_report.1",
            "provider": "openrouter",
            "openrouter_base_url": os.environ.get("OPENROUTER_BASE_URL", OPENROUTER_BASE_URL_DEFAULT),
            "extractor_model": model,
            "judge_model": judge_model,
            "summary_semantic_eval": {
                "embedding_model": embedding_model,
                "cosine_threshold_declares_match": summary_cos_threshold,
            },
            "sample_mode": sample_mode,
            "sample_seed": args.seed if sample_mode == "random" else None,
            "sample_call_ids": sample_ids,
            "heuristic_vs_gold": heuristics,
            "llm_judge": judge_result,
        },
    )

    print(f"Predictions: {predictions_out}")
    print(f"Judge report: {report_out}")
    print(
        "Heuristic headline:",
        json.dumps(
            {h["call_id"]: h["heuristic_checks"] for h in heuristics},
            indent=2,
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Strip calls / reconstruct metadata / LLM judge")
    sub = parser.add_subparsers(dest="command", required=True)

    p_strip = sub.add_parser("strip", help="Part 1: write transcripts-only JSON")
    p_strip.add_argument("--input", default=str(DEFAULT_INPUT))
    p_strip.add_argument(
        "--output",
        default=str(SAURON_CALLS_ROOT / "calls_transcripts_only.json"),
    )
    p_strip.set_defaults(func=cmd_strip)

    p_rec = sub.add_parser("reconstruct", help="Part 2: LLM extract + judge on a sample")
    p_rec.add_argument("--gold", default=str(DEFAULT_INPUT))
    p_rec.add_argument(
        "--minimal",
        default=str(SAURON_CALLS_ROOT / "calls_transcripts_only.json"),
    )
    p_rec.add_argument("--products", default=str(SAURON_CALLS_ROOT / "products.json"))
    p_rec.add_argument("--sample-size", type=int, default=10)
    p_rec.add_argument("--seed", type=int, default=42)
    p_rec.add_argument(
        "--ordered-first",
        action="store_true",
        help="Use the first N calls in minimal JSON order instead of a random sample",
    )
    p_rec.add_argument(
        "--predictions-out",
        default=str(SAURON_CALLS_ROOT / "artifacts" / "metadata_predictions_sample.json"),
    )
    p_rec.add_argument(
        "--report-out",
        default=str(SAURON_CALLS_ROOT / "artifacts" / "metadata_judge_report.json"),
    )
    p_rec.set_defaults(func=cmd_reconstruct)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
