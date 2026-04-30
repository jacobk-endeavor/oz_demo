from __future__ import annotations

import re
from typing import Any


_DIGITS_RE = re.compile(r"\D+")
_CONFIDENCE_RANK = {"high": 0, "medium": 1, "low": 2}
_TYPE_RANK = {
    "mobile": 0,
    "direct": 1,
    "office": 2,
    "work": 2,
    "main": 3,
    "home": 4,
    "other": 5,
    "unknown": 6,
}
_TYPE_ALIASES = {
    "cell": "mobile",
    "cell_phone": "mobile",
    "business": "office",
    "landline": "office",
    "work_phone": "work",
}


def normalize_phone_type(value: str | None) -> str:
    text = (value or "").strip().lower().replace(" ", "_")
    if not text:
        return "unknown"
    return _TYPE_ALIASES.get(text, text)


def normalize_phone_number(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def phone_match_key(number: str | None) -> str:
    text = (number or "").strip()
    digits = _DIGITS_RE.sub("", text)
    return digits or text.casefold()


def serialize_phone_model(phone: Any) -> dict[str, Any]:
    return {
        "number": getattr(phone, "number", None),
        "type": getattr(phone, "type", None),
        "status": getattr(phone, "status", None),
        "confidence": getattr(phone, "confidence", None),
        "is_primary": bool(getattr(phone, "is_primary", False)),
    }


def normalize_contact_phone_entries(entries: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not entries:
        return []

    deduped: dict[str, dict[str, Any]] = {}
    for idx, raw in enumerate(entries):
        if not isinstance(raw, dict):
            continue

        number = normalize_phone_number(
            raw.get("number")
            or raw.get("sanitized_number")
            or raw.get("raw_number")
            or raw.get("phone")
        )
        if not number:
            continue

        entry = {
            "number": number,
            "type": normalize_phone_type(raw.get("type") or raw.get("type_cd")),
            "status": (raw.get("status") or raw.get("status_cd") or "").strip() or None,
            "confidence": (
                raw.get("confidence") or raw.get("confidence_cd") or ""
            ).strip() or None,
            "is_primary": bool(raw.get("is_primary")),
            "_idx": idx,
        }

        key = phone_match_key(number)
        current = deduped.get(key)
        if current is None:
            deduped[key] = entry
            continue

        current["is_primary"] = current["is_primary"] or entry["is_primary"]
        if current["type"] == "unknown" and entry["type"] != "unknown":
            current["type"] = entry["type"]
        if not current["status"] and entry["status"]:
            current["status"] = entry["status"]
        if not current["confidence"] and entry["confidence"]:
            current["confidence"] = entry["confidence"]
        if len(entry["number"]) > len(current["number"]):
            current["number"] = entry["number"]

    ordered = list(deduped.values())
    if not ordered:
        return []

    explicit_primary = next((i for i, item in enumerate(ordered) if item["is_primary"]), None)
    primary_idx = explicit_primary if explicit_primary is not None else min(
        range(len(ordered)),
        key=lambda i: _phone_priority(ordered[i]),
    )

    for i, entry in enumerate(ordered):
        entry["is_primary"] = i == primary_idx

    ordered.sort(key=lambda item: (0 if item["is_primary"] else 1, item["_idx"]))
    for entry in ordered:
        entry.pop("_idx", None)
    return ordered


def primary_phone_number(entries: list[dict[str, Any]] | None) -> str | None:
    if not entries:
        return None
    primary = next((entry for entry in entries if entry.get("is_primary")), None)
    if primary:
        return primary.get("number")
    return entries[0].get("number")


def _phone_priority(entry: dict[str, Any]) -> tuple[int, int, int, int]:
    status = (entry.get("status") or "").strip().lower()
    confidence = (entry.get("confidence") or "").strip().lower()
    phone_type = normalize_phone_type(entry.get("type"))

    is_valid = 0 if ("valid" in status or status == "verified") else 1
    confidence_rank = _CONFIDENCE_RANK.get(confidence, len(_CONFIDENCE_RANK))
    type_rank = _TYPE_RANK.get(phone_type, len(_TYPE_RANK))
    return (is_valid, confidence_rank, type_rank, entry.get("_idx", 0))
