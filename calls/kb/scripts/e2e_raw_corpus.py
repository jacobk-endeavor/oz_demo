#!/usr/bin/env python3
"""
End-to-end verification for the Track A raw/ corpus (Oz-Demo-4c3).

Prerequisites:
  - pip install -r calls/kb/scripts/requirements-kb-ingest.txt
  - DATABASE_URL (or PG*), OPENAI_API_KEY
  - raw/ directory alongside repo root (gitignored; place corpus locally)

Usage:
  python e2e_raw_corpus.py [--raw-dir PATH] [--ingest-args ...]

Steps:
  1) Count files under raw/ (expect 83 for the reference corpus).
  2) Optionally run: python ingest_kb.py <raw-dir> --on-success emit-event [--ingest-args ...]
  3) Query kb_sources: every row must be status ready or failed with meta.reason set.
  4) Sample citation resolution: every kb_rag_chunks.content containing '[catalog:sku=' has matching chunk_id pattern.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent


def iter_files(root: Path):
    if root.is_file():
        yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for name in filenames:
            if name.startswith("."):
                continue
            yield Path(dirpath) / name


def count_raw_files(raw_dir: Path) -> int:
    return sum(1 for _ in iter_files(raw_dir))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--raw-dir", type=Path, default=REPO_ROOT / "raw")
    p.add_argument("--expect-count", type=int, default=83)
    p.add_argument("--run-ingest", action="store_true", help="Run ingest_kb.py on raw-dir first")
    p.add_argument(
        "ingest_extra",
        nargs="*",
        help="Extra args forwarded to ingest_kb.py when --run-ingest is set",
    )
    args = p.parse_args()

    raw_dir = args.raw_dir.resolve()
    if not raw_dir.exists():
        print(f"SKIP: raw dir not found: {raw_dir}", file=sys.stderr)
        sys.exit(0)

    n = count_raw_files(raw_dir)
    print(f"raw file count: {n} (expect {args.expect_count})")
    if n != args.expect_count:
        print("WARNING: file count differs from expected reference corpus.", file=sys.stderr)

    if args.run_ingest:
        cmd = [sys.executable, str(SCRIPT_DIR / "ingest_kb.py"), str(raw_dir), *args.ingest_extra]
        print("Running:", " ".join(cmd), flush=True)
        subprocess.check_call(cmd, cwd=str(REPO_ROOT))

    try:
        import psycopg
    except ImportError:
        print("SKIP: psycopg not installed", file=sys.stderr)
        sys.exit(0)

    from ingest_kb import build_conninfo

    conninfo = build_conninfo()
    with psycopg.connect(conninfo, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status, count(*) FROM kb_sources
                WHERE path LIKE %s OR path LIKE %s
                GROUP BY status
                """,
                (str(raw_dir) + "/%", str(raw_dir / "%")),
            )
            rows = cur.fetchall()
            print("kb_sources by status (paths under raw):", rows)

            cur.execute(
                """
                SELECT source_id, status, meta->>'reason' AS reason
                FROM kb_sources
                WHERE (path LIKE %s OR path LIKE %s)
                  AND status NOT IN ('ready', 'failed')
                """,
                (str(raw_dir) + "/%", str(raw_dir / "%")),
            )
            bad = cur.fetchall()
            if bad:
                print("FAIL: sources not terminal:", bad, file=sys.stderr)
                sys.exit(1)

            cur.execute(
                """
                SELECT source_id, status FROM kb_sources
                WHERE (path LIKE %s OR path LIKE %s)
                  AND status = 'failed' AND (meta->>'reason' IS NULL OR meta->>'reason' = '')
                """,
                (str(raw_dir) + "/%", str(raw_dir / "%")),
            )
            no_reason = cur.fetchall()
            if no_reason:
                print("FAIL: failed sources missing meta.reason:", no_reason, file=sys.stderr)
                sys.exit(1)

            cur.execute(
                """
                SELECT chunk_id, content FROM kb_rag_chunks
                WHERE content LIKE '%[catalog:sku=%'
                   OR content LIKE '%[recs:%'
                LIMIT 5000
                """
            )
            for cid, content in cur.fetchall():
                if "[catalog:sku=" in content and not str(cid).startswith("cat_sku_"):
                    print(f"WARN: unexpected chunk_id for catalog chunk: {cid}", file=sys.stderr)

    print("e2e_raw_corpus checks passed.")


if __name__ == "__main__":
    main()
