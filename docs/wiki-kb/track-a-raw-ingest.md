# Track A — Raw File Ingest Pipeline

Generalize the call-ingestion pattern in [calls/sauron/scripts/ingest_calls_pgvector.py](../../calls/sauron/scripts/ingest_calls_pgvector.py) so any source file (PDF, Excel, text, image) can be programmatically ingested into pgvector with the same chunk → embed → upsert tail.

This is the **raw substrate** layer. It produces searchable chunks. Synthesis happens in Track B.

## Goals

- Same shape as call ingest: deterministic chunk IDs, idempotent upserts, HNSW + cosine, schema check before paying for embeddings.
- One CLI handles a file or a directory tree.
- Per-format extractors are pluggable; everything downstream is shared.
- Re-runs are safe and cheap (sha256-keyed).

## Components

### 1. Source registry — `kb_sources` table

Tracks every file the pipeline has seen.

```
kb_sources
  source_id      text PRIMARY KEY     -- sha256[:12], content-addressed
  path           text NOT NULL        -- last-known path (for humans)
  sha256         text NOT NULL UNIQUE
  mime           text NOT NULL
  bytes          bigint
  page_count     int                  -- PDFs
  sheet_count    int                  -- Excels
  ingested_at    timestamptz NOT NULL DEFAULT now()
  status         text NOT NULL        -- pending|extracting|embedding|ready|failed
  meta           jsonb NOT NULL DEFAULT '{}'
```

- `source_id = sha256[:12]` makes chunk IDs stable across renames.
- `status` lets long runs resume without redoing work.
- `meta` carries format-specific extras (encryption flag, OCR'd?, original filename).

### 2. Extract artifact — `kb_extracts/<source_id>/`

Persisted output of the extractor, **before chunking**. This is the wiki layer's primary read target (Track B's "view #2"). Chunks are pointers; this directory is the document.

```
kb_extracts/<source_id>/
  manifest.json          # ordered units + chunk_id mapping + extracted metadata
  full.txt               # concatenated text, for end-to-end reading
  unit-page-001.txt      # PDF: one file per page
  unit-page-002.txt
  ...
  unit-sheet-Pricing.csv # Excel: one CSV per sheet
  unit-slide-001.txt     # PPTX: one file per slide (+ speaker notes)
  img/
    page-003-fig-01.png  # extracted images, citable via [image:<path>]
    slide-007.png
```

`manifest.json` is the bridge between the un-chunked extract and the chunks in pgvector:

```json
{
  "source_id": "abc123def456",
  "title": "...",
  "doc_kind": "tech-bulletin",
  "brand": "Deckorators",
  "product_line": "Voyage",
  "year": 2026,
  "distributor_branded": false,
  "units": [
    {
      "locator": "page=1",
      "file": "unit-page-001.txt",
      "chunk_ids": ["abc123_p001_00000", "abc123_p001_00001"],
      "images": ["img/page-001-fig-01.png"]
    }
  ]
}
```

Wiki Ingest Agent reads `unit-page-042.txt` to *understand* page 42, and the manifest tells it which chunk_ids to *cite* for claims sourced from page 42.

### 3. Chunks table — `kb_rag_chunks`

Mirrors `call_rag_chunks` shape so chat tools can query both with one code path.

```
kb_rag_chunks
  chunk_id     text PRIMARY KEY
  source_id    text NOT NULL REFERENCES kb_sources(source_id)
  scope        text NOT NULL DEFAULT 'global'  -- replaces owner_user_id
  locator      text NOT NULL DEFAULT ''        -- "page=42" / "sheet=Pricing rows=40-60"
  chunk_index  int NOT NULL
  content      text NOT NULL                   -- header + body (header is part of embedded text)
  embedding    vector(1536) NOT NULL
  meta         jsonb NOT NULL DEFAULT '{}'
  created_at   timestamptz NOT NULL DEFAULT now()
```

- Same vector dim and HNSW index as the calls table — single embedding model, single retrieval path.
- `scope = 'global'` for KB files; ownership-scoped corpora (calls) keep using their own table.
- The header `[source=<title>][locator=<...>]\n\n` is **part of `content`**, so retrieval brings back self-describing text.

### 4. Document-kind classifier (runs before extraction routing)

Track A doesn't just classify by mime/extension — it also tags each source with a **doc_kind** so Track B's playbooks can branch correctly. The raw corpus shows clear genres that need different treatment.

