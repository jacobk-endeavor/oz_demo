# Track D — Data Lake Integration (forward-looking)

How the architecture extends when the structured-data layer is no longer a few JSON files at the repo root, but live tables, views, and pipelines in a cloud data warehouse — Snowflake, BigQuery, Databricks, Redshift, or Iceberg/Delta on object storage.

This is a **future-state design**, not a v1 spec. It exists to make sure Tracks A/B/C don't bake in assumptions that block the move to a real data lake. Where Track D differs from the current design, the difference is called out and a v1 → vN path is sketched.

## Why this needs its own track

Tracks A–C assume two things that break at warehouse scale:

1. **Data fits on disk and in memory.** `product_catalog.json` is 3,692 SKUs / ~45K lines. A real catalog is millions of rows split across SKU, inventory, pricing, and ordering tables. Loading it into a process is no longer free.
2. **Sources are static enough to ingest once and refresh occasionally.** Warehouse data is continuous: tables update via Snowpipe / CDC / scheduled jobs. "Ingest the file, embed it, done" stops applying.

Three new realities at this scale:

- **Live queries replace static caches.** Tools issue SQL at chat time for fast-changing data; only slow-moving reference data still gets materialized.
- **The schema itself is the knowledge graph.** Hundreds of tables with relationships, owners, lineage, freshness, and access policies. The wiki layer becomes (de facto) a data catalog.
- **Cost is in the loop.** A single warehouse query can cost cents to dollars. Composite tools that fan out across substrates need cost budgets, not just latency budgets.

The wiki layer is *more* valuable here, not less. Data lakes are notoriously under-documented; the wiki Ingest Agent's discipline of "compile, cite, contradict" is exactly what's missing from most data catalog tools.

## What changes (vs. Track A's file-based ingest)

| Dimension | File-based (Tracks A–C) | Warehouse-backed (Track D) |
| --- | --- | --- |
| Source location | `raw/` on disk | Snowflake / BigQuery / Iceberg tables |
| Ingestion shape | hash → extract → chunk → embed → upsert | snapshot OR live-query, plus schema introspection |
| Refresh trigger | file mtime / `kb.refreshed` event | warehouse change-feed / scheduled view / CDC |
| Citation form | `[catalog:sku=...]` against in-memory JSON | `[snowflake:db.schema.table:key=...]` against live or cached tables |
| Cost | embedding API only | warehouse compute + embedding + query latency |
| Permissions | repo-level (file readable or not) | row/column-level (warehouse RBAC, masking policies) |
| Schema evolution | manual `kb_schemas/*.schema.json` PRs | live INFORMATION_SCHEMA introspection + automated diffing |

Tracks A–C don't go away; they handle documents (PDFs, PPTX, MD) just as before. Track D adds parallel paths for warehouse-shaped data.

---

## Extended citation grammar

The grammar in Track B/C generalizes. Add four new forms; the rest stay identical and resolvable.

| Form | Resolves to | Use for |
| --- | --- | --- |
| `[snowflake:<db>.<schema>.<table>:key=<value>]` | one row in a warehouse table | a specific SKU's live inventory, a customer's record |
| `[snowflake:<db>.<schema>.<table>]` | the table as a whole (schema + recent stats) | "according to the orders table" |
| `[snowflake:<db>.<schema>.<view>]` | a logical view (which is a saved query) | citing a derived metric definition |
| `[snowflake:query:<query_hash>]` | a specific SQL query result captured at time T | analytical answers ("Q1 cross-sell rate was 14% [snowflake:query:abc123]") |
| `[lineage:<asset>]` | a lineage record (asset + upstream/downstream) | "this dashboard depends on these three tables" |

`<db>.<schema>.<table>` is the canonical fully-qualified name. Other warehouses (BigQuery: `project.dataset.table`; Iceberg: `catalog.namespace.table`) get their own prefix (`bq:`, `iceberg:`) following the same shape.

**Properties preserved from Track B/C:**

- Deterministic resolution.
- Verifiable via Lint Agent.
- Stable across regenerations as long as the table/key still exists.
- Mixable: `[snowflake:retail.sales.orders:key=12345]` + `[doc:abc123_p007]` + `[[wiki:concepts/q1-pipeline]]` in one claim.

