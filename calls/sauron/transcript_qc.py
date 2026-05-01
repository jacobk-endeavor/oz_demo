#!/usr/bin/env python3
"""Quality checks for synthetic sales transcripts.

Baseline (`transcript_violations`): speaker prefixes, template placeholders,
Contact-* synthetic IDs, bracket slots, internal field names.

Strict (`transcript_violations_strict`, optional): min dialogue lines, min Russin/Buyer
turns, rep first name appears in Russin lines, buyer name tokens + company tokens
present in dialogue, Russin-side "Russin" mention, NET 30 vs needs_written_confirmation.

Downstream scripts can import these for CI or post-processing.
"""

from __future__ import annotations

import re

# Placeholder / template leaks (case-insensitive where noted)
_PLACEHOLDER_SUBSTRINGS = (
    "[your name]",
    "[buyer name]",
    "[contact name]",
    "[seller name]",
    "[rep name]",
    "[company name]",
)

# Spoken CRM-style IDs
_CONTACT_HEX = re.compile(r"Contact-[0-9a-f]{4,}", re.I)

# Any square-bracket stage direction / unfilled slot
_BRACKET_CHUNK = re.compile(r"\[[^\]]{2,80}\]")

# Internal field jargon that should not appear in spoken dialogue
_INTERNAL_JARGON = re.compile(
    r"\b(?:buyer_id|contact_synthetic|generation_seed|synthetic_name)\b",
    re.I,
)

# Casual NET-30 promise (flag when account should defer to written terms)
_NET_30 = re.compile(r"\bnet\s*[- ]?\s*30\b", re.I)


def transcript_violations(transcript: str) -> list[str]:
    """Baseline checks: placeholders, line prefixes, brackets, synthetic IDs."""
    t = transcript
    low = t.lower()
    out: list[str] = []

    for line in t.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("Russin:") or s.startswith("Buyer:"):
            continue
        out.append(f'dialogue line must start with "Russin:" or "Buyer:" — got: {s[:64]!r}…')
        break

    for ph in _PLACEHOLDER_SUBSTRINGS:
        if ph in low:
            out.append(f"contains placeholder fragment: {ph!r}")

    if _CONTACT_HEX.search(t):
        out.append("contains Contact-******** style synthetic ID")

    if _INTERNAL_JARGON.search(t):
        out.append("contains internal/CRM field name")

    for m in _BRACKET_CHUNK.finditer(t):
        snippet = m.group(0)
        out.append(f"square-bracket segment (unfinished slot?): {snippet!r}")
        break

    return out


def transcript_violations_strict(
    transcript: str,
    *,
    russin_rep: str,
    buyer_full_name: str,
    company_name: str,
    min_lines: int = 6,
    terms_tone: str | None = None,
) -> list[str]:
    """Stricter coaching/automation checks (optional). Run after baseline passes."""
    out: list[str] = []
    lines = [ln.strip() for ln in transcript.splitlines() if ln.strip()]
    if len(lines) < min_lines:
        out.append(f"expected at least {min_lines} non-empty dialogue lines, got {len(lines)}")

    russin_lines = [ln for ln in lines if ln.startswith("Russin:")]
    buyer_lines = [ln for ln in lines if ln.startswith("Buyer:")]
    if len(russin_lines) < 2:
        out.append(f"expected at least 2 Russin: lines, got {len(russin_lines)}")
    if len(buyer_lines) < 2:
        out.append(f"expected at least 2 Buyer: lines, got {len(buyer_lines)}")

    rep_l = russin_rep.strip().lower()
    if rep_l and not any(rep_l in ln.lower() for ln in russin_lines):
        out.append(f"Russin rep first name {russin_rep!r} not found in any Russin: line")

    full_compact = "".join(ch for ch in buyer_full_name.lower() if ch.isalnum() or ch.isspace()).strip()
    full_tokens = [w for w in buyer_full_name.lower().split() if len(w) > 1]
    body = transcript.lower()
    if full_tokens and not all(tok in body for tok in full_tokens):
        out.append(f"buyer name tokens from {buyer_full_name!r} not all present in transcript")

    co_norm = re.sub(r"[^a-z0-9]+", " ", company_name.lower()).strip()
    co_sig = [w for w in co_norm.split() if len(w) > 2][:3]
    if co_sig and not any(w in body for w in co_sig):
        out.append(f"company name (key tokens) from {company_name!r} not clearly reflected in dialogue")

    russin_blob = " ".join(ln[len("Russin:") :].lower() for ln in russin_lines)
    if "russin" not in russin_blob and "russin lumber" not in body:
        out.append('expected "Russin" / company mention in Russin-side dialogue')

    if terms_tone == "needs_written_confirmation" and _NET_30.search(transcript):
        out.append(
            "NET 30 mentioned on needs_written_confirmation account — prefer quote/credit language only"
        )

    return out


def transcript_all_violations(
    transcript: str,
    *,
    strict: bool = False,
    russin_rep: str = "",
    buyer_full_name: str = "",
    company_name: str = "",
    terms_tone: str | None = None,
) -> list[str]:
    v = transcript_violations(transcript)
    if strict and not v:
        v.extend(
            transcript_violations_strict(
                transcript,
                russin_rep=russin_rep,
                buyer_full_name=buyer_full_name,
                company_name=company_name,
                terms_tone=terms_tone,
            )
        )
    elif strict:
        pass  # baseline failed; skip strict noise
    return v


__all__ = [
    "transcript_violations",
    "transcript_violations_strict",
    "transcript_all_violations",
]