Observed genres in `raw/` (83 files; 80 PDFs, 2 PPTX, 1 XLSX):

| Genre | Filename signals | Example | Doc_kind |
| --- | --- | --- | --- |
| Brochures / overviews | `Brochure`, `Overview` | `2026deckorators-decking-overview-brochure.pdf` | `marketing` |
| Sell sheets | `Sell Sheet`, `Sales Sheet`, `Sell Sheet_digital` | `Capstone Sales Sheet_041026_digital.pdf` | `spec-sheet` |
| Install guides | `Install Guide`, `Installation Instructions` | `Millboard Decking Install Guide_US.pdf` | `install` |
| Technical bulletins | `Technical Bulletin`, `- Technical Bulletin` | `4 Inch VS 6 Inch Decking - Technical Bulletin.pdf` | `tech-bulletin` |
| Color comparisons | `Color Comparison`, `Color Chart` | `2023 Trex-Deckorators Color Comparison U.S. ...pdf` | `visual-catalog` |
| Master specs | `Master Spec` | `TFP Master Spec Cumaru Wood Decking Lumber and Timbers.pdf` | `master-spec` |
| Line cards / catalogs | `LINE CARD`, `PRODUCT CATALOG`, `Product-Offerings` | `2024 BLACK LABEL PRODUCT CATALOG.pdf` | `catalog` |
| Warranty | `Warranty` | `Evolution Enhanced Warranty MAY 2025.pdf` | `warranty` |
| Presentations | `.pptx`, `Presentation` | `Captivate Presentation 070725.pptx` | `presentation` |
| Tabular references | `.xlsx` (color charts, SKU lists) | `Captivate Color Chart Reference.xlsx` | `tabular-reference` |
| Order / SKU guides | `Order Guide`, `SKU List` | `ALX Contemporary Cable Railing Order Guide.pdf` | `order-guide` |
| Structured analytics | known-schema JSON | `product_catalog.json`, `recommendations.json` | `structured-data` |

The classifier:
1. Inspects filename first (cheap, deterministic).
2. If ambiguous, peeks at the first page / first slide / first sheet header.
3. Records `doc_kind` in `kb_sources.meta.doc_kind` and in `manifest.json`.

Track B's Ingest Agent dispatches on `doc_kind` to choose the right playbook. The agent doesn't re-classify — Track A's classification is authoritative.

Beyond `doc_kind`, the classifier also extracts opportunistic frontmatter from filenames + first page:

```yaml
brand: AZEK | Deckorators | TimberTech | Trex | Fiberon | Millboard | Russin | TFP | ...
product_line: Captivate | Evolution | Black Label | Maximo Thermo | Shadow Line+ | ...
year: 2023..2026
distributor_branded: true   # filenames containing "RUSSIN LOGO" / "with Russin"
```

This is upstream metadata. It's stored in the manifest and mirrored to the wiki source page's frontmatter. Lint and search rely on it.

### 5. File-type extractors

Each extractor turns a file into a list of `(locator, body_text, images?)` tuples. The shared chunker turns those into chunks. Extractors are mime-driven; the doc-kind classifier above is independent and runs in parallel.

#### PDF
- Library: `pypdf` (text-only path) → fallback `pdfminer.six` for layout-sensitive PDFs.
- Yield: `[("page=<n>", page_text)]` per page.
- Chunker: char-window 1400/200 *within* a page; never crosses page boundaries.
- Header injected into embedded text: `[source=<title>][page=<n>]\n\n`.
- Image-only PDFs → flagged `failed` with `meta.reason = "needs_ocr"`. OCR is v2 (Tesseract or hosted vision).

