"""
Sectioned docx from JSON (python-docx).

Input JSON:
  title: str — document title (prepended as top heading)
  sections: list of blocks:
    { "type": "heading", "text": str, "level"?: int 0-9 } — 0 = Title; 1 = Heading 1
    { "type": "paragraph", "text": str }
    { "type": "table", "headers": [str, ...], "rows": [ [...], ... ] }
    { "type": "image", "path": str } — filesystem path (resolved by caller / sandbox mount)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from docx import Document
from docx.shared import Inches

from sandboxTemplates._sections import iter_blocks, paragraph_text


def _render_block(doc: Document, block: dict[str, Any]) -> None:
    t = str(block.get("type") or "").lower()

    if t == "heading":
        text = str(block.get("text") or "")
        raw_level = block.get("level", 1)
        try:
            level = int(raw_level)
        except (TypeError, ValueError):
            level = 1
        level = max(0, min(level, 8))
        doc.add_heading(text, level=level)
        return

    if t == "paragraph":
        doc.add_paragraph(paragraph_text(block))
        return

    if t == "table":
        headers = list(block.get("headers") or [])
        rows = list(block.get("rows") or [])
        n_cols = max(len(headers), max((len(r) for r in rows), default=0))
        n_cols = max(n_cols, 1)
        table = doc.add_table(rows=1 + len(rows), cols=n_cols)
        table.style = "Table Grid"
        hdr_cells = table.rows[0].cells
        for i in range(n_cols):
            hdr_cells[i].text = str(headers[i]) if i < len(headers) else ""
        for ri, row in enumerate(rows, start=1):
            for ci in range(n_cols):
                val = row[ci] if ci < len(row) else ""
                table.rows[ri].cells[ci].text = "" if val is None else str(val)
        doc.add_paragraph("")
        return

    if t == "image":
        path = Path(str(block.get("path") or ""))
        if path.is_file():
            doc.add_picture(str(path), width=Inches(5))
        else:
            doc.add_paragraph(f"[missing image: {path}]")
        return


def render_docx(payload: dict[str, Any], output_path: Path) -> None:
    doc = Document()
    for block in iter_blocks(payload):
        _render_block(doc, block)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(output_path))


def _load_payload(source: Path | None) -> dict[str, Any]:
    raw = source.read_text(encoding="utf-8") if source else sys.stdin.read()
    data = json.loads(raw)
    if "sections" not in data:
        raise ValueError("payload must include 'sections' array")
    return data


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Render report JSON to docx.")
    p.add_argument("--input", "-i", type=Path, help="Input JSON file (default: stdin)")
    p.add_argument("--output", "-o", type=Path, required=True, help="Output .docx path")
    args = p.parse_args(argv)

    payload = _load_payload(args.input)
    render_docx(payload, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
