-- Track A — kb_sources + kb_rag_chunks (idempotent). See docs/wiki-kb/track-a-raw-ingest.md §1–3.

CREATE EXTENSION IF NOT EXISTS vector;

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
  CONSTRAINT kb_sources_status_check CHECK (
    status IN ('pending', 'extracting', 'embedding', 'ready', 'failed', 'removed')
  )
);

CREATE INDEX IF NOT EXISTS kb_sources_status_idx ON kb_sources (status);
CREATE INDEX IF NOT EXISTS kb_sources_sha_idx ON kb_sources (sha256);

CREATE TABLE IF NOT EXISTS kb_rag_chunks (
  chunk_id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES kb_sources (source_id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'global',
  locator text NOT NULL DEFAULT '',
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_rag_chunks_status_check CHECK (status IN ('ready', 'removed'))
);

CREATE INDEX IF NOT EXISTS kb_rag_chunks_source_idx ON kb_rag_chunks (source_id);
CREATE INDEX IF NOT EXISTS kb_rag_chunks_scope_idx ON kb_rag_chunks (scope);

CREATE INDEX IF NOT EXISTS kb_rag_chunks_embedding_hnsw_cosine
  ON kb_rag_chunks USING hnsw (embedding vector_cosine_ops);