#### Excel
- Library: `openpyxl` (xlsx), `xlrd` fallback for legacy `.xls`.
- Each **sheet** is a logical document. `locator = "sheet=<name>"`.
- Convert sheet → CSV via the same path the frontend uses ([knowledgeBaseTabular](../../frontend/src/features/oz/knowledgeBaseIngest.ts#L52-L59)) so client-side preview and server-side ingest stay consistent.
- Chunking: header row + N body rows per chunk (default `N=20`). The header row is **re-prepended to every chunk** so retrieved fragments are interpretable in isolation.
- `chunk_id = "{source_id}_{sheet_slug}_r{start:05d}_{end:05d}"`.
- A multi-tab workbook → multiple sets of chunks under one `source_id`. `kb_sources.sheet_count` records how many.

#### PowerPoint (.pptx)
- Library: `python-pptx`.
- Each **slide** is a logical unit. `locator = "slide=<n>"`.
- Per slide: title + body text + speaker notes concatenated in that order. Speaker notes are often the highest-signal text in marketing decks.
- Slides with mostly visual content → render slide to PNG (libreoffice / `python-pptx` shape rasterization), save under `img/slide-<n>.png`, run vision-caption pass downstream during wiki ingest.
- Chunker: 1400/200 within a slide; never crosses slide boundaries.
- Header: `[source=<title>][slide=<n>]\n\n`.

#### Text / Markdown
- Pass-through. Use the existing 1400/200 char chunker from the call ingester.
- `locator = ""`.

#### Image
- v1: caption + OCR via vision model → ingest as a single chunk with `meta.kind = "image"` and the original path.
- The wiki/chat layer can render the image inline; the vector store just sees the text.

#### Structured data (JSON, schema-known)

`product_catalog.json` and `recommendations.json` are not text documents — they're normalized data with stable keys. Treating them like PDFs would lose structure. They get a dedicated extractor.

The extractor:
1. Loads the JSON.
2. Validates against a schema registered for that filename (e.g. `product_catalog.schema.json`).
3. Iterates records and emits one `(locator, body_text)` per record:
   - `product_catalog.json` → one unit per SKU + aggregate units per sub-category and product line.
   - `recommendations.json` → one unit per rule (cross-sell rule, upsell row, substitution row).
4. The body text is a **canonical rendering** of the record (small natural-language sentence with key fields), so semantic search works:

```
[catalog:sku=PGFGD]
PALIGHT FLEX GARAGE DOOR TRIM/ WEATHERSTOP — sub-category AT-AT-PMoulding
in product line AT. UoM Each. unit_price ~$22.08, qty_sold 540, total_sales $11,923.20.
```

```
[recs:cross_sell:CD-RC-RCDeck#0]
Cross-sell rule: customers who buy CD-RC-RCDeck also buy RC-RC-RCBoards.
co_invoices=592, confidence=0.144, lift=1.84. Method: invoice-level
co-occurrence at sub-category, min 5 co-invoices.
```

Each unit gets its own `chunk_id` using a structured-data convention (no fixed-width windows): `cat_sku_PGFGD`, `recs_xs_CD-RC-RCDeck_0`, etc. These IDs are stable across regenerations *as long as the keys are stable*.

The locator IS the citation form — `[catalog:sku=PGFGD]`, `[recs:cross_sell:CD-RC-RCDeck#0]`, `[catalog:line=AT]`. Track B and Track C both use this grammar.

Output for structured-data sources: same `kb_extracts/<source_id>/` shape as documents, but `manifest.json` records the schema name and one unit per record. No `full.txt` (the raw JSON is its own canonical form; the extract is its decomposition).

### 6. Schema registry — `kb_schemas/`

Structured-data sources require a schema to ingest. Schemas live as files:

```
kb_schemas/
  product_catalog.schema.json   # JSON Schema for product_catalog.json
  recommendations.schema.json   # JSON Schema for recommendations.json
  product_catalog.render.py     # canonical rendering function (record → body_text)
  recommendations.render.py     # ditto
```

When a structured-data file lands in `raw/`, the extractor matches by filename to a schema. If there's no match, `status=failed` with `meta.reason="no_schema"`. Adding a new structured source = drop a schema + a render function.

### 4. CLI

```
python ingest_kb.py <path-or-dir>
  --type auto|pdf|excel|text|image
  --scope global|<rep|project>
  --reembed                   # force re-embed even if sha unchanged
  --dry-run                   # show what would ingest, no writes
  --on-success emit-event     # fire kb.ingested for Track B
```

Walks the tree, dispatches per mime/ext, idempotent via the registry.

### 7. Idempotency, re-runs, and near-duplicates

- **Hash gate.** Skip files whose `sha256` already exists with `status=ready`.
- **Per-chunk upsert.** `ON CONFLICT (chunk_id) DO UPDATE` (the call ingester's pattern) handles partial rewrites cleanly.
- **`--reembed`.** Clears prior chunks for that `source_id` before re-running. Use when chunking strategy changes.
- **Resumable.** `status=embedding` lets the next run pick up where it left off.

#### Near-duplicate detection (filenames differ, content matches)

The raw corpus contains obvious near-duplicates that don't sha256-match:

- `2023 Azek-Deckorators Color Comparison U.S. 11.21.2022.pdf`
- `2023+Azek-Deckorators+Color+Comparison+U.S..pdf`

Same content from different download paths (URL-encoded `+` vs spaces). Detection layers run after the hash gate:

1. **Filename normalization** — lowercase, strip `+`/whitespace, drop trailing dates, strip parenthetical suffixes. Matches go on a "review" list, not silently merged.
2. **First-page minhash** — if two ingested sources share ≥0.95 first-page minhash, flag as near-duplicate.
3. **Same `(brand, product_line, year, doc_kind)` quadruple already exists** — flag as candidate duplicate.

Track A never auto-merges; it surfaces candidates to Track B's Curator Agent. Two reasons:
- Different watermarks / co-branding (e.g., a "with RUSSIN LOGO" version) is *intentionally* different.
- Year-versioned variants are evolutions, not duplicates. The 2026 brochure superseding a 2023 one is real information.

When a near-duplicate is detected, `kb_sources.meta.near_duplicates: [<source_id>...]` is recorded and the wiki Ingest Agent links them via `supersedes:` / `superseded_by:` frontmatter (Track B).

#### Refresh semantics for structured data

When `product_catalog.json` or `recommendations.json` is regenerated:

1. Compute sha256 of the new file. If unchanged → no-op.
2. If changed: extract new units, diff against the prior version's unit set:
   - **Added records** → embed + insert.
   - **Modified records** → update content + re-embed (only changed records).
   - **Removed records** → mark `status='removed'` on those chunks (don't delete; chat answers may cite history).
3. Emit a `kb.refreshed` event with the diff summary so Track B can update affected wiki entity pages incrementally.

This is the model regular RAG can't do: a structured source that regenerates routinely needs to update *incrementally*, not be re-ingested wholesale.

### 6. Failure modes

| Failure | Behavior |
| --- | --- |
| Encrypted PDF | `status=failed`, `meta.reason="encrypted"`. User passes `--password` and re-runs. |
| Corrupt sheet | That sheet fails; other sheets in the workbook succeed. Workbook ends `status=ready` with `meta.failed_sheets=[...]`. |
| Embedding API rate limit | `status=embedding` persists; resumable on next run. |
| Empty file | Skipped with a one-line warning; not an error. |
| Image-only PDF | `status=failed`, `meta.reason="needs_ocr"`. v2 picks it up. |

### 7. Order of operations

```
discover → hash → register → extract all → chunk → embed (batched) → upsert → mark ready → emit kb.ingested
```

Schema check happens **before** the embedding spend, mirroring the call ingester's discipline.

## Why this shape

- The only new code is per-format extractors and the source registry. Embedding, upsert, and indexing are reused.
- One vector dim and one HNSW index keep retrieval simple — chat tools query `call_rag_chunks ∪ kb_rag_chunks` with one shared SQL shape.
- `source_id = sha256[:12]` makes chunk IDs stable: the wiki can cite `[abc123def456_p042_00003]` and that citation survives renames.

## Open hooks for Track B

When a source moves to `status=ready`, the CLI emits a `kb.ingested` event:

```json
{
  "event": "kb.ingested",
  "source_id": "abc123def456",
  "title": "...",
  "chunk_ids": ["abc123def456_p001_00000", ...],
  "locators": ["page=1", "page=2", ...],
  "extracted_text_path": "/tmp/kb-extract/abc123def456.txt"
}
```

The wiki **Ingest Agent** (Track B) subscribes to that event. That's where compilation begins.

## Out of scope for Track A

- Synthesis, summarization, cross-references — Track B.
- Chat-side retrieval — Track C.
- OCR (v2), audio transcription (use existing call pipeline if needed), DOCX (v2, easy add).

---

## Q&A — answers to the load-bearing questions

Triaged from the design-interrogation question list for this track. Cut criteria: questions that are operational (test methodology, alert thresholds, glob filter UX), premature optimization without a number ("at projected scale"), or already answered by the doc body. The ones below are the questions whose answer changes what you build.

### §0 Scope and goals

**Q. Optimization priority — reliability, throughput, or retrieval quality?**
Reliability first (idempotency, resumability, no silent corruption), retrieval quality second (chunk shape per playbook, header-in-content, structured locators), throughput last. For the 83-file `raw/` corpus, a clean single-pass run completing in < 30 min is plenty; pipeline parallelism isn't needed.

**Q. What does "Track A done" measurably mean?**
- Every file in `raw/` reaches `status='ready'` or `status='failed' + meta.reason`.
- Every emitted citation form (`[doc:...]`, `[catalog:...]`, etc.) resolves O(1) to its underlying record.
- Re-running the CLI on an unchanged tree is a no-op (no embedding spend).
- A failed file's diagnostics are sufficient to fix it without re-running others.

**Q. What from `ingest_calls_pgvector.py` transfers, and what doesn't?**
Transfers: schema-check-before-embedding, ON CONFLICT upsert, batched embeddings, HNSW + cosine, `--reembed`-style overrides. Doesn't: per-rep ownership semantics (KB has `scope`), single-strategy chunking (KB plays per doc_kind), single-file CLI input (KB walks trees + structured), `pending → ready` linear status (KB needs `extracting → embedding → failed/ready`).

### §1 Source registry

**Q. Is `source_id = sha256[:12]` enough?**
Below ~16M sources, collision odds ≈ 0 (birthday math on 12 hex). For this corpus, no concern. If we ever cross 100K, switch to `[:16]`; the column is text and the migration is a backfill.

**Q. Do we need an immutable `original_path` separate from `path`?**
Yes — add `first_seen_path text NOT NULL` set at insert and never updated. `path` reflects the file's last-known location for humans; `first_seen_path` is the audit anchor when a file gets renamed or moved. Cheap to add now, costly to retrofit.

**Q. Formal status transitions?**
```
pending → extracting → embedding → ready
                ↓             ↓
              failed        failed
ready → embedding → ready          (--reembed)
ready → removed                    (soft-delete on file deletion or structured-record removal)
```
No back-edges from `failed` to `ready` without going through `pending` (a re-attempt has to be visible).

### §2 Extract artifact

**Q. Filesystem or object storage for `kb_extracts/`?**
Filesystem for v1 — single host, repo-adjacent, inspectable with `ls`/`cat`/`grep`. Wrap reads/writes behind a tiny `extracts_store` interface so swapping to S3-compatible storage later is a single-file change. Don't write the abstraction yet; just keep the seam.

**Q. Manifest determinism + partial-write handling?**
Extract atomically: write to `kb_extracts/.staging/<source_id>/`, validate manifest is well-formed, then `rename` to `kb_extracts/<source_id>/`. Crashes mid-write leave staging which is GC'd next run. Manifest unit ordering is the extractor's natural order (page 1, 2, 3 …; sheet declaration order; record key order) — deterministic per format and explicit in the array.

**Q. Is `full.txt` always required?**
No. Generated for `marketing|install|tech-bulletin|warranty|order-guide|presentation` (the wiki Ingest Agent reads end-to-end). Skipped for `tabular-reference` and `structured-data` (per-unit files are canonical; concatenation would mislead). The manifest declares whether `full.txt` exists.

**Q. Manifest format versioning?**
Yes: `manifest.json` carries `"manifest_version": 1`. Readers tolerate higher minor versions. Major-version bumps trigger a `--reembed` migration. Costs nothing now, avoids painful retrofits later.

### §3 Chunk table

**Q. Header-in-content for all doc kinds?**
Yes for documents (page/sheet/slide context disambiguates "see table 4"-style chunks). Yes for structured-data (the citation locator IS the header). Marginal but still net-positive for short text — keep consistent.

**Q. Soft-delete for non-structured docs?**
Yes — when a source's status flips to `removed` (file deleted from `raw/`), its chunks aren't dropped; they get `meta.removed_at`. Mirrors structured-data deletion and lets chat/Lint surface broken citations gracefully rather than 404'ing.

**Q. Preventing duplicate chunk IDs across extractor changes?**
Chunk IDs are deterministic functions of `(source_id, locator, slot)`. When extractor logic changes its slot scheme, `--reembed` is mandatory and the upsert step asserts no two new chunks share an ID before writing. Hard fail rather than silent overwrite.

### §4 Doc-kind classifier

**Q. Confidence threshold for auto-accept?**
Filename-driven match → auto-accept (deterministic substring rules). First-page-content fallback → confidence ≥ 0.8 auto-accepts; below that, mark `doc_kind='unknown'` and surface to Track B's Lint Agent for review. Don't fail the ingest — `unknown` is a valid state.

**Q. Required vs opportunistic metadata?**
Required: `doc_kind`. Opportunistic: `brand`, `product_line`, `year`, `distributor_branded`. The Track B Ingest Agent fills opportunistic fields incrementally; missing values are fine.

**Q. Where is Track B's classification override stored?**
`kb_sources.meta.doc_kind_override`, set by `/wiki reingest --playbook=<kind>`. The override pins the choice; future Track A runs respect it.

### §5 Extractors

**Q. PDF fallback `pypdf` → `pdfminer.six`?**
Trigger: `pypdf` extracts a page but average chars/page < 50 (likely garbled). Fall back per-page to `pdfminer.six`. If that also fails the threshold → flag `meta.reason='needs_ocr'`. No quality scoring beyond "did we get text out."

**Q. PPTX speaker notes vs visible text — which dominates?**
Concatenate in order: title → body → notes. Visible text is what the audience sees; notes are the rep's narrative. Both are signal; downstream agents judge salience. Don't suppress one for the other.

**Q. Structured: stable unit IDs when upstream key formats change?**
Unit IDs are derived from declared key fields per schema (`render.py` returns the ID along with the body). Key-format changes bump the schema version; the old version stays around until no `kb_extracts/` reference it; explicit `--reembed` migrates. Don't try to track key migrations cleverly.

### §6 Schema registry

**Q. Who owns schema evolution?**
The owner of the upstream data file. `product_catalog.json` is regenerated by an analytics job; that job's owner owns `product_catalog.schema.json` + `.render.py`. Schemas live in this repo so PRs to data + schema travel together.

**Q. Multiple schema versions in flight?**
Yes — schemas are versioned (`product_catalog.v2.schema.json`). The extractor matches the highest-version schema whose `applies_when` predicate matches the input. Old versions stay until no extracts reference them.

### §8 Idempotency / duplicates

**Q. Hash gate when extractors change but file bytes don't?**
The hash gate is over file bytes, not the extract. Extractor changes propagate via explicit `--reembed`, not via re-hashing. Otherwise we'd re-pay for embeddings every time we tweak a chunker.

**Q. Concrete near-duplicate thresholds?**
- Filename normalization → flag if normalized stems match.
- First-page minhash similarity ≥ 0.95 → flag.
- Same `(brand, product_line, year, doc_kind)` quadruple → flag.
All three annotate `meta.near_duplicates` and notify Track B's Curator. None block `status='ready'`.

### §9 Failure modes

**Q. Retry policy by failure type?**
- Rate-limit / transient API: exponential backoff, max 3 retries within a run.
- Corrupt input: no retry; mark `failed`.
- Encryption / password: no retry; mark `failed`.
- Embedding API outage mid-run: leave at `status='embedding'`, exit cleanly — next run resumes.

**Q. Can one bad source poison a batch?**
No. Per-source try/except; failures mark the row and continue. `--strict` exists for CI when fail-fast is wanted.

**Q. Recovery from partially embedded sources?**
`status='embedding'` is the marker. On resume, drop chunks for that `source_id` (they may be a mix of old and new) and re-run embedding. Cheaper than diffing partial state.

### §10 Events / Track B handoff

**Q. Event schema versioning?**
Yes: `event_version: 1` field on every event. Track B agents check it and fail loudly on unknown versions.

**Q. Delivery semantics?**
At-least-once. Wiki Ingest Agent must be idempotent — running it twice on the same source produces the same `sources/<slug>.md` (modulo timestamps). Easier to make the consumer idempotent than to make delivery exactly-once.

**Q. Replay for backfills without duplicating wiki work?**
Replay events carry a `replay: true` flag. Track B's Ingest Agent treats replayed sources as "re-derive my work; don't append a duplicate log entry if I already cite this source." Idempotency does the rest.

### §11 Observability / cost

**Q. Day-one metrics?**
- Counter: files ingested by `doc_kind`.
- Counter: chunks emitted by `scope` × `doc_kind`.
- Histogram: extract duration per `doc_kind`.
- Histogram: embedding cost per source.
- Counter: failures by `meta.reason`.
That's it. Add when something hurts.

**Q. Budget guardrails on embedding spend?**
CLI flag `--max-embed-spend=$X`. The extract step counts tokens-to-embed and prints a projected cost; the user confirms. Hard fail mid-run if cumulative spend exceeds the cap. Default cap = $10 unless overridden.