**New property:**

- **Time-travel-resolvable.** A `[snowflake:query:<hash>]` citation can be replayed at the original `as_of` timestamp using Snowflake's time-travel feature. Answers stay reproducible even when underlying data has since changed.

---

## Track A extensions — connector + ingestion modes

### 1. Warehouse connector (`kb_warehouses/`)

A connector definition per warehouse instance, parallel to `kb_schemas/` for static JSONs:

```
kb_warehouses/
├── russin-prod-snowflake.yaml       # connection, role, default warehouse
├── analytics-bq.yaml                # alternative warehouse
└── russin-prod-snowflake.contracts/ # what the system is allowed to read
    ├── catalog.contract.yaml
    ├── recommendations.contract.yaml
    └── orders.contract.yaml
```

The contract files define:

- **Tables / views** the system may read.
- **Refresh strategy** per asset: `materialize-daily`, `materialize-on-change`, `live-only`, `cached-with-ttl`.
- **Column allowlist** (which columns leave the warehouse — keeps PII out of embeddings).
- **Row filters** (e.g. `WHERE region = 'US'`).
- **Per-asset cost budget** (max compute units per hour against this asset).

Connection credentials live in environment variables; contracts are version-controlled. The split is deliberate — schemas live with the codebase; secrets don't.

### 2. Three ingestion modes

The chat layer asks a question; depending on the asset's contract, one of three paths runs:

#### Mode A: materialize-and-ingest (the v1 pattern, generalized)

For slow-changing reference data — product hierarchies, store lists, reps, dimension tables.

1. Scheduled job (cron / Snowflake Task / Airflow) runs a SQL query and emits JSON.
2. JSON lands in `raw/warehouse/<asset>.json`.
3. Track A's existing structured-data extractor picks it up via the schema registry.
4. Citations resolve as `[catalog:...]` exactly like today.

This mode preserves everything Track A already does. Slow-changing warehouse data becomes static JSON on a cadence; the rest of the pipeline doesn't notice the difference.

**When to use:** asset changes ≤ daily, total size < ~100MB after extraction, queries don't need real-time data.

#### Mode B: live query (new)

For fast-changing data — current inventory, today's pricing, in-flight orders.

- Tool calls (`snowflake_get`, `snowflake_query` — see Track C extensions) issue SQL at chat time.
- Results cached for the turn, never embedded into pgvector.
- Citations are `[snowflake:<fqn>:key=<id>]` — resolvable on click via a fresh query (or via time-travel for historical reproducibility).

The structured-data substrate becomes federated: some records live in pgvector chunks (from materialized snapshots), some are queried live, citation grammar covers both.

**When to use:** asset changes intra-day, requires real-time correctness, OR is too large to materialize.

#### Mode C: cached-with-ttl (hybrid)

For medium-pace data with bursty access patterns.

- First query of the day → live SQL → cache result keyed on the query hash.
- Subsequent identical queries within TTL (default 1 hour) → cache hit, no warehouse cost.
- Cache evicted on TTL or on warehouse change-feed if available.

Implementation: a small key-value store (Redis or Postgres). Cache entries carry the `as_of` timestamp so the citation `[snowflake:query:<hash>]` remains time-travel-resolvable.

**When to use:** asset queried frequently with the same parameters; freshness constraint is "minutes, not seconds."

### 3. Schema discovery (continuous)

A scheduled agent runs `INFORMATION_SCHEMA` introspection against the warehouse and produces a manifest:

```yaml
warehouse: russin-prod-snowflake
captured_at: 2026-05-15T03:00:00Z
databases:
  - name: RETAIL
    schemas:
      - name: SALES
        tables:
          - name: ORDERS
            row_count: 12_438_201
            row_count_change_30d: +482_113
            columns:
              - name: ORDER_ID
                type: VARCHAR(20)
                pk: true
              - name: CUSTOMER_ID
                type: VARCHAR(20)
                fk: RETAIL.CUSTOMERS.CUSTOMER.CUSTOMER_ID
              ...
            last_modified: 2026-05-14T22:13:00Z
            owner: data-platform@russin
        views:
          - name: V_ORDERS_LAST_30D
            depends_on: [RETAIL.SALES.ORDERS]
            ...
```

