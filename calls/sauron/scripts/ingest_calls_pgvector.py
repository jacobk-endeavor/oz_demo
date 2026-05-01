#!/usr/bin/env python3
"""
Ingest calls/sauron/calls_transcripts_only.json into Postgres + pgvector.

Loads repo-root `.env` first (DATABASE_URL or PG* vars), then optional `calls/sauron/.env`.
Does not override existing environment variables.

Chunks carry metadata for chatbot retrieval:
  - owner_user_id  → rep_name (server-side filter per rep)
  - call_id        → cite / load full conversation
  - chunk_index, chunk_id, meta

Usage:
  cd calls/sauron/scripts
  python3 -m venv .venv && .venv/bin/pip install -r requirements-rag-ingest.txt
  .venv/bin/python ingest_calls_pgvector.py

Env:
  OPENAI_API_KEY          — required for embeddings
  DATABASE_URL            — or PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE
  PGVECTOR_DIMENSION      — default 1536 (text-embedding-3-small)
  OPENAI_EMBEDDING_MODEL  — default text-embedding-3-small
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote_plus

SCRIPT_DIR = Path(__file__).resolve().parent
SAURON_ROOT = SCRIPT_DIR.parent
REPO_ROOT = SAURON_ROOT.parent

DEFAULT_INPUT = SAURON_ROOT / "calls_transcripts_only.json"

CHUNK_CHARS = 1400
CHUNK_OVERLAP = 200


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


def chunk_transcript(text: str, size: int, overlap: int) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if overlap >= size:
        overlap = max(0, size // 5)
    out: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        out.append(text[start:end])
        if end >= n:
            break
        start = end - overlap
    return out


def embed_batches(
    client,
    model: str,
    texts: list[str],
    batch_size: int,
) -> list[list[float]]:
    all_vecs: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp = client.embeddings.create(model=model, input=batch)
        ordered = sorted(resp.data, key=lambda x: x.index)
        for item in ordered:
            all_vecs.append(item.embedding)
    return all_vecs


def ensure_extension(cur) -> None:
    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")


def ensure_tables(cur, dim: int) -> None:
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS call_rag_chunks (
          chunk_id text PRIMARY KEY,
          call_id text NOT NULL,
          owner_user_id text NOT NULL,
          chunk_index int NOT NULL,
          content text NOT NULL,
          embedding vector({dim}) NOT NULL,
          meta jsonb NOT NULL DEFAULT '{{}}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS call_rag_chunks_owner_idx ON call_rag_chunks (owner_user_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS call_rag_chunks_call_idx ON call_rag_chunks (call_id);"
    )


def ensure_hnsw(cur) -> None:
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS call_rag_chunks_embedding_hnsw_idx
        ON call_rag_chunks
        USING hnsw (embedding vector_cosine_ops);
        """
    )


def main() -> None:
    load_dotenv(REPO_ROOT / ".env")
    load_dotenv(SAURON_ROOT / ".env")

    parser = argparse.ArgumentParser(description="Ingest transcripts into pgvector.")
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Path to calls_transcripts_only.json",
    )
    parser.add_argument("--chunk-size", type=int, default=CHUNK_CHARS)
    parser.add_argument("--chunk-overlap", type=int, default=CHUNK_OVERLAP)
    parser.add_argument("--batch", type=int, default=64, help="Embedding batch size")
    parser.add_argument(
        "--skip-index",
        action="store_true",
        help="Skip creating HNSW index (if privileges fail)",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        raise SystemExit(f"Input not found: {args.input}")

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required.")

    dim = int(os.environ.get("PGVECTOR_DIMENSION", "1536"))
    embed_model = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()

    try:
        from openai import OpenAI
        import psycopg
        from pgvector.psycopg import register_vector
    except ImportError as e:
        raise SystemExit(f"Missing dependency: {e}. pip install -r requirements-rag-ingest.txt")

    raw = json.loads(args.input.read_text(encoding="utf-8"))
    calls = raw.get("calls") or []
    if not calls:
        raise SystemExit("No calls in JSON.")

    rows_prep: list[tuple[str, str, str, int, str, dict]] = []
    for c in calls:
        call_id = (c.get("call_id") or "").strip()
        rep = (c.get("rep_name") or "unknown").strip()
        transcript = c.get("transcript") or ""
        if not call_id:
            continue
        chunks = chunk_transcript(transcript, args.chunk_size, args.chunk_overlap)
        total = len(chunks)
        for idx, ch in enumerate(chunks):
            header = f"[call_id={call_id}][rep={rep}]\n\n"
            content = header + ch
            cid = f"{call_id}_{idx:05d}"
            meta = {
                "rep_name": rep,
                "total_chunks": total,
            }
            rows_prep.append((cid, call_id, rep, idx, content, meta))

    if not rows_prep:
        raise SystemExit("No chunks produced (empty transcripts?).")

    print(f"Prepared {len(rows_prep)} chunks from {len(calls)} calls.", flush=True)

    conninfo = build_conninfo()
    print("Connecting to Postgres (schema check before embeddings)...", flush=True)

    with psycopg.connect(conninfo, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            ensure_extension(cur)
        conn.commit()
        register_vector(conn)
        with conn.cursor() as cur:
            ensure_tables(cur, dim)
        conn.commit()
    print("Postgres OK.", flush=True)

    openai_client = OpenAI(api_key=api_key)
    texts = [r[4] for r in rows_prep]
    print(f"Embedding with {embed_model} (dim={dim})...", flush=True)
    vectors = embed_batches(openai_client, embed_model, texts, args.batch)
    if len(vectors) != len(rows_prep):
        raise SystemExit("Embedding count mismatch.")

    print("Writing rows...", flush=True)

    with psycopg.connect(conninfo, connect_timeout=30) as conn:
        register_vector(conn)

        sql = """
            INSERT INTO call_rag_chunks (chunk_id, call_id, owner_user_id, chunk_index, content, embedding, meta)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (chunk_id) DO UPDATE SET
              call_id = EXCLUDED.call_id,
              owner_user_id = EXCLUDED.owner_user_id,
              chunk_index = EXCLUDED.chunk_index,
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              meta = EXCLUDED.meta,
              created_at = now();
        """
        batch_insert = 200
        with conn.cursor() as cur:
            for i in range(0, len(rows_prep), batch_insert):
                batch_rows = rows_prep[i : i + batch_insert]
                batch_vecs = vectors[i : i + batch_insert]
                for row, vec in zip(batch_rows, batch_vecs):
                    cid, call_id, owner, idx, content, meta = row
                    cur.execute(
                        sql,
                        (cid, call_id, owner, idx, content, vec, json.dumps(meta)),
                    )
                conn.commit()
                print(f"Upserted {min(i + batch_insert, len(rows_prep))}/{len(rows_prep)}", flush=True)

        if not args.skip_index:
            try:
                with conn.cursor() as cur:
                    ensure_hnsw(cur)
                conn.commit()
                print("HNSW index ensured.", flush=True)
            except Exception as e:
                conn.rollback()
                print(
                    f"Warning: could not create HNSW index ({e}). "
                    "Queries still work; add index manually or use --skip-index.",
                    flush=True,
                )

    print("Done.", flush=True)


if __name__ == "__main__":
    main()
