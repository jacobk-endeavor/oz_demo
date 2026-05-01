#!/usr/bin/env python3
"""
Ensure KB pgvector schema exists for Track A raw-ingest.

Creates:
  - kb_sources
  - kb_rag_chunks
  - lookup indexes + HNSW cosine index for retrieval

Usage:
  cd calls/sauron/scripts
  python migrate_kb_pgvector.py
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote_plus

SCRIPT_DIR = Path(__file__).resolve().parent
SAURON_ROOT = SCRIPT_DIR.parent
REPO_ROOT = SAURON_ROOT.parent


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    try:
        from dotenv import load_dotenv as _load

        _load(path, override=False)
    except ImportError:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def build_conninfo() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    host = os.environ.get("PGHOST", "").strip()
    user = os.environ.get("PGUSER", "").strip()
    password = os.environ.get("PGPASSWORD", "").strip()
    db = (os.environ.get("PGDATABASE") or "defaultdb").strip()
    port = os.environ.get("PGPORT", "5432").strip()
    sslmode = os.environ.get("PGSSLMODE", "require").strip()
    if not all([host, user, password, db]):
        raise SystemExit(
            "Missing DB config: set DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, PGDATABASE "
            "(optional PGPORT, PGSSLMODE)."
        )
    pw = quote_plus(password)
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}?sslmode={sslmode}"


def ensure_extension(cur) -> None:
    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")


def ensure_tables(cur, dim: int) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS kb_sources (
          source_id text PRIMARY KEY,
          path text NOT NULL,
          first_seen_path text NOT NULL,
          sha256 text NOT NULL UNIQUE,
          mime text NOT NULL,
          bytes bigint,
          page_count int,
          sheet_count int,
          ingested_at timestamptz NOT NULL DEFAULT now(),
          status text NOT NULL,
          meta jsonb NOT NULL DEFAULT '{}'::jsonb,
          CONSTRAINT kb_sources_status_check
            CHECK (status IN ('pending', 'extracting', 'embedding', 'ready', 'failed', 'removed'))
        );
        """
    )
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS kb_rag_chunks (
          chunk_id text PRIMARY KEY,
          source_id text NOT NULL REFERENCES kb_sources(source_id),
          scope text NOT NULL DEFAULT 'global',
          locator text NOT NULL DEFAULT '',
          chunk_index int NOT NULL,
          content text NOT NULL,
          embedding vector({dim}) NOT NULL,
          meta jsonb NOT NULL DEFAULT '{{}}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        """
    )


def ensure_indexes(cur) -> None:
    cur.execute("CREATE INDEX IF NOT EXISTS kb_sources_status_idx ON kb_sources (status);")
    cur.execute("CREATE INDEX IF NOT EXISTS kb_sources_ingested_at_idx ON kb_sources (ingested_at DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS kb_rag_chunks_source_idx ON kb_rag_chunks (source_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS kb_rag_chunks_scope_idx ON kb_rag_chunks (scope);")
    cur.execute(
        "CREATE INDEX IF NOT EXISTS kb_rag_chunks_source_chunk_idx ON kb_rag_chunks (source_id, chunk_index);"
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS kb_rag_chunks_embedding_hnsw_idx
        ON kb_rag_chunks
        USING hnsw (embedding vector_cosine_ops);
        """
    )


def main() -> None:
    load_dotenv(REPO_ROOT / ".env")
    load_dotenv(SAURON_ROOT / ".env")
    dim = int(os.environ.get("PGVECTOR_DIMENSION", "1536"))
    conninfo = build_conninfo()

    try:
        import psycopg
    except ImportError as e:
        raise SystemExit(f"Missing dependency: {e}. pip install -r requirements-rag-ingest.txt")

    with psycopg.connect(conninfo, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            ensure_extension(cur)
            ensure_tables(cur, dim)
            ensure_indexes(cur)
        conn.commit()

    print("KB schema ensured: kb_sources + kb_rag_chunks + indexes", flush=True)


if __name__ == "__main__":
    main()
