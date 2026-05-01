"""Unit tests for ingest_kb helpers (stdlib only)."""

from __future__ import annotations

import unittest
from pathlib import Path

from ingest_kb import (
    chunk_transcript,
    classify_asset_kind,
    classify_doc_kind,
    slug_part,
    source_id_from_sha256,
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


if __name__ == "__main__":
    unittest.main()
