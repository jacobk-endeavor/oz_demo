"""
Write kb_extracts/<source_id>/ artifacts (Track A).

Atomic staging under kb_extracts/.staging/<source_id>/ then rename.
See docs/wiki-kb/track-a-raw-ingest.md §2.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any


def pdf_manifest_units(pages: list[str], chunk_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_page: dict[int, list[str]] = {}
    for r in chunk_rows:
        m = re.match(r"^page=(\d+)$", str(r.get("locator") or ""))
        if not m:
            continue
        p = int(m.group(1))
        by_page.setdefault(p, []).append(str(r["chunk_id"]))
    out: list[dict[str, Any]] = []
    for i, _pt in enumerate(pages, start=1):
        cid_list = by_page.get(i, [])
        out.append(
            {
                "locator": f"page={i}",
                "file": f"unit-page-{i:03d}.txt",
                "chunk_ids": cid_list,
                "images": [],
            }
        )
    return out


def pptx_manifest_units(num_slides: int, chunk_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_slide: dict[int, list[str]] = {}
    for r in chunk_rows:
        m = re.match(r"^slide=(\d+)$", str(r.get("locator") or ""))
        if not m:
            continue
        s = int(m.group(1))
        by_slide.setdefault(s, []).append(str(r["chunk_id"]))
    out: list[dict[str, Any]] = []
    for i in range(1, num_slides + 1):
        out.append(
            {
                "locator": f"slide={i}",
                "file": f"unit-slide-{i:03d}.txt",
                "chunk_ids": by_slide.get(i, []),
                "images": [],
            }
        )
    return out


def excel_manifest_units(
    sheet_names_in_order: list[str],
    chunk_rows: list[dict[str, Any]],
    sheet_filename: dict[str, str],
) -> list[dict[str, Any]]:
    """Group chunk rows by sheet name parsed from locator sheet=<name> rows=...."""

    def key_fn(loc: str) -> str | None:
        m = re.match(r"^sheet=([^ ]+) rows=", loc)
        return m.group(1) if m else None

    by_sheet: dict[str, list[str]] = {}
    for r in chunk_rows:
        k = key_fn(str(r.get("locator") or ""))
        if k is None:
            continue
        by_sheet.setdefault(k, []).append(str(r["chunk_id"]))

    units: list[dict[str, Any]] = []
    for name in sheet_names_in_order:
        fn = sheet_filename.get(name) or f"unit-sheet-{re.sub(r'[^a-z0-9]+', '-', name.strip().lower()).strip('-') or 'sheet'}.csv"
        units.append(
            {
                "locator": f"sheet={name}",
                "file": fn,
                "chunk_ids": by_sheet.get(name, []),
                "images": [],
            }
        )
    return units


def text_manifest_units(chunk_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Single-file text: one unit pointing at unit-full.txt."""
    ids = [str(r["chunk_id"]) for r in chunk_rows]
    return [
        {
            "locator": "",
            "file": "unit-full.txt",
            "chunk_ids": ids,
            "images": [],
        }
    ]


def structured_manifest_units(chunk_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, r in enumerate(chunk_rows):
        fn = f"unit-record-{i:04d}.txt"
        out.append(
            {
                "locator": str(r.get("locator") or ""),
                "file": fn,
                "chunk_ids": [str(r["chunk_id"])],
                "images": [],
            }
        )
    return out


def publish_kb_extract_bundle(
    repo_root: Path,
    *,
    source_id: str,
    title: str,
    doc_kind: str,
    manifest_version: int,
    units: list[dict[str, Any]],
    has_full_text: bool,
    full_text_file: str | None,
    full_text_content: str | None,
    unit_files: dict[str, str],
    manifest_fields: dict[str, Any] | None = None,
    structured_schema: str | None = None,
) -> Path:
    """
    Write kb_extracts/.staging/<source_id>/ then rename to kb_extracts/<source_id>/.

    unit_files: relative paths under the bundle (e.g. unit-page-001.txt -> content).
    """
    extracts_root = repo_root / "kb_extracts"
    staging_root = extracts_root / ".staging"
    staging_dir = staging_root / source_id
    output_dir = extracts_root / source_id

    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)

    for rel, text in unit_files.items():
        p = staging_dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    if full_text_file and full_text_content is not None:
        (staging_dir / full_text_file).write_text(full_text_content, encoding="utf-8")

    manifest: dict[str, Any] = {
        "manifest_version": manifest_version,
        "source_id": source_id,
        "title": title,
        "doc_kind": doc_kind,
        "has_full_text": has_full_text,
        "units": units,
    }
    if full_text_file:
        manifest["full_text_file"] = full_text_file
    if structured_schema:
        manifest["structured_schema"] = structured_schema
    if manifest_fields:
        for k, v in manifest_fields.items():
            if v is not None:
                manifest[k] = v

    man_path = staging_dir / "manifest.json"
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    json.loads(man_path.read_text(encoding="utf-8"))  # validate

    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.move(str(staging_dir), str(output_dir))
    return output_dir
