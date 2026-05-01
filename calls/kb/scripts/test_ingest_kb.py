"""Unit tests for ingest_kb helpers (stdlib only)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ingest_kb import (
    chunk_transcript,
    classify_asset_kind,
    classify_doc_kind,
    slug_part,
    source_id_from_sha256,
)
from kb_extract_artifacts import (
    excel_manifest_units,
    pdf_manifest_units,
    publish_kb_extract_bundle,
)


class TestChunk(unittest.TestCase):
    def test_chunk_overlap(self) -> None:
        parts = chunk_transcript("a" * 100 + "b" * 100, size=80, overlap=10)
        self.assertGreater(len(parts), 1)

    def test_empty(self) -> None:
        self.assertEqual(chunk_transcript("", 100, 10), [])


class TestClassifier(unittest.TestCase):
    def test_doc_kind_brochure(self) -> None:
        p = Path("/tmp/2026deckorators-decking-overview-brochure.pdf")
        r = classify_doc_kind(p, "application/pdf", "")
        self.assertEqual(r.doc_kind, "marketing")

    def test_asset_pdf_filter(self) -> None:
        p = Path("/x/foo.pdf")
        self.assertEqual(classify_asset_kind(p, "application/pdf", "pdf"), "pdf")
        self.assertIsNone(classify_asset_kind(Path("/x/foo.txt"), "text/plain", "pdf"))

    def test_asset_text_filter(self) -> None:
        self.assertEqual(
            classify_asset_kind(Path("/notes.txt"), "text/plain", "text"),
            "text",
        )
        self.assertIsNone(classify_asset_kind(Path("/x.pdf"), "application/pdf", "text"))


class TestIds(unittest.TestCase):
    def test_source_id(self) -> None:
        h = "a" * 64
        self.assertEqual(source_id_from_sha256(h), "a" * 12)

    def test_slug(self) -> None:
        self.assertEqual(slug_part("PG-FGD"), "PG-FGD")


class TestExtractArtifacts(unittest.TestCase):
    def test_pdf_manifest_groups_chunk_ids(self) -> None:
        pages = ["hello", "world"]
        rows = [
            {"chunk_id": "x_p001_00000", "locator": "page=1"},
            {"chunk_id": "x_p001_00001", "locator": "page=1"},
            {"chunk_id": "x_p002_00000", "locator": "page=2"},
        ]
        units = pdf_manifest_units(pages, rows)
        self.assertEqual(units[0]["chunk_ids"], ["x_p001_00000", "x_p001_00001"])
        self.assertEqual(units[1]["chunk_ids"], ["x_p002_00000"])
        self.assertEqual(units[0]["file"], "unit-page-001.txt")

    def test_excel_manifest_sheet_locator(self) -> None:
        rows = [
            {"chunk_id": "a", "locator": "sheet=Pricing rows=1-20"},
            {"chunk_id": "b", "locator": "sheet=Pricing rows=21-40"},
        ]
        sheet_fn = {"Pricing": "unit-sheet-pricing.csv"}
        units = excel_manifest_units(["Pricing"], rows, sheet_fn)
        self.assertEqual(units[0]["locator"], "sheet=Pricing")
        self.assertEqual(units[0]["chunk_ids"], ["a", "b"])

    def test_publish_bundle_atomic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = publish_kb_extract_bundle(
                root,
                source_id="abc123def456",
                title="T",
                doc_kind="marketing",
                manifest_version=1,
                units=[
                    {
                        "locator": "page=1",
                        "file": "unit-page-001.txt",
                        "chunk_ids": ["abc123def456_p001_00000"],
                        "images": [],
                    }
                ],
                has_full_text=True,
                full_text_file="full.txt",
                full_text_content="full body",
                unit_files={"unit-page-001.txt": "page one"},
            )
            self.assertTrue((out / "manifest.json").is_file())
            self.assertEqual((out / "unit-page-001.txt").read_text(encoding="utf-8"), "page one")
            self.assertEqual((out / "full.txt").read_text(encoding="utf-8"), "full body")
            man = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(man["manifest_version"], 1)
            self.assertTrue(man["has_full_text"])


if __name__ == "__main__":
    unittest.main()