This manifest goes into `kb_extracts/<warehouse_id>/` and follows Track A's existing event flow. The wiki Ingest Agent's new `data-asset` playbook (Track B extension) consumes it.

### 4. dbt / catalog metadata integration

If the warehouse is fronted by dbt (or Snowflake's native catalog, Atlan, DataHub, etc.), those carry table descriptions, column docs, tests, and lineage. The connector ingests them as a sibling source:

- `dbt manifest.json` and `catalog.json` are first-class structured-data sources (they fit the existing `structured-data` doc_kind perfectly).
- `models/<...>.yml` descriptions become source-page content for the corresponding wiki data-asset entity.
- dbt tests' pass/fail history becomes data quality signal on entity pages.

This is leverage: dbt projects already document the warehouse; the wiki layer should consume those docs rather than re-derive.

---

## Track B extensions — data-asset entity pages

### New wiki layout

```
wiki/
└── entities/
    └── data/
        └── <warehouse>/
            └── <database>/
                └── <schema>/
                    ├── <table>.md          # one per table
                    └── <view>.md           # one per view
└── concepts/
    └── queries/
        └── <slug>.md                       # frequently-run / canonical queries
    └── metrics/
        └── <slug>.md                       # business metrics + their definitions
```

Data-asset entity pages have specific frontmatter:

```yaml
---
type: entity
subtype: data-asset
slug: russin-prod/retail/sales/orders
title: RETAIL.SALES.ORDERS
warehouse: russin-prod-snowflake
fqn: RETAIL.SALES.ORDERS
asset_kind: table | view | materialized_view | external_table
row_count: 12438201
last_modified: 2026-05-14T22:13:00Z
freshness_sla: 1h
owner: data-platform@russin
upstream: []                               # for views: source tables
downstream: [retail/sales/v-orders-last-30d, ...]
column_count: 18
sensitive_columns: [CUSTOMER_ID, BILLING_ADDRESS]
created: 2024-03-12
updated: 2026-05-15                        # auto by Schema Discovery Agent
source_count: 3                            # docs/queries that reference this asset
---
```

Body sections (template enforced by the `data-asset` playbook):

- **Purpose** — what this table represents in the business.
- **Columns** — table of name, type, description, examples, sensitivity.
- **Lineage** — upstream + downstream as wiki links.
- **Common queries** — links to `concepts/queries/<slug>.md` pages that hit this asset.
- **Quality signals** — recent dbt test results, row-count drift alerts.
- **History** — schema changes over time (new columns, type changes, deprecations).

### New Ingest Agent playbook: `data-asset`

Triggered when the schema discovery manifest lands. For each table/view:

1. Compare against existing wiki entity page (if any) via Diff Agent.
2. Generate or update the page from the manifest.
3. Cross-reference with dbt model docs if present — pull descriptions and column comments into the page body.
4. Surface schema changes as `> CONTRADICTION` blocks: "Column `region_code` type changed from `VARCHAR(3)` to `VARCHAR(8)` on 2026-05-12; downstream queries citing this column may need review."
5. Update the table's `downstream` list by walking the warehouse's lineage graph.

**Schema-change handling is the load-bearing piece.** When a column is renamed/dropped, every wiki page citing that column gets flagged. This is precisely what data warehouse documentation usually misses.

### New concept type: queries (saved analyses)

A query that's been run multiple times by the chat agent gets promoted to `concepts/queries/<slug>.md`. Page contents:

```yaml
---
type: concept
subtype: query
slug: top-skus-by-quarter
title: Top SKUs by sales per quarter
sql_hash: abc123def456
parameters: [quarter, top_n]
last_run: 2026-05-14
run_count: 47
warehouses_touched: [russin-prod-snowflake]
assets_touched: [RETAIL.SALES.ORDERS, RETAIL.PRODUCT.CATALOG]
typical_cost_credits: 0.04
---
```

The body has the SQL (with parameter placeholders), expected output shape, recent answer snapshots with citations.

This is the "compounding query" mechanism. Repeated questions don't get re-derived; they live as concept pages with stable citations.

### New agent: Schema Diff Agent

A specialization of Diff Agent for data assets. Same edit-locality discipline (one section at a time), but its inputs are warehouse schema manifests rather than document chunks.

Triggers on every Schema Discovery run. Specific responsibilities:

- **Column added** → append to the Columns table; flag in `## History`.
- **Column dropped** → mark the column row as `deprecated: <date>`; do NOT remove. Walk downstream — find every query, dashboard, and wiki page citing this column and flag them.
- **Type changed** → `> CONTRADICTION (data type)` block; potentially impactful, surface.
- **Row count drift** beyond ±10% in 24h → quality signal, not a contradiction; logged in the page's quality section.
- **New table appears** → create stub entity page, queue for Ingest Agent enrichment if dbt docs are available.
- **Table renamed** → handled like Curator's merge: redirect stub at old path.

### Lineage as wiki edges

The wiki's `related:` frontmatter mirrors warehouse lineage. This means:

- Reading a wiki page for a downstream asset shows "depends on" links upstream.
- Reading a wiki page for an upstream asset shows "used by" links downstream.
- The Lint Agent verifies that lineage edges in the wiki match the warehouse's reported lineage; mismatches are flagged.

When the user asks "what would break if I drop `RETAIL.PRODUCT.CATALOG`?", the chat agent walks the wiki's lineage graph + asks the warehouse for its independently-derived lineage; both should agree, and disagreement is itself a finding worth surfacing.

### The wiki becomes a data catalog (de facto)

This is the punchline of Track D. By the time the warehouse has been integrated, the wiki contains:

- A page per table, view, and saved query.
- Lineage as bidirectional links.
- Quality signals (dbt tests, freshness, row-count drift).
- Cost signals (typical credits per query).
- Synthesis (`concepts/queries/<slug>.md`, `synthesis.md`'s "data trends" section).
- Cross-references between data assets and the document corpus (a brochure mentions a SKU; the SKU's catalog row links to the inventory table; the inventory table's wiki page links back to the brochure).

This is what every data catalog tool tries to be — Atlan, DataHub, Collibra, Alation. The difference: this wiki *also* contains the documents, the calls, and the synthesis. The data catalog and the knowledge base aren't separate; they're the same artifact.

---

## Track C extensions — SQL-aware tools

### New Layer 1 tools (retrieval extensions)

#### `snowflake_get(fqn, key)` — fetch one row
- `fqn`: `database.schema.table`.
- `key`: primary key value (or composite as a dict).
- Returns: `{...row_columns, citation: "[snowflake:<fqn>:key=<value>]", as_of: "<iso>"}`.
- Respects column allowlist from the contract.
- Subject to the asset's cost budget (typically a single-row lookup is cheap).
- Use for: "look up the live inventory for SKU X."

#### `snowflake_query(sql, parameters?, mode?)` — run an analytical query
- `sql`: parameterized SQL.
- `parameters`: dict for safe binding.
- `mode`: `live | cached`. `cached` honors the asset's TTL.
- Returns: `{rows: [...], row_count, columns, citation: "[snowflake:query:<hash>]", as_of, cost_credits}`.
- Hard rule: SQL must reference only assets in the contract. Anything else → reject.
- Use for: aggregations, joins, time-windowed analytics that the warehouse should compute.

#### `lineage_for(asset, direction?)` — traverse lineage
- `direction`: `upstream | downstream | both` (default `both`).
- Returns the lineage subgraph as `{nodes: [{fqn, asset_kind, last_modified}], edges: [{from, to, via?}]}`.
- Use for: "what feeds this dashboard?", "what would break if X changes?"

#### `nl_to_sql(question, schema_hint?)` — natural language → SQL
- Returns `{sql, parameters, estimated_cost_credits, assets_referenced, confidence}` *without executing*.
- Always presented for review (or as a tool result the agent reasons about) before `snowflake_query` is called.
- Cites the schema introspection manifest so generated SQL only references columns that exist.
- Use for: "show me cross-sell rate by region last quarter" — a question Layer 2's static tools can't answer because the data isn't materialized.

### Layer 2 tool extensions

The existing `catalog_*` and `recommendations_*` tools become **federated** — they read from the static JSON or from Snowflake transparently, picked by the contract's refresh strategy:

```python
catalog_get(sku) →
  if contract(catalog).mode == "materialize-and-ingest":
    in-memory dict lookup (today's behavior)
  elif contract(catalog).mode == "cached-with-ttl":
    cache lookup, fall through to snowflake_get
  elif contract(catalog).mode == "live-only":
    snowflake_get directly
```

The chat agent's prompt doesn't change — `catalog_get(sku)` works the same way. Plumbing underneath shifts.

### Layer 3 composite tool extensions

#### `product_dossier` (extended)
- Now includes a **live data** section: latest inventory, current pricing, recent order velocity from Snowflake.
- Cost-budgeted: caller can specify `max_cost_credits` (default 0.05). If the dossier would exceed, live-data section is skipped and the dossier carries `degraded: { reason: "cost_budget", missing: ["live_inventory"] }`.

#### `compare` (extended)
- For data-asset targets (compare two tables, two views, two metric definitions), uses `wiki_compare` over the data-asset entity pages + warehouse INFORMATION_SCHEMA diff.

#### `data_provenance(claim)` — new
- Given a citation or a claim with citations, returns the full provenance chain: doc/call/wiki citations + warehouse lineage from the cited tables down to source systems.
- Use for: "where did this number come from, all the way back?"
- Outputs a tree the chat UI renders as a collapsible panel.

### Cost-aware tool selection

The decision rules (Track C) get a cost dimension:

```
question is about:
  ...
  a real-time numeric fact         → snowflake_query (with cost estimate first)
  a historical analytical answer   → first wiki/concepts/queries lookup,
                                     fall back to snowflake_query if not cached
  an aggregation across tables     → nl_to_sql → review → snowflake_query
```

Heuristic: prefer wiki/concepts/queries pages over re-running queries. A canonical query that's been promoted to a wiki page has its last result cached, its cost amortized, its definition reviewed. Re-running it costs money for typically the same answer.

### Caching strategy

Three-tier cache for Snowflake-shaped data:

1. **Tool-call cache** (per-turn) — within one chat turn, identical queries return the same result. Cleared at turn end.
2. **TTL cache** (cross-turn, time-bounded) — per the asset's contract TTL. Default 1 hour for analytical queries, 5 minutes for inventory-class queries.
3. **Concept-page cache** (cross-session, indefinite) — `concepts/queries/<slug>.md` carries the last-good answer. Invalidated when a Schema Diff Agent change touches one of the query's referenced columns.

Citations remain stable across all three tiers because `[snowflake:query:<hash>]` resolves to the *query plus an as_of timestamp*, not just the result.

---

## Cross-cutting concerns

### Cost

- Every Snowflake tool call returns `cost_credits` in its result.
- Composite tools propagate cost to the caller.
- The chat agent has a per-session cost budget (default $1, configurable). Approaching the budget, the agent surfaces "running low" and asks before continuing.
- Daily / monthly budgets per warehouse contract; exceeded budgets disable that warehouse for the rest of the period.

### Freshness and time-travel

- Every Snowflake citation carries `as_of: <iso>` so answers stay reproducible.
- For point-in-time questions ("what was Q1 cross-sell rate?") the chat agent uses Snowflake's `AT(TIMESTAMP => '...')` syntax automatically.
- The wiki's `concepts/queries/<slug>.md` pages always record `last_run_as_of` so re-runs are explicit ("data is from 14 days ago — refresh?").

### Permissions / RBAC

- The chat agent connects to Snowflake with a least-privilege role declared in the warehouse contract.
- Row-level / column-level policies in Snowflake apply transparently — a masked column comes back as `***`, and the chat agent treats `***` as "unavailable, redacted" rather than fabricating.
- Per-user scoping (where applicable): the chat agent can pass a `caller_user_id` to Snowflake so queries respect per-user row filters defined in the warehouse.

### PII / masking

- The column allowlist in each contract is the primary defense — sensitive columns simply never leave the warehouse.
- For data that *must* leave (e.g., a customer name shown in chat), Snowflake masking policies are respected and the chat layer reads the masked value.
- Materialized snapshots (`raw/warehouse/<asset>.json`) are subject to the same allowlist; PII never lands in `kb_extracts/` or pgvector embeddings.

### Multi-warehouse federation

The same architecture supports multiple warehouses simultaneously — `russin-prod-snowflake` for transactional data, `analytics-bq` for clickstream, `iceberg-on-s3` for archived history. Citations carry the warehouse prefix; tools dispatch to the right connector. The wiki's `entities/data/<warehouse>/...` layout already accommodates this.

---

## Phased rollout

### Phase 1 — One materialized asset (no live queries)

Pick the lowest-risk reference table (e.g., a product hierarchy that changes weekly). Run a scheduled job that exports it to `raw/warehouse/product_hierarchy.json`. Add the schema. Track A ingests it the same way it ingests `product_catalog.json` today. **No chat-layer changes required.**

This phase validates the materialize-and-ingest mode end-to-end and produces the first warehouse-sourced wiki entity pages.

### Phase 2 — Schema discovery

Add the connector + schema discovery agent. Generate read-only data-asset entity pages for every allowed table. The chat agent can answer "what tables exist?" and "what columns does X have?" without ever running a SQL query. Documentation-mode only.

### Phase 3 — Live-query tools (`snowflake_get`)

Single-row lookups against contracted assets. Budget tightly. The chat agent gets `live_inventory_for(sku)` and similar narrow tools. No `snowflake_query` yet — keep the surface tiny.

### Phase 4 — Analytical queries (`snowflake_query` + `nl_to_sql`)

Open the door to ad-hoc analytical questions. `nl_to_sql` always runs first and the SQL is reviewed (or auto-approved if the asset and cost are within tight bounds).

### Phase 5 — Saved-query promotion

Curator Agent starts promoting frequently-run queries to `concepts/queries/<slug>.md`. The wiki begins to function as a metric/query catalog.

### Phase 6 — Lineage and impact analysis

Schema Diff Agent goes live. Schema changes in the warehouse propagate to `> CONTRADICTION` blocks across the wiki. The "what would break if X changes?" question becomes answerable.

### Phase 7 — Cross-substrate composite

`product_dossier` includes live data, document context, wiki synthesis, AND warehouse provenance in one answer. `data_provenance` traces any cited number back to source systems. This is the steady state.

Each phase is independently shippable; each phase compounds value on the prior. None of them require revisiting Tracks A–C — the existing primitives extend.

---

## Q&A — load-bearing decisions

### §0 Architecture

**Q. Does Track D replace Track A's structured-data path or extend it?**
Extend. Static JSON ingestion stays the default for slow-moving reference data. Live SQL is reserved for assets that genuinely need it. Federation is the goal, not migration.

**Q. Should we depend on a specific warehouse vendor?**
No. The connector layer (`kb_warehouses/<name>.yaml` + adapter) abstracts the dialect. v1 connector targets Snowflake because it has the cleanest INFORMATION_SCHEMA + Time Travel; BigQuery / Databricks / Iceberg follow the same shape with different SQL.

### §1 Citation grammar

**Q. Why not embed live SQL results into pgvector?**
Two reasons: cost (re-embedding on every change is wasteful) and reproducibility (a static embedding can drift from the source while the chat agent thinks it's authoritative). Live data is cited by `[snowflake:...]`; only stable, slow-moving data gets embedded.

**Q. What guarantees does `[snowflake:query:<hash>]` have?**
The hash is over the canonicalized SQL + parameters + `as_of` timestamp. As long as the warehouse retains time-travel data covering that timestamp (default 1 day for Snowflake standard, longer for enterprise), the result is reproducible. Past the time-travel window, the citation resolves with a `(time-travel expired, last cached result shown)` marker.

### §2 Ingestion modes

**Q. How is the right mode chosen per asset?**
Declared in the contract, not auto-detected. A human (data engineer or Curator Agent suggestion accepted by a human) sets `mode: materialize-and-ingest | cached-with-ttl | live-only` per asset. Wrong defaults are expensive — explicit declaration prevents surprise costs.

**Q. What if the warehouse has no dbt / catalog metadata?**
The wiki Ingest Agent still generates entity pages from INFORMATION_SCHEMA alone — they're sparser (no descriptions, no upstream lineage), but functional. The Lint Agent flags pages with empty Purpose sections so humans (or the LLM, on prompt) can fill them in incrementally.

### §3 Wiki layer

**Q. Won't this balloon the wiki to thousands of data-asset pages?**
Yes if every table gets one. Mitigation: the contract's column allowlist applies to *whether the table gets a wiki page at all* by default. Only tables explicitly contracted get pages. Lazy expansion (per Track B's lazy SKU pages) applies — uncontracted tables get a stub only when queried.

**Q. How do schema changes propagate?**
Schema Diff Agent runs after every Schema Discovery pass. Drops/renames/type-changes flag every wiki page that cites the affected column. Adds are non-disruptive (just append to the columns table). The Lint Agent's "broken citation" check covers warehouse columns the same way it covers chunk_ids.

**Q. Does saved-query promotion create wiki spam?**
Curator only promotes queries that meet a threshold: run ≥ 5 times across ≥ 3 sessions, or explicitly named by a user ("save this as a metric"). Below the threshold, queries live in `log.md` and on the originating session — discoverable but not formalized.

### §4 Tools and chat

**Q. Should the chat agent ever execute SQL it generated itself, without review?**
Conservative default: no. `nl_to_sql` produces SQL; `snowflake_query` executes it. The agent's flow is generate → review (against contract + cost estimate) → execute. Auto-execute is allowed only when: (a) all referenced assets are contracted, (b) estimated cost < $0.01, (c) no `WHERE` clause references columns flagged sensitive. Otherwise the agent surfaces the SQL and asks.

**Q. How do live-query results stay consistent within one chat turn?**
Tool-call cache (turn-scoped). The first `snowflake_get(sku=X)` in a turn caches; subsequent calls in the same turn return the cached row. New turn → fresh data. This avoids the "the price changed mid-answer" failure mode without making every answer a multi-turn dialog.

**Q. What's the budget enforcement granularity?**
Three layers: per-tool-call (estimate-then-execute), per-session (cumulative budget), per-warehouse-per-day (hard cap from contract). Exceed any → graceful degrade: composite tools drop the live-data section, return what's already gathered, mark `degraded`. Never silent.

### §5 Migration path

**Q. What changes in Tracks A–C when Track D ships?**
- **Track A**: chunk table gains `meta.warehouse_origin` for chunks materialized from warehouse queries (used by the soft-delete path on schema change). Otherwise unchanged.
- **Track B**: new playbook (`data-asset`), new agent (Schema Diff). Existing Diff/Linker/Curator/Synthesizer/Lint unchanged in scope.
- **Track C**: tools added; existing tools' implementations become federation-aware but signatures stay backward-compatible.

The interface contracts hold. Track D is purely additive.

**Q. Can Phase 1 (materialize-and-ingest) ship without any of Track D's tooling?**
Yes — and that's the point. A scheduled query that emits JSON to `raw/warehouse/` works with today's Track A as-is. Phases 2+ require new code, but the v1 design doesn't block them.

---

## Why this works

- **Federation, not migration.** Documents, calls, JSONs, and warehouse tables all live under one citation grammar and one chat agent. Users don't change tools when the data shape changes.
- **The wiki becomes the data catalog.** Documenting the warehouse and documenting the business knowledge are the same act. Today's data-catalog tools are siloed from documents and conversations; this design unifies them.
- **Cost is in the loop.** Every layer is cost-aware; the chat agent surfaces tradeoffs rather than racking up surprise bills.
- **Schema changes don't silently corrupt answers.** Schema Diff Agent + the broken-citation Lint check make warehouse evolution visible across the wiki.
- **Time-travel preserves reproducibility.** Citations resolve to *the query at the moment it was asked*, not just to the live state.
- **Phased rollout.** Each phase ships independent value. The architecture commits to a destination but doesn't require a moonshot to start.
