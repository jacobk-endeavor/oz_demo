"""
Sectioned PDF from JSON (reportlab). Same block grammar as ``report_docx``.

Input JSON:
  title: str
  sections: list of blocks (see report_docx module docstring)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from sandboxTemplates._sections import iter_blocks, paragraph_text


def _styles():
    base = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "OzTitle",
        parent=base["Title"],
        fontSize=18,
        spaceAfter=12,
    )
    h1 = ParagraphStyle("OzH1", parent=base["Heading1"], spaceAfter=8)
    h_body = ParagraphStyle("OzHBody", parent=base["Heading2"], spaceAfter=6)
    body = ParagraphStyle("OzBody", parent=base["Normal"], spaceAfter=6)
    return {"title": title_style, "h1": h1, "h_body": h_body, "body": body}


def _flow_for_block(block: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    t = str(block.get("type") or "").lower()
    flow: list[Any] = []

    if t == "heading":
        text = str(block.get("text") or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        raw_level = block.get("level", 1)
        try:
            level = int(raw_level)
        except (TypeError, ValueError):
            level = 1
        if level <= 0:
            flow.append(Paragraph(text, styles["title"]))
        elif level == 1:
            flow.append(Paragraph(text, styles["h1"]))
        else:
            flow.append(Paragraph(text, styles["h_body"]))
        flow.append(Spacer(1, 6))
        return flow

    if t == "paragraph":
        txt = paragraph_text(block).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        txt = txt.replace("\n", "<br/>")
        flow.append(Paragraph(txt, styles["body"]))
        return flow

    if t == "table":
        headers = [str(h) for h in (block.get("headers") or [])]
        rows_raw = list(block.get("rows") or [])
        n_cols = max(len(headers), max((len(r) for r in rows_raw), default=0))
        n_cols = max(n_cols, 1)
        data: list[list[str]] = []
        head = [headers[i] if i < len(headers) else "" for i in range(n_cols)]
        data.append(head)
        for row in rows_raw:
            if not isinstance(row, (list, tuple)):
                row = [row]
            data.append(["" if (i >= len(row) or row[i] is None) else str(row[i]) for i in range(n_cols)])
        tw = 6.5 * inch
        col_w = tw / n_cols
        tbl = Table(data, colWidths=[col_w] * n_cols, repeatRows=1)
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        flow.append(Spacer(1, 8))
        flow.append(tbl)
        flow.append(Spacer(1, 12))
        return flow

    if t == "image":
        path = Path(str(block.get("path") or ""))
        if path.is_file():
            img = Image(str(path), width=5 * inch)
            flow.append(img)
        else:
            flow.append(Paragraph(f"[missing image: {path}]", styles["body"]))
        flow.append(Spacer(1, 12))
        return flow

    return flow


def render_pdf(payload: dict[str, Any], output_path: Path) -> None:
    styles = _styles()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    story: list[Any] = []
    for block in iter_blocks(payload):
        story.extend(_flow_for_block(block, styles))

    doc.build(story)


def _load_payload(source: Path | None) -> dict[str, Any]:
    raw = source.read_text(encoding="utf-8") if source else sys.stdin.read()
    data = json.loads(raw)
    if "sections" not in data:
        raise ValueError("payload must include 'sections' array")
    return data


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Render report JSON to PDF.")
    p.add_argument("--input", "-i", type=Path, help="Input JSON file (default: stdin)")
    p.add_argument("--output", "-o", type=Path, required=True, help="Output .pdf path")
    args = p.parse_args(argv)

    payload = _load_payload(args.input)
    render_pdf(payload, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
