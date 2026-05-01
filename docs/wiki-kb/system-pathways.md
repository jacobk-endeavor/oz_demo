# System pathways

ASCII diagrams of the data flows through the wiki/KB system across Tracks A, B, and C. Each pathway shows what crosses what boundary at what point.

- [0. System overview](#0--system-overview--three-substrates-one-citation-grammar)
- [1. Document ingestion (PDF / PPTX / MD)](#1--document-ingestion-pdf--pptx--md)
- [2. Excel ingestion (per-sheet → row-batch chunks)](#2--excel-ingestion-per-sheet--row-batch-chunks)
- [3. Structured-data ingestion (JSON → per-record chunks)](#3--structured-data-ingestion-json--per-record-chunks)
- [4. Refresh / incremental update](#4--refresh--incremental-update)
- [5. Wiki Ingest → Linker → Diff](#5--wiki-ingest--linker--diff-post-event-flow)
- [6. Synthesizer + Lint cadence](#6--synthesizer--lint-cadence-background-compounding)
- [7. Curator structural changes](#7--curator-structural-changes)
- [8. Chat — synthesis question (wiki-first)](#8--chat--synthesis-question-pattern-wiki-first)
- [9. Chat — product question (composite dossier)](#9--chat--product-question-composite-dossier)
- [10. Chat — comparison](#10--chat--comparison)
- [11. Filing answer back (the compounding loop)](#11--filing-answer-back-the-compounding-loop)

---

## 0 · System overview — three substrates, one citation grammar, tool-use mediation

```
   ┌──────────────────────────  USER  ──────────────────────────┐
   │              "tell me about SKU X" / "compare A vs B"        │
   └─────────────────────────────┬───────────────────────────────┘
                                 │
                    ┌────────────▼────────────────┐
                    │  Track C — Chat agent (LLM) │
                    │  tool registry in system    │
                    │  prompt; LLM picks tools    │
                    │  via tool-use protocol      │
                    └─┬───────┬────────┬────────┬─┘
      ┌───────────────┘       │        │        └────────────────┐
      │ tool-use              │ tool-use   tool-use               │
      ▼                       ▼            ▼                      ▼
  kb_search              wiki_lookup    catalog_*           image_view
  (kb_rag_chunks,        wiki_read      catalog_search      (kb_extracts/img/)
   call_rag_chunks)      wiki_grep      recommendations_*
                         wiki_log
      │                       │            │                      │
      ▼                       ▼            ▼                      ▼
  pgvector              wiki/ md fs    product_catalog.json   kb_extracts/
                                       recommendations.json   img/
      ▲                       ▲                                   ▲
      │ embed/upsert          │ ingest/diff                       │ extract
      │                       │                                   │
      └────────┬──────────────┴───────────────┬───────────────────┘
               │                              │
        ┌──────┴────────┐             ┌───────┴──────────┐
        │  Track A —    │  events     │  Track B —       │
        │  Ingest       │ ──────────▶ │  Wiki agents     │
        │  (extractors, │ kb.ingested │  (Ingest, Diff,  │
        │  embedder,    │ kb.refreshed│   Linker, Index, │
        │  upserter)    │             │   Synth, Lint,   │
        └──────┬────────┘             │   Curator, Schema)│
               │                      └──────────────────┘
               ▼
        raw/  +  product_catalog.json  +  recommendations.json
```

Three substrates feed the chat layer: pgvector chunks (verbatim retrieval), wiki markdown (synthesis), structured JSON (deterministic lookups). All four are reachable **through tools the LLM invokes via tool-use** — no classifier or hardcoded router sits between the LLM and the substrates. One citation grammar binds them.

---

## 1 · Document ingestion (PDF / PPTX / MD)

```
  raw/Voyage-Brochure-2026.pdf
                │
                │  sha256
                ▼
       ┌────────────────────┐
       │  hash gate         │── exists with status=ready ──→ skip
       │  (kb_sources)      │
       └─────────┬──────────┘  new
                 ▼
       ┌────────────────────┐
       │  doc-kind          │  filename "brochure" + first-page peek
       │  classifier        │  → doc_kind=marketing
       └─────────┬──────────┘  → brand=Deckorators, line=Voyage, year=2026
                 ▼
       ┌────────────────────┐
       │  PDF extractor     │  pypdf → pdfminer fallback (<50 chars/page)
       │  (per-page units)  │  image-only → meta.reason=needs_ocr
       └─────────┬──────────┘
                 ▼
   kb_extracts/abc123def456/
   ├── manifest.json          v1, units[].chunk_ids, content_hash
   ├── full.txt               end-to-end read for Track B
   ├── unit-page-001.txt
   ├── unit-page-002.txt …
   └── img/page-001-fig-01.png
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
   chunker             kb.ingested event
   (1400/200)              {source_id, chunk_ids,
       │                    doc_kind, locators,
       ▼                    extracted_text_path}
   embedder                 │
   (text-embed-3-small,     ▼
    batch=64)        ┌──────────────┐
       │             │ Track B      │
       ▼             │ Ingest Agent │
   ┌────────┐        │ (next chart) │
   │ kb_rag │        └──────────────┘
   │ chunks │
   └────────┘
```

PDFs are chunked per-page, never crossing page boundaries; the page locator is part of the chunk's embedded header so retrieval brings back self-describing fragments.

---

## 2 · Excel ingestion (per-sheet → row-batch chunks)

```
  raw/Captivate-Color-Reference.xlsx
                │
                ▼
       doc-kind = tabular-reference
                │
                ▼
       ┌────────────────────┐
       │  Excel extractor   │  openpyxl → per-sheet CSV
       └─────────┬──────────┘  (each sheet = 1 logical document)
                 ▼
   kb_extracts/<sid>/
   ├── unit-sheet-Captivate.csv
   ├── unit-sheet-RGB-Map.csv
   └── manifest.json
                 │
                 ▼
       ┌────────────────────┐  20-row windows
       │  row-batch chunker │  header row re-prepended to every chunk
       │                    │  → readable in isolation
       └─────────┬──────────┘
                 ▼
       chunk_id format:
       <sid>_<sheet-slug>_r00040_00060
                 │
                 ▼
       embedder → kb_rag_chunks
       cited as [doc:<chunk_id>] with locator "sheet=Captivate rows=40-60"
```

Each sheet becomes its own logical document; the header row re-prepended to every chunk ensures retrieved fragments are interpretable without their parent sheet.

---

## 3 · Structured-data ingestion (JSON → per-record chunks)

```
  product_catalog.json   recommendations.json
  (3,692 SKUs)           (60 cross-sell + 944 upsell + 502 substitution)
       │                          │
       └──────────┬───────────────┘
                  ▼
       ┌────────────────────────────────┐
       │  schema match in kb_schemas/   │
       │  <stem>.schema.json validates  │
       │  <stem>.render.py renders body │
       └──────────────┬─────────────────┘
                      ▼
       ┌────────────────────────────────────┐
       │  per-record extractor              │
       │  catalog: 1 unit per SKU           │
       │         + 1 per sub-category       │
       │         + 1 per product line       │
       │  recs: 1 unit per rule + method    │
       └──────────────┬─────────────────────┘
                      ▼
   chunk_id IS the citation locator:
     cat_sku_PGFGD          [catalog:sku=PGFGD]
     cat_line_AT            [catalog:line=AT]
     recs_xs_CD-RC-RCDeck_0 [recs:cross_sell:CD-RC-RCDeck#0]
                      │
                      ▼
       embedder → kb_rag_chunks
                      │
                      ▼
       ┌────────────────────────────────────┐
       │  Track B Ingest Agent              │
       │  (structured-data playbook)        │
       │   • bootstrap 49 product-line      │
       │     entity pages                   │
       │   • bootstrap 3 recs concept pages │
       │   • SKU pages stay LAZY            │
       │     (created only on engagement)   │
       └────────────────────────────────────┘
```

Citation locators are baked into the chunk_id — `[catalog:sku=PGFGD]` resolves directly without lookup tables. SKU entity pages are lazy: only created when documents reference the SKU 3+ times or a query targets it.

---

## 4 · Refresh / incremental update

```
  product_catalog.json regenerated upstream
                │
                ▼  sha256 changed?
                │ yes
                ▼
       extract → temp manifest
                │
                ▼
       diff vs prior manifest.json
       (per-unit content_hash)
                │
       ┌────────┼────────┬─────────┐
       ▼        ▼        ▼         ▼
     added   modified  removed   unchanged
       │        │        │         │
       ▼        ▼        ▼        skip
     embed   re-embed  status=
     +       + update  removed
     insert  chunks    + meta.removed_at
                │        (soft-delete,
                │         citations still
                │         resolve historically)
                ▼
       kb.refreshed event
       {added: [...], modified: [...], removed: [...]}
                │
                ▼
       ┌────────────────────────────────┐
       │  Track B Diff Agent (selective)│
       │   • per-record updates to      │
       │     relevant entity sections   │
       │   • preserve change history    │
       │   • flag drift > thresholds    │
       └────────────────────────────────┘
```

Per-record diffs against the prior manifest mean a regenerated catalog only re-embeds what actually changed. Removed records soft-delete so historical citations still resolve.

---

## 5 · Wiki Ingest → Linker → Diff (post-event flow)

```
  kb.ingested event arrives
                │
                ▼
     ┌───────────────────────┐
     │  Ingest Agent         │  reads kb_extracts/<sid>/full.txt
     │  • confirm doc_kind   │  + selective images for visual docs
     │  • run playbook       │
     │  • draft sources/     │  citations carry [doc:...] [image:...]
     │    <slug>.md          │                  [catalog:sku=...] when relevant
     │  • candidate list     │
     └──────────┬────────────┘
                │  hands off candidates
                ▼
     ┌───────────────────────┐
     │  Linker Agent         │  for each candidate:
     │  • slug normalize     │   - exists? → enqueue Diff job
     │  • alias check        │   - new entity (brand/line)?
     │    via _aliases.md    │     → create stub
     │  • backlink upkeep    │   - SKU mention?
     │                       │     → cite [catalog:sku=...] only
     └──────────┬────────────┘     (NO stub; SKU pages are lazy)
                │
                ▼  per-page diff queues
   _drafts/diff-queue/<page-slug>.json
        │            │            │
        ▼            ▼            ▼
   ┌────────┐   ┌────────┐   ┌────────┐
   │ Diff   │   │ Diff   │   │ Diff   │  parallel across pages
   │ Agent  │   │ Agent  │   │ Agent  │  serial within a page
   │(voyage)│   │(brand) │   │(install)│
   └────┬───┘   └────┬───┘   └────┬───┘
        │            │            │
        ▼            ▼            ▼
  edits ONLY within named sections
  contradictions inserted as inline blocks
  source_count bumps (distinct source_ids)
  one git commit per agent run
        │            │            │
        └────────────┼────────────┘
                     ▼
            Index Agent rebuild
            log.md append (structured)
```

Three agents in sequence (Ingest → Linker → Diff), with the Diff stage parallelized per-page via FIFO queues. Each Diff run produces one git commit; conflicts are impossible because no two agents edit the same page simultaneously.

---

## 6 · Synthesizer + Lint cadence (background compounding)

```
   Time / event triggers
        │
        ├─── ≥5 new sources OR 7 days ─────→ Synthesizer Agent
        │                                          │
        │                                          ▼
        │                              reads synthesis.md +
        │                              log.md (since last run) +
        │                              top-N entity/concept pages
        │                                          │
        │                                          ▼
        │                              writes synthesis.md:
        │                                • working thesis
        │                                • what changed since
        │                                • OQ-<n> open questions
        │                              anti-recency-bias prompt
        │
        └─── weekly schedule ──────────────→ Lint Agent
                                                   │
                                                   ▼
                                       structural checks:
                                         • broken citations
                                         • dead [[wiki:...]] links
                                         • orphan pages
                                         • schema violations
                                       drift checks:
                                         • stale claims
                                         • frequent-mention-no-page
                                         • novel frontmatter keys
                                                   │
                                                   ▼
                                       wiki/_lint/<date>-report.md
                                       (proposes; never auto-fixes)
```

Compounding work happens off the ingest path. Synthesizer runs on cadence + threshold; Lint runs weekly and proposes — never auto-fixes.

---

## 7 · Curator structural changes

```
  Trigger: Lint findings / /wiki curate / Q-filed-back
                │
                ▼
     ┌──────────────────────────┐
     │  Curator Agent           │  always assisted (human approves)
     └──────────┬───────────────┘
                │
        ┌───────┼───────┬──────────┐
        ▼       ▼       ▼          ▼
      SPLIT   MERGE   ARCHIVE   PROMOTE
     >400ln   alias-  180d+     query →
     >3 Open  detect  low SC    concept page
     subtops  body    no in-    (filing back)
              >70%    bound
              overlap
        │       │       │          │
        ▼       ▼       ▼          ▼
     child   merged_  redirect   new
     pages   from:    stub at    concepts/
     +       [old1,   old path:  <slug>.md
     parent  old2]    "moved →"  +linker
     links
                │
                ▼  All changes proposed first;
                   commit after review
                ▼
        log.md append: structural event
```

Curator is the only agent that does structural changes (rename, split, merge, archive). Always assisted — splits and merges are too high-risk for autonomous mode.

---

## 8 · Chat — synthesis question (LLM picks wiki-first via tool-use)

```
  user: "what objections do customers raise about lead times?"
                │
                ▼
     ┌─────────────────────────────────┐
     │  Chat Agent (LLM)               │
     │  no SKU/code in question;       │
     │  wiki_lookup description points │
     │  here for "objections" topics   │
     └────────────┬────────────────────┘
                  ▼  emits tool_use:
        wiki_lookup("lead time objections")
        BM25 over wiki/.search/ + frontmatter ranking
                  │
                  ▼  ranked candidates back to LLM
     ┌─────────────────────────────────┐
     │  LLM emits next tool_use:       │
     │  wiki_read("concepts/           │
     │    objections/lead-time")       │
     └────────────┬────────────────────┘
                  ▼  page cites [call:c0023_00001]
                     LLM decides: caller wants quotes
                  ▼  emits tool_use:
        kb_search(scope=call,
                  q="lead time", k=5)
                  │
                  ▼  results to LLM
     ┌─────────────────────────────────┐
     │  LLM composes answer            │  wiki structure +
     │  with citations                 │  call-quote evidence
     └────────────┬────────────────────┘
                  ▼
     "Four objection types …
      see [[wiki:concepts/objections/lead-time]]
      e.g. [call:c0023_00001]"
                  │
                  ▼
     novelty check → offer to file Q2 snapshot?
       yes → Curator Agent
       no  → log as 'query' event
```

The LLM chains tool calls — `wiki_lookup` → `wiki_read` → `kb_search` — based on what each one returns. No classifier; the tool descriptions made `wiki_lookup` the right first call.

---

## 9 · Chat — product question (LLM composes primitives, or calls bundled `product_dossier`)

```
  user: "tell me about SKU DK35031021"
                │
                ▼
     ┌─────────────────────────────────┐
     │  Chat Agent (LLM)               │
     │  question contains SKU pattern; │
     │  catalog_get description fits   │
     │  + open-ended → fan out         │
     └────────────┬────────────────────┘
                  │
                  ▼  emits parallel tool_use blocks:
   ┌────────────────────────────────────────────────────────┐
   │   PARALLEL (LLM may emit any subset):                  │
   │                                                         │
   │   ┌────────────┐   ┌────────────┐                      │
   │   │ catalog_   │   │ wiki_      │                      │
   │   │ get        │   │ lookup     │                      │
   │   └─────┬──────┘   └─────┬──────┘                      │
   │         │                │                             │
   │   ┌─────▼──────┐   ┌─────▼──────┐                      │
   │   │ kb_search  │   │ recommend- │                      │
   │   │ (scope=kb) │   │ ations_for │                      │
   │   └─────┬──────┘   └─────┬──────┘                      │
   │         │                │                             │
   │   ┌─────▼────────────────┴──┐                          │
   │   │ kb_search(scope=call)   │                          │
   │   └────────────┬────────────┘                          │
   │                ▼  results stream back to LLM           │
   │                                                         │
   │   --- OR (cost-sensitive hot path) ---                 │
   │                                                         │
   │   ┌────────────────────────────────┐                   │
   │   │ product_dossier("DK35031021")  │  bundled tool;    │
   │   │ runs the same fan-out server-  │  one tool_use,    │
   │   │ side; cost-budgeted; returns   │  fewer LLM        │
   │   │ unified record                 │  round-trips      │
   │   └────────────────────────────────┘                   │
   └────────────────┬───────────────────────────────────────┘
                    ▼
   unified record with citations on every cell:
     [catalog:sku=DK35031021]
     [doc:abc123_p001_00000]
     [recs:upsell:DK35031021#0]
     [[wiki:entities/products/voyage]]
     [call:c0042_00007]
```

`product_dossier` is the workhorse: one user question, parallel fan-out across all substrates, unified answer with mixed citations. Cost-budgeted so it short-circuits if the budget would be exceeded.

---

## 10 · Chat — comparison (LLM chains primitives, or calls bundled `compare`)

```
  user: "compare Captivate and Evolution"
                │
                ▼
     ┌─────────────────────────────────┐
     │  Chat Agent (LLM)               │
     │  question names 2 product       │
     │  lines; tool descriptions point │
     │  to wiki_compare + catalog_*    │
     └────────────┬────────────────────┘
                  │
                  ▼  emits parallel tool_use blocks:
   ┌─────────────────────────────────────────────────┐
   │   ┌────────────────┐   ┌──────────────────┐     │
   │   │ wiki_compare   │   │ catalog_         │     │
   │   │  reads N       │   │ aggregate        │     │
   │   │  entity pages  │   │  group_by=line   │     │
   │   │  diffs sections│   │  metrics: sales, │     │
   │   │  + frontmatter │   │  margin, sku ct  │     │
   │   └────────┬───────┘   └─────────┬────────┘     │
   │            │                     │              │
   │   ┌────────▼─────────────────────┴────────┐     │
   │   │ kb_search                             │     │
   │   │ ("Captivate vs Evolution comparison") │     │
   │   │  for direct comparative content       │     │
   │   └────────────────┬─────────────────────┘     │
   │                    │                            │
   │   --- OR ---                                    │
   │                                                  │
   │   ┌──────────────────────────────────┐          │
   │   │ compare(["Captivate","Evolution"])│ bundled │
   │   │ runs the same fan-out server-    │ tool    │
   │   │ side; one tool_use               │         │
   │   └──────────────────────────────────┘         │
   │                    │                            │
   │       comparison matrix (citations per cell):   │
   │         Dimension | Captivate | Evolution       │
   │         Brand     | AZEK [..] | TimberTech [..] │
   │         Warranty  | 30yr [..] | Lifetime [..]   │
   │         …                                       │
   └──────────────────────┬──────────────────────────┘
                          ▼
        rendered as table with hover-resolvable
        [doc:...] / [catalog:...] / [[wiki:...]]
```

Multi-target comparison composes wiki structure (section-by-section diffing) + catalog aggregates + opportunistic kb_search for content where someone has already done the comparison. The LLM picks; the bundled `compare` tool exists for cost-sensitive hot paths.

---

## 11 · Filing answer back (the compounding loop)

```
   Chat agent finishes synthesis answer
                │
                ▼
     novelty checks:
       • answer combined ≥3 sources?
       • no existing similar concept page?
       • question generalizable (not "what did X say in call Y")?
                │
                ▼  all pass
     "File this as concepts/<slug>.md? (Y / suggest slug / skip)"
                │
                ▼  yes
     ┌──────────────────────────┐
     │  Curator Agent           │
     │  • create concepts/...   │
     │  • carry citations       │
     │  • frontmatter (type,    │
     │    confidence, related)  │
     └──────────┬───────────────┘
                ▼
     ┌──────────────────────────┐
     │  Linker Agent            │
     │  • update entity pages   │
     │    the answer mentioned  │
     │  • new page indexed via  │
     │    "Mentioned in"        │
     └──────────┬───────────────┘
                ▼
     ┌──────────────────────────┐
     │  Index Agent + log.md    │
     │  log: query-filed event  │
     │  index.md: new entry     │
     └──────────┬───────────────┘
                ▼
   Future similar questions hit this page first
   via wiki_lookup → wiki-first answer
   The wiki gets denser; the chat gets faster.
```

The compounding mechanism — synthesis answers don't disappear into chat history; they become wiki pages. The next time someone asks a similar question, `wiki_lookup` finds it directly.
