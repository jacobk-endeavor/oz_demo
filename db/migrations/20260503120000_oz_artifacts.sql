-- Chat artifacts metadata (§6.1, §11.4, §12.2.4). Bytes live in Spaces; this table is
-- the id / tenant / key / integrity source of truth. status: active → read may set lost
-- if the object is missing; the repair job tombstones rows when HEAD fails (last N days only).

CREATE TABLE IF NOT EXISTS oz_artifacts (
  id uuid PRIMARY KEY,
  tenant text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL DEFAULT '',
  key text NOT NULL,
  sha256 text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'tombstone')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ttl_at timestamptz
);

CREATE INDEX IF NOT EXISTS oz_artifacts_tenant_created_at_idx
  ON oz_artifacts (tenant, created_at DESC);

CREATE INDEX IF NOT EXISTS oz_artifacts_created_at_idx
  ON oz_artifacts (created_at DESC);
