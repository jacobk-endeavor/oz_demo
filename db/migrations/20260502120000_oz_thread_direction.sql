-- Per-thread task direction (§10.4, §12.1.4). Scoping: (thread_id, tenant) — matches
-- conversation_id + tenant style used with memoryAdapters / chat context.

CREATE TABLE IF NOT EXISTS oz_thread_direction (
  thread_id text NOT NULL,
  tenant text NOT NULL,
  direction_text text NOT NULL DEFAULT '',
  structured_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  set_at timestamptz NOT NULL DEFAULT now(),
  set_by text,
  PRIMARY KEY (thread_id, tenant)
);

CREATE INDEX IF NOT EXISTS oz_thread_direction_tenant_set_at_idx ON oz_thread_direction (tenant, set_at DESC);
