#!/usr/bin/env python3
"""
RAG query CLI against call_rag_chunks (pgvector). Requires --name <rep> OR --admin.

Examples:
  .venv/bin/python rag_query_cli.py --name Jacob -q "What cedar products came up?"
  .venv/bin/python rag_query_cli.py --admin "Give examples of freight constraints"
  .venv/bin/python rag_query_cli.py --name Sami --no-llm -q "stock check calls"

Env: same DB vars as ingest_calls_pgvector.py; OPENAI_API_KEY; optional OPENAI_EMBEDDING_MODEL,
     OPENAI_CHAT_MODEL (default gpt-4o-mini).
"""

from __future__ import annotations

import argparse
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


def embed_query(client, model: str, text: str) -> list[float]:
    resp = client.embeddings.create(model=model, input=[text.strip()])
    return resp.data[0].embedding


def retrieve(
    cur,
    vec: list[float],
    *,
    admin: bool,
    owner_user_id: str | None,
    top_k: int,
) -> list[tuple]:
    if admin:
        cur.execute(
            """
            SELECT chunk_id, call_id, owner_user_id, chunk_index, content,
                   embedding <=> %s::vector AS dist
            FROM call_rag_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec, vec, top_k),
        )
    else:
        cur.execute(
            """
            SELECT chunk_id, call_id, owner_user_id, chunk_index, content,
                   embedding <=> %s::vector AS dist
            FROM call_rag_chunks
            WHERE owner_user_id = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec, owner_user_id, vec, top_k),
        )
    return cur.fetchall()


def main() -> None:
    load_dotenv(REPO_ROOT / ".env")
    load_dotenv(SAURON_ROOT / ".env")

    parser = argparse.ArgumentParser(
        description="Query call RAG chunks via pgvector; --name filters by rep, --admin searches all."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--name",
        dest="rep_name",
        metavar="REP",
        help="Rep display name (matches owner_user_id / rep_name from ingest)",
    )
    mode.add_argument(
        "--admin",
        action="store_true",
        help="No owner filter (search entire index)",
    )
    parser.add_argument(
        "-q",
        "--query",
        help="Question text (use this if you do not want trailing words)",
    )
    parser.add_argument(
        "question",
        nargs="*",
        help="Question words after flags (ignored if --query is set)",
    )
    parser.add_argument("--top-k", type=int, default=18, help="Chunks to retrieve (more = broader context)")
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Print retrieval only (skip chat completion)",
    )
    parser.add_argument(
        "--chat-model",
        default=os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini").strip(),
        help="OpenAI chat model for the answer",
    )
    args = parser.parse_args()

    q_parts = [p for p in args.question if p.strip()]
    if args.query and args.query.strip():
        question = args.query.strip()
    elif q_parts:
        question = " ".join(q_parts).strip()
    else:
        parser.error("Provide a question via --query \"...\" or as trailing words after the flags.")

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required.")

    embed_model = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()

    try:
        from openai import OpenAI
        import psycopg
        from pgvector.psycopg import register_vector
    except ImportError as e:
        raise SystemExit(f"Missing dependency: {e}. pip install -r requirements-rag-ingest.txt")

    conninfo = build_conninfo()
    client = OpenAI(api_key=api_key)

    print("Embedding question...", flush=True)
    vec = embed_query(client, embed_model, question)

    print("Retrieving...", flush=True)
    with psycopg.connect(conninfo, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            ensure_extension(cur)
        conn.commit()
        register_vector(conn)
        with conn.cursor() as cur:
            rows = retrieve(
                cur,
                vec,
                admin=args.admin,
                owner_user_id=args.rep_name if not args.admin else None,
                top_k=args.top_k,
            )

    owners_in_hits = sorted({r[2] for r in rows})
    mode_label = "admin (no filter)" if args.admin else f"name={args.rep_name!r}"
    print()
    print("=== Retrieval ===")
    print(f"mode: {mode_label}  |  top_k={args.top_k}  |  hits={len(rows)}")
    print(f"distinct owner_user_id in hits: {owners_in_hits}")
    print()

    for i, (chunk_id, call_id, owner, idx, content, dist) in enumerate(rows, 1):
        preview = (content or "").replace("\n", " ")[:220]
        print(f"--- [{i}] chunk_id={chunk_id} call_id={call_id} rep={owner} idx={idx} dist={dist:.4f}")
        print(f"    {preview}...")
        print()

    if not rows:
        print("No chunks matched (empty index or wrong filter?).")
        return

    if args.no_llm:
        return

    context_blocks = []
    for chunk_id, call_id, owner, idx, content, _dist in rows:
        context_blocks.append(
            f"[{chunk_id}] call_id={call_id} rep={owner} chunk_index={idx}\n{content}"
        )
    context = "\n\n---\n\n".join(context_blocks)

    if args.admin:
        scope_block = (
            f"[Scope] Admin retrieval: top matches across all reps. "
            f"Reps in this excerpt set: {', '.join(owners_in_hits) or '(none)'}. "
            "Only compare reps when both appear here."
        )
    else:
        scope_block = (
            f"[Scope] Single-rep filter: only excerpts for **{args.rep_name}** — other reps were not searched. "
            "If the question needs another rep or a comparison, say to use --admin or switch --name; "
            "do not speculate about reps outside this scope."
        )

    system = (
        "You are Oz reviewing synthetic Russin Lumber-style sales call transcripts. "
        "Ground answers ONLY in the excerpts. Be concise. "
        "If excerpts do not support an answer: one short paragraph, no 'Missing information' section headers, "
        "no stiff 'Therefore I cannot' phrasing. Respect [Scope] literally. "
        "Cite call_id when referencing calls."
    )
    user_msg = f"{scope_block}\n\nExcerpts:\n\n{context}\n\n---\n\nQuestion: {question}"

    print("=== Answer (LLM) ===")
    comp = client.chat.completions.create(
        model=args.chat_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.15,
    )
    print(comp.choices[0].message.content or "")
    print()


if __name__ == "__main__":
    main()
