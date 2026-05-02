"""Shared section grammar for report_docx / report_pdf (see docs/code-sandbox-and-artifact-generation.md §2.2)."""
from __future__ import annotations

from typing import Any


def iter_blocks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return normalized blocks from ``title`` + ``sections``."""
    out: list[dict[str, Any]] = []
    title = payload.get("title")
    if title:
        out.append({"type": "heading", "text": str(title), "level": 0})

    for raw in payload.get("sections") or []:
        if not isinstance(raw, dict):
            continue
        t = str(raw.get("type") or "").lower()
        if t in ("paragraphs", "paragraph"):
            out.append({**raw, "type": "paragraph"})
        elif t in ("heading", "table", "image"):
            out.append(raw)
        else:
            out.append(raw)

    return out


def paragraph_text(block: dict[str, Any]) -> str:
    return str(block.get("text") or "")
