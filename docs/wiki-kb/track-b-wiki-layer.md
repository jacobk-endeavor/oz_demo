# Track B — Wiki Layer

The wiki is the **compiled** view. Track A's pgvector index is the raw substrate. The wiki is where synthesis lives, gets updated, and compounds over time.

This document is the longest of the three on purpose. It focuses on:

- How the wiki is laid out and what conventions hold the system together.
- The **agents** that maintain the wiki — what triggers them, what they read, what they write, where their boundaries are.
- How the wiki **grows and evolves** from day 0 to year 1.
- How the wiki is **queried**, including how query answers feed back into the wiki itself.

The wiki is just markdown. Browse it in Obsidian on one side, talk to the chat agent on the other, version-control the whole thing in git.

---

## Layout

```
wiki/
├── WIKI.md                          # schema doc the agent reads first; co-evolves with the wiki
├── index.md                         # human-readable catalog (auto-maintained)
├── log.md                           # chronological event stream, append-only
├── synthesis.md                     # top-level thesis; updated, not appended
├── sources/<slug>.md                # one per Track A source, cites chunk_ids
├── entities/
│   ├── brands/<brand>.md            # AZEK, Deckorators, TimberTech, Trex, Russin, TFP, ...
│   ├── products/<product-line>.md   # Captivate, Evolution, Voyage, Black Label, Maximo Thermo, ...
│   ├── skus/<sku>.md                # lazy-created; only for SKUs that get engaged with
│   ├── species/<species>.md         # cumaru, ipe, garapa, angelim, cedar, ... (from master specs)
│   ├── customers/<customer>.md      # from calls
│   └── suppliers/<supplier>.md      # from calls + brand relationships
├── concepts/
│   ├── install/<product-line>.md    # canonical install procedures
│   ├── warranty/<brand-product-year>.md   # year-pinned warranty terms
│   ├── color-equivalence/<family>.md
│   ├── recommendations/{cross-sell,upsell,margin-substitution,methodology}.md
│   ├── objections/<topic>.md        # from calls
│   └── <topic>.md                   # everything else
├── _drafts/                         # agent's in-progress work; never committed by humans
├── _lint/<date>-report.md           # health check output
└── _archive/                        # superseded pages, kept for history
```

Three top-level "kinds" of content (sources, entities, concepts), plus three meta files (index, log, synthesis), plus three working directories (drafts, lint, archive). Entities and concepts are organized into typed sub-directories so playbooks have stable paths to write to and Lint can sanity-check structure.

---

## Page conventions (the contract every page honors)

Defined in `WIKI.md`. Every page has frontmatter:

```yaml
---
type: source | entity | concept | synthesis
slug: supplier-foo
title: Foo Lumber Co.
created: 2026-05-01
updated: 2026-05-12
source_count: 7          # number of cited sources
related: [supplier-bar, pricing-strategy]
tags: [supplier, regional]
confidence: high|medium|low   # added later, after the first Schema review
---
```

Body conventions:

- Cite sources with `[<chunk_id>]` (verbatim) or `[[sources/<slug>]]` (synthesis).
- Mark contradictions inline rather than overwriting:
  ```
  > CONTRADICTION (2026-05-12): older note said X [chunk_a]; latest source says Y [chunk_b].
  ```
- Section headings are stable — agents diff section-by-section, not whole-page-rewrite. This is what makes the wiki maintainable: if `## Pricing` always means the same thing, the Diff Agent can edit just that section without re-reading the whole page.
- Backlinks live in a `## Mentioned in` section maintained by the Linker Agent. (Obsidian shows them natively; storing them explicitly helps non-Obsidian readers and the Lint Agent.)

---

## Data sources and citation grammar

The wiki treats four kinds of data sources, each with its own ingest pathway and a deterministic citation form. Every claim in the wiki must end in one of these citations.

| Source kind | Pathway | Citation form | Example |
| --- | --- | --- | --- |
| Documents (PDF / PPTX / MD) | Track A document extractor → `kb_extracts/` → wiki Ingest Agent | `[doc:<chunk_id>]` | `[doc:abc123_p007_00002]` |
| Images extracted from documents | Track A vision pass | `[image:<path>]` | `[image:abc123/img/page-004-fig-01.png]` |
| Tabular references (XLSX) | Track A per-sheet CSV → `tabular-reference` playbook | `[doc:<chunk_id>]` (header re-prepended) | `[doc:def456_Pricing_r00040_00060]` |
| Calls (existing sauron pipeline) | calls/sauron/scripts/ingest_calls_pgvector.py → `call_rag_chunks` | `[call:<chunk_id>]` | `[call:c0042_00003]` |
| Structured data — catalog | Track A structured-data extractor → per-record chunks + entity pages | `[catalog:sku=<sku>]` / `[catalog:line=<code>]` / `[catalog:sub=<code>]` | `[catalog:sku=PGFGD]` |
| Structured data — recommendations | Track A structured-data extractor | `[recs:<kind>:<key>#<idx>]` / `[recs:method=<kind>]` | `[recs:cross_sell:CD-RC-RCDeck#0]` |
| Wiki page (synthesis citation) | The wiki itself | `[[wiki:<slug>]]` | `[[wiki:concepts/decking-width-tradeoff]]` |

**Properties of the citation grammar:**

- **Deterministic.** Given a citation, the chat agent (Track C) can resolve it to the underlying record without searching. `[catalog:sku=PGFGD]` → look up SKU in `product_catalog.json`; `[doc:abc123_p007_00002]` → look up chunk in `kb_rag_chunks`.
- **Verifiable.** Lint Agent walks every page and resolves every citation. Broken citations are a hard error.
- **Stable across regenerations.** Catalog and recommendation citations are keyed on stable identifiers (SKU, sub-category code), not array indices. When the source regenerates, the citation still resolves if the record still exists.
- **Mixable.** A claim can carry multiple citations of different kinds: "Voyage decking is the new Deckorators flagship for 2026 [doc:abc123_p001_00000] [catalog:line=DK-MBC-VOYAGE]."

The grammar is what makes the wiki **transparent**: every claim has a path back to either text in a document or a row in structured data. Synthesis is never floating.

## Structured-data pathway (catalog + recommendations)

`product_catalog.json` (3,692 SKUs across 49 product lines) and `recommendations.json` (60 cross-sell rules, 944 upsell rules, 502 substitution rules) are the system's structured backbone. They get a different ingest pathway than documents because their value is in the keys, not the prose.

### Catalog → wiki

**Bootstrap (one time, when the catalog file is first ingested):**

- Generate `entities/products/<product-line>` pages for all 49 product lines. Each page's frontmatter carries:
  ```yaml
  product_line_code: AT
  sub_categories: [AT-AT-PMoulding, AT-AT-Sheet, ...]
  sku_count: 59
  total_sales_year: 142500.00
  catalog_refresh: 2026-05-01
  ```
- Body sections: top SKUs by sales, sub-categories overview, link to brand entity, blank "Positioning" / "Claims" sections that documents will fill in later.

**Lazy SKU pages.** Do NOT create 3,692 SKU pages on bootstrap. Instead:
- A SKU page (`entities/skus/<sku>`) is created only when:
  - An ingested document mentions the SKU, OR
  - A user query asks about the SKU, OR
  - The SKU appears in a recommendation rule the user explores.
- This keeps the wiki focused on what's been *engaged with*, not the entire data dump.

**Refresh.** When `product_catalog.json` regenerates (Track A's `kb.refreshed` event), the Ingest Agent processes deltas only:
- New SKU added to a known product line → product-line page's SKU count bumps; entity page for the SKU only created on demand.
- SKU price / sales updated significantly (configurable threshold) → if a wiki SKU page exists, Diff Agent updates the structured fields and notes the delta in `## History`.
- SKU removed → wiki SKU page (if any) marked `deprecated: <date>` rather than deleted.

### Recommendations → wiki

- **Method block** (`notes` field) → `concepts/recommendations/methodology` once. Future recommendation refreshes don't recreate this; only updates if methodology text changed.
- **Three concept pages bootstrap**, one per recommendation kind:
  - `concepts/recommendations/cross-sell` — top rules table, sub-categories with strongest lift.
  - `concepts/recommendations/upsell` — top opportunities by margin uplift.
  - `concepts/recommendations/margin-substitution` — same.
- **Per-product-line entity pages** get a "Cross-sell / Upsell" section linking to the rules that involve their sub-categories.

### Why the wiki layer matters for structured data

The catalog and recommendations files are perfectly queryable on their own — Track C exposes direct lookup tools. The wiki layer adds three things:

1. **Grounding in narrative.** A SKU's catalog row says it sells $11,923/yr at $22.08; the wiki page can link this row to the brochure that introduced the product, the install guide that constrains its use, and the calls where customers asked about it.
2. **Cross-source synthesis.** "Why does the cross-sell from cedar decking to cedar boards have lift 1.84?" — the recommendation rule alone can't say. The wiki concept page synthesizes the rule + the relevant tech bulletins + relevant calls.
3. **Drift detection.** If a brochure claims a 50-year warranty for a SKU but the catalog's product line aggregate shows the SKU was discontinued, that's a contradiction the wiki Lint Agent surfaces. Neither file alone catches it.

---

## Agents

The wiki is maintained by a constellation of small, single-purpose agents. Each is a prompted subroutine of the chat LLM with narrow tools and a strict scope. Composition is what makes this reliable; one mega-agent gets sloppy and forgets what it already changed.

The agents form a small pipeline:

```
kb.ingested ──► Ingest ──► Linker ──► Diff (×N entity/concept pages)
                                          │
                                          ▼
                                     Index ──► (log appended throughout)

scheduled / on-demand: Synthesizer, Lint, Curator, Schema
on user query:         Query (calls others as needed)
```

### 1. Ingest Agent (a.k.a. Filer)

**One job:** turn a freshly extracted source into a `sources/<slug>.md` page, identify what other pages it touches, and choose the right **playbook** for the source's *kind*.

This is the most complex agent in the wiki because it's the one that reads heterogeneous inputs and decides what they are. Everything downstream depends on its decisions: which entity gets updated, which concept gets created, which structured data gets cross-linked, which contradictions get raised.

#### Triggers

- `kb.ingested` event from Track A (most common).
- `kb.refreshed` event for structured-data sources whose underlying file regenerated.
- Manual `/wiki ingest <source_id>` for re-runs after schema changes.
- Manual `/wiki reingest <source_id> --playbook=<override>` when the auto-classified playbook is wrong.

#### Inputs

- `kb_extracts/<source_id>/manifest.json` — the manifest that maps locators → `chunk_ids` and carries the doc-kind classification + extracted metadata (brand, product line, year).
- `kb_extracts/<source_id>/full.txt` and per-unit text files — the un-chunked extract (Track A's view #2).
- `kb_extracts/<source_id>/img/` — extracted images for multimodal reads when needed.
- Selective access to specific chunks via `kb_search`-style lookup, used for citation verification only.
- Existing wiki state (read-only on this pass).

#### Step 1 — Confirm classification

Track A has already classified the source (doc_kind + brand + product line + year). The Ingest Agent reads `manifest.json` and confirms:

- Does the doc_kind match what the first page actually shows? If not, file a `meta.classification_mismatch` and either accept or override.
- Is the brand / product line consistent with file content? Filenames lie occasionally.

Mismatches are a known signal for the Lint Agent; the Ingest Agent doesn't *fix* the manifest, it records the disagreement.

#### Step 2 — Choose the playbook

Each `doc_kind` triggers a specific **playbook**. Playbooks differ in what gets read, what gets generated, and which entity/concept pages get touched. The same source page template is used in all of them; the difference is depth and which downstream targets get queued.

##### Playbook: `marketing` (brochure, overview)

- **Read:** full extract; vision pass on cover and hero pages.
- **Draft `sources/<slug>.md`:** positioning summary, claimed benefits, target use cases, color/finish callouts.
- **Update candidates:**
  - `entities/products/<product-line>` — strengthen Positioning and Claims sections.
  - `entities/brands/<brand>` — link new product line if not already linked.
- **Concept candidates:** application contexts (residential deck, commercial dock, multi-family), aesthetic categories (modern, traditional).
- **Watch for:** warranty length, country/region scope, year — these change between brochures and produce contradictions worth flagging.

##### Playbook: `install` (install guide, installation instructions)

- **Read:** full extract; preserve numbered steps verbatim. Vision pass on diagram pages.
- **Draft `sources/<slug>.md`:** step summary, tool/material list, critical tolerances and constraints, fastener/spacing requirements.
- **Update candidates:**
  - `concepts/install/<product-line>` — create if missing; this is the canonical install procedure.
  - `entities/products/<product-line>` — link install concept.
- **Diff hook:** if multiple install guides exist for the same product line, Diff Agent compares step-by-step and flags procedural changes (e.g., spacing changed from 3/16" to 1/4").

##### Playbook: `tech-bulletin` (technical bulletin, "X vs Y")

- **Read:** full extract — these are short, 1–4 pages.
- **Draft both:** `sources/<slug>.md` AND directly create or update `concepts/<topic>`. Tech bulletins are concept-shaped by nature.
- **Examples:**
  - `4 Inch VS 6 Inch Decking - Technical Bulletin.pdf` → `concepts/decking-width-tradeoff` with the tradeoff matrix.
  - `Weathering vs Finishing - Technical Bulletin.pdf` → `concepts/finishing/weathering-vs-finishing`.
- **Cross-link:** every SKU referenced gets a `[catalog:sku=...]` citation so the chat agent can pull pricing/sales context for any SKU mentioned in the bulletin.

##### Playbook: `visual-catalog` (color comparison, color chart)

- **Read:** extract is sparse (lots of imagery, little text). **Multimodal vision pass is mandatory.**
- For each color page: vision-caption ("Page 4: Pacific Privacy color, side-by-side with Trex Transcend Tropics in similar tone").
- **Draft `sources/<slug>.md`:** captioned color list, brand-equivalence table.
- **Update candidates:**
  - `entities/products/<product-line>` — Colors section as a structured table: `(color name, brand-equivalent, page reference, image path)`.
  - `concepts/color-equivalence/<color-family>` — cross-brand color matching as a concept page.
- **Citation:** both `[doc:<chunk_id>]` (caption text) and `[image:<source_id>/img/page-<n>.png]` (the swatch image itself).

##### Playbook: `master-spec` (TFP Master Spec — heavily structured)

- **Read:** full extract. These documents share section headings across timber species (Mechanical Properties, Grades, Workability, Finishing, Sustainability).
- **Draft `sources/<slug>.md`:** minimal — most of the value goes to the entity.
- **Update candidates:** `entities/species/<species>` (e.g. `entities/species/cumaru`) with structured frontmatter:
  ```yaml
  janka_lbf: 3540
  density_g_cc: 1.10
  grades: [FAS, Select, Common]
  cites_status: legal      # ties to TFP Legal Lumber Brochure
  ```
- **Lint hook:** if a master spec exists for a species but the entity page lacks structured fields, flag it.

##### Playbook: `catalog` (line card, full product catalog)

- **Read:** full extract; tabular product listings dominate.
- **Draft `sources/<slug>.md`:** breadth summary (N SKUs, N families, geographies covered).
- **Cross-reference every SKU mentioned against `product_catalog.json`:**
  - Catalog has it → add `[catalog:sku=...]` citation on the source page.
  - Catalog does NOT have it → "PDF lists SKU not in catalog" → Lint queue (could be a forthcoming SKU, a typo, or stale catalog data).
  - After ingest: report SKUs in `product_catalog.json` for this brand NOT mentioned in the line card → potential discontinuation flag.
- **Update candidates:** `entities/brands/<brand>` SKU index.

##### Playbook: `warranty`

- **Read:** full extract; legal-grade text. **Exact wording matters.**
- **Draft `sources/<slug>.md`:** verbatim term excerpts with chunk citations. Never paraphrase.
- **Update candidates:**
  - `concepts/warranty/<brand>-<product>-<year>` — pinned warranty version.
  - `entities/products/<product-line>` Warranty section — current effective terms with a link to the year-pinned concept page.
- **Critical:** if warranty length changed between versions (e.g., 25-year → 50-year limited), Diff Agent's contradiction handling kicks in. Older claim is preserved with `> CONTRADICTION (date): warranty term changed from X to Y in <newer-source>`.

##### Playbook: `presentation` (.pptx)

- **Read:** slide-by-slide. Each slide is a unit; vision pass per slide for layout-heavy decks.
- **Speaker notes are primary text** where present — they often carry the actual sales narrative.
- **Draft `sources/<slug>.md`:** slide-level summary plus a section per slide topic.
- **Update candidates:** existing entity/concept pages topical to the deck. Presentations rarely create new pages — they reinforce existing ones.

##### Playbook: `tabular-reference` (.xlsx)

- Already extracted as per-sheet CSV by Track A.
- **Each sheet is a logical unit;** the agent decides which sheet maps to which entity (often by sheet name).
- For color-chart-style data (e.g. `Captivate Color Chart Reference.xlsx`): update `entities/products/<product-line>` color table with structured rows; cite `[doc:<chunk_id>]` per row range.

##### Playbook: `order-guide` (ALX Cable Railing Order Guide, etc.)

- **Read:** full extract; configuration-table dense.
- **Draft `sources/<slug>.md`:** ordering decision-tree (post type → bracket → cable spec → fastener), part-number reference table.
- **Update candidates:** `concepts/configuration/<product-line>` — the canonical "how to spec this product" page.

##### Playbook: `structured-data` (product_catalog.json, recommendations.json)

This is its own pathway — see "Structured-data pathway" below.

#### Step 3 — Draft and link

After playbook execution:

1. Finalize `sources/<slug>.md`. Required frontmatter:
   ```yaml
   ---
   type: source
   slug: deckorators-voyage-2026-brochure
   title: 2026 Deckorators Voyage Decking Brochure
   source_id: abc123def456
   doc_kind: marketing
   brand: Deckorators
   product_line: Voyage
   year: 2026
   distributor_branded: false
   created: 2026-05-01
   updated: 2026-05-01
   supersedes: deckorators-voyage-2023-brochure   # optional
   ---
   ```
2. Hand off the entity/concept candidate list to **Linker Agent**.
3. Append a structured entry to `log.md`:
   ```
   ## [2026-05-01 14:22] ingest | doc_kind=marketing | brand=Deckorators | line=Voyage | year=2026 | source_id=abc123def456
   ```
   The structured prefix makes Pattern F queries (`grep "brand=Deckorators" log.md`) trivial.

#### Step 4 — Special handling cross-cutting all playbooks

##### Near-duplicate / supersession

Track A flags candidates via `kb_sources.meta.near_duplicates`. The Ingest Agent's response:

- If brand+line+year+doc_kind already exists with high content similarity → file as `superseded_by` candidate, do NOT auto-merge. Hand to Curator Agent.
- If a newer year supersedes an older year: file the new source normally with `supersedes: <older-slug>`. Diff Agent uses the newer source as primary; older citations remain but are de-emphasized.
- Distributor-branded variants (e.g. "Millboard Decks US Sell Sheet v1 - with RUSSIN LOGO.pdf" vs "Millboard Decks US Sell Sheet v1.pdf") are tagged `distributor_branded: true` and linked but kept distinct.

##### Image-heavy sources

Plain text extraction is insufficient for color comparisons, brochure photography, install diagrams. The Ingest Agent uses multimodal capability for:

- Cover/hero pages — brand identification, positioning visual cues.
- Color swatches — descriptive captions per swatch (color name, RGB-ish description, brand equivalence).
- Install diagrams — extracted as labeled steps where possible.
- Charts — extract structured data (e.g., Janka hardness bars → numeric values that can be folded into entity frontmatter).

Images are kept under `kb_extracts/<source_id>/img/` and citable via `[image:<path>]`.

##### Structured-data references inside documents

When a document mentions a SKU (e.g., a line card listing `DK35031021`), the Ingest Agent:

1. Looks up the SKU in `product_catalog.json` via `catalog_get(sku)` (Track C tool).
2. If found: cite both the doc chunk AND the catalog record: `[doc:abc123_p007_00002] [catalog:sku=DK35031021]`.
3. If not found: leave a `MISSING-SKU` marker that Lint will collect.

This is the system's compounding superpower: *every SKU mention in a PDF becomes a navigable link to live structured data*. Reading the wiki page for the Voyage product line lets you click straight from a brochure quote to the SKU's price/sales record.

#### Tools

`Read` (extract files, wiki pages, manifest), `Write` (sources/ only), `Edit` (its own draft within a single ingest), `Bash` (append to log, frontmatter parsing), `kb_search` (read-only chunk verification), `catalog_get` / `recommendations_for` (Track C — read-only structured-data lookup for cross-referencing).

#### Boundaries

The Ingest Agent does NOT:
- Edit existing entity or concept pages directly (Diff Agent's job).
- Create entity / concept pages from scratch in this pass — it identifies *candidates* and Linker Agent creates stubs.
- Decide structural changes (splits, merges, archive) — Curator Agent's job.
- Update `synthesis.md` or `index.md` — Synthesizer and Index Agent's jobs.
- Modify `manifest.json` or anything in `kb_extracts/` — Track A is authoritative.

This boundary is what makes the agent reliable. It does one thing per source: read, classify (or confirm classification), draft a source page, identify what to touch elsewhere.

### 2. Diff Agent (a.k.a. Reconciler)

**One job:** update one existing entity or concept page with one piece of new information.

**Trigger:** Linker Agent identifies a page that needs an update and queues a job per page.

**Inputs:**
- The current page (full text).
- A proposed addition: a fact, a quote, or a new section, with the source's `chunk_id`.

**Procedure:**
1. Read the current page in full (single page, fits in context easily).
2. Decide:
   - **New independent fact** → add to the appropriate section, append `[chunk_id]` citation.
   - **Reinforces existing claim** → don't duplicate the claim. Append the new `[chunk_id]` to the existing line. Bump `source_count` in frontmatter.
   - **Contradicts existing claim** → DO NOT overwrite. Insert a `> CONTRADICTION` block alongside the original. Add the contradiction to the lint queue.
3. Update frontmatter: `updated`, `source_count`, `related` if new links emerged.
4. Emit a one-line diff summary for `log.md` (e.g., `entity:supplier-foo +pricing-tier`).

**Tools:** `Read`, `Edit` (never `Write` — only edits existing pages).

**Why it's split from Ingest:** keeps each LLM call focused on one page with fresh context. The "I forgot what I already changed two pages ago" failure mode disappears when each agent invocation has exactly one page in working memory.

### 3. Linker Agent (a.k.a. Cross-Reference)

**One job:** make sure every page links to and from where it should.

**Trigger:** after the Ingest Agent finishes a source, or in a periodic sweep.

**Procedure:**
1. Walk the new source page, collect `[[wikilinks]]` and `[[...:new]]` markers.
2. For each existing target → schedule a Diff Agent job with the relevant claim from the source page.
3. For each new target → create a stub `entities/<slug>.md` or `concepts/<slug>.md` from the mentions in this single source. Mark frontmatter `confidence: low, source_count: 1`. Future ingests will enrich it via Diff.
4. Repair backlinks: ensure each linked page has a `## Mentioned in` section listing inbound source pages.

**Tools:** `Grep` (over the wiki tree), `Read`, `Edit` (existing pages' Mentioned-in sections), `Write` (stubs only).

### 4. Index Agent (a.k.a. Cataloger)

**One job:** keep `index.md` accurate and useful for humans browsing and for the Query Agent.

**Trigger:** after each ingest pass (debounced), or on demand.

**Procedure:**
1. Read all pages' frontmatter — frontmatter only, not bodies. Cheap.
2. Rebuild `index.md` sections: Entities, Concepts, Sources, Synthesis. Each entry is `[[slug]] — <one-line title> — <source_count> sources — updated <date>`.
3. Sort by `updated` descending within each section (most recently touched on top).
4. If `index.md` exceeds ~500 lines, split into `index/entities.md`, `index/concepts.md`, `index/sources.md`. `index.md` becomes a TOC.

**Tools:** `Bash` (frontmatter via `awk` / `yq`), `Write`.

### 5. Synthesizer Agent

**One job:** keep `synthesis.md` an honest, current top-level thesis.

**Trigger:** weekly, or when ≥5 new sources have landed since the last run, or `/wiki synth`.

**Procedure:**
1. Read `synthesis.md` (current thesis), `log.md` since last run, and the top-N most-updated entity and concept pages.
2. Update `synthesis.md`:
   - **Working thesis** — 1–2 paragraphs. The current best summary of what's been learned.
   - **What changed since last synthesis** — explicit deltas. Cite the sources that moved the needle.
   - **Open questions** — what we still don't know. This list IS the user's research backlog.
3. Append to `log.md`.

**Tools:** `Read` (broad), `Edit` (synthesis.md only).

**Why it's separate and infrequent:** synthesis is expensive (long context, careful reasoning). Running it on every ingest is wasteful and produces noisy churn. Running it on a cadence makes it a deliberate compounding step.

### 6. Lint Agent (a.k.a. Health Checker)

**One job:** find what's wrong with the wiki and propose fixes — never auto-apply.

**Trigger:** scheduled (e.g., weekly via the `/schedule` skill), or `/wiki lint`.

**Checks:**
- **Orphans** — pages with no inbound links.
- **Dead links** — `[[slug]]` targets that don't exist.
- **Stale claims** — entity pages whose `updated` is older than the source-of-truth supporting them. Detected by comparing page citations against `log.md`.
- **Unresolved contradictions** — `> CONTRADICTION` blocks older than N days.
- **Frequent-mention-no-page** — entities mentioned ≥3 times across sources but no entity page exists.
- **Index drift** — index entries pointing to deleted pages, or pages missing from the index.
- **Stub debt** — `confidence: low, source_count: 1` pages that haven't been enriched in M weeks.
- **Topic gaps** — concepts referenced inline (`[[concepts/x]]`) but no page exists.

**Output:** `wiki/_lint/<date>-report.md` — a checklist the user (or an agent) can act on. Each item has: severity, page, suggested action, link to evidence.

**Why it never auto-fixes:** lint is a cheap, broad scan; fixes are decisions that should be reviewed. Auto-fixing produces silent corruption.

**Tools:** `Bash` (greps), `Read`, `Write` (report only).

### 7. Query Agent (a.k.a. Synthesizer-on-demand)

**One job:** answer a question using the wiki + raw vector store, and offer to file the answer back.

**Trigger:** user asks a question in chat. (Track C.)

**Procedure:**
1. Classify the question:
   - Synthesis (`what do we know about…`) → wiki-first.
   - Verbatim (`show me the call where…`) → vector-first.
   - Hybrid (`what objections have we heard about pricing?`) → both.
2. **Wiki-first path:**
   - Read `index.md`, identify candidate pages.
   - Read those pages.
   - If pages cite chunk_ids and the user wants quotes, pull the chunks via `kb_search`.
3. **Vector-first path:**
   - `kb_search` returns chunks with citations.
   - Optionally read the wiki source pages corresponding to those chunks for context.
4. Compose answer. Use both citation styles (`[chunk_id]` for verbatim, `[[wiki:slug]]` for synthesis).
5. Offer: "This synthesis is novel — should I file it as `concepts/<slug>.md`?" If yes → hand to Curator Agent.

**Tools:** `kb_search` (Track A), `Read` (wiki pages), `Bash` (grep wiki).

### 8. Curator Agent (a.k.a. Promoter / Pruner)

**One job:** structural changes to the wiki — promotion, splitting, merging, archiving.

**Trigger:** manual (`/wiki curate`), Lint Agent suggestions, or Query Agent's "file this back" affirmative.

**Operations:**
- **Promote** a query answer or a recurring section in the log into its own page.
- **Split** a page that has grown past ~400 lines or covers multiple sub-topics into child pages with parent linking.
- **Merge** detected duplicates (e.g. `entities/foo-corp` + `entities/foo-co` both mean Foo Corp.) — merge content, leave a redirect stub at the old slug.
- **Archive** stale or superseded pages — move to `wiki/_archive/`, leave a "superseded by [[...]]" stub at the original location so links still resolve.

Always proposes diffs first. Never silently restructures.

**Tools:** `Read`, `Write`, `Edit`, `Bash` (renames).

### 9. Schema Agent (meta)

**One job:** keep `WIKI.md` aligned with how the wiki is actually being used.

**Trigger:** quarterly, or when convention violations show up repeatedly in lint reports.

**Procedure:**
- Read `WIKI.md` and a representative sample of recent pages.
- Identify drift: new conventions that emerged organically (e.g., a `provenance:` field that started appearing, or a `## See also` section everyone uses).
- Identify obsolete rules in `WIKI.md` that no one follows anymore.
- Propose updates to `WIKI.md` for the user to approve.

**Why this matters:** without a Schema Agent, conventions drift and old pages diverge from new ones. The Schema Agent + `WIKI.md` is what keeps the wiki *coherent* over years, not just *populated*.

**Tools:** `Read`, `Edit`.

---

## How the system grows over time

The wiki's behavior is qualitatively different at different scales. The agents are the same; what they *find* changes.

### Day 0 — empty
- `WIKI.md` is hand-authored or LLM-bootstrapped: defines layout, frontmatter, citation style, the agents' triggers.
- `index.md`, `log.md`, `synthesis.md` are empty stubs.
- No sources, no entities, no concepts.

### Day 1 — first source
- User drops a file in `raw/`, runs Track A. `kb.ingested` fires.
- Ingest Agent files `sources/<slug>.md`.
- Linker creates 3–5 entity stubs from mentions (low confidence, source_count=1).
- Index Agent populates `index.md`.
- `log.md` gets one entry.
- Synthesis is still mostly empty — there's nothing to synthesize from one source.

### Week 1 (~10 sources)
- Entity pages start to fill out — each gets multiple Diff Agent passes as new sources reinforce or qualify claims.
- First contradictions appear (`> CONTRADICTION` blocks); Lint Agent's first run flags them.
- No concept pages yet — concepts emerge from patterns the Ingest Agent doesn't see in single sources. Curator hasn't been called yet.
- `synthesis.md` is a paragraph of "early signals."

### Month 1 (~50 sources)
- Synthesizer Agent runs for real; produces a working thesis in `synthesis.md`.
- Concept pages start to form — the user notices recurring themes in the log, calls `/wiki curate`, Curator promotes them into `concepts/<slug>.md`.
- Lint Agent's "frequent-mention-no-page" finds 5–10 missing entities → adds to ingest backlog.
- Index is approaching ~100 entries; Index Agent considers splitting.
- The first Schema Agent review surfaces conventions worth codifying.

### Month 3 (~200 sources)
- `index.md` splits into `index/entities.md`, `index/concepts.md`, `index/sources.md`. `index.md` becomes a TOC.
- Synthesis has been updated 10+ times; the working thesis is now load-bearing.
- A new frontmatter field (e.g., `confidence:`) is added in the Schema Agent's first real review.
- Vector search **over the wiki itself** (`wiki_rag` — separate from `kb_search`) starts to be useful as a fallback when index lookup misses.
- The graph view in Obsidian is genuinely informative — hubs are visible, orphans are visible.

### Year 1 (~1000 sources)
- The wiki is the primary view; raw sources are referenced for verbatim only.
- Synthesis is mature; the **Open Questions** list in `synthesis.md` is the user's active research agenda.
- Curator runs more often; pruning + archiving become routine.
- The wiki may be shared with collaborators (PRs, suggestions, branches) — git-native.
- `WIKI.md` has been revised 4–5 times; the Schema Agent's role is to slow it down, not write it.

### What changes by scale

| Scale | What's hard | What dominates the agent workload |
| --- | --- | --- |
| <50 sources | Bootstrapping — what conventions to use | Ingest, Linker |
| 50–200 | Coherence — keeping pages consistent | Diff, Lint |
| 200–1000 | Findability — humans + agents navigating | Index, Curator, Schema |
| 1000+ | Synthesis — keeping the thesis honest | Synthesizer, Curator |

The agents are designed so that adding more sources doesn't make any single agent's job harder. Diff Agent's input is one page at a time — the wiki could have a million pages and the per-call context would be the same.

---

## Querying — patterns

### Pattern A: direct page lookup
> "Open `entities/supplier-foo`."

Single `Read`. The wiki *is* the answer.

### Pattern B: index-mediated lookup
> "What do we know about Foo Corp?"

Read `index.md` → find slug → read page → answer.

### Pattern C: synthesis question
> "How are our suppliers reacting to the new tariff?"

Read relevant entity pages (suppliers) + `concepts/tariff-response` if it exists. Compose answer. Offer to file as `concepts/tariff-response-2026-q2.md`.

### Pattern D: verbatim retrieval
> "Show me the call where someone said 'we won't ship east of the Mississippi.'"

`kb_search` → quote → cite `[chunk_id]`. Wiki not needed.

### Pattern E: hybrid — synthesis with quotes
> "What objections do customers raise about pricing?"

- Wiki: read `concepts/pricing-objections` for the typology.
- Vector: pull representative quotes for each objection type via `kb_search`.
- Answer combines structure (wiki) with evidence (vector).

### Pattern F: time-aware
> "What changed in Q1?"

`grep` `log.md` by date → get ingest list → read corresponding source pages → summarize.

### Pattern G: graph traversal
> "Walk from `entities/supplier-foo` through everything related."

Read page → follow `related:` frontmatter and inline `[[wikilinks]]` → recursive read with depth cap. Useful for "tell me everything connected to X."

### Pattern H: inverse — what's missing
> "What entities are mentioned in sources but don't have pages?"

Lint Agent's "frequent-mention-no-page" output is the answer. This is a research-direction prompt: the wiki tells you what to read next.

---

## Filing answers back

The compounding insight: **query answers are themselves valuable artifacts**. Every Pattern C / E / G answer is a candidate wiki page.

**Mechanism:**
1. After producing an answer, Query Agent asks: "File this as a new page?"
2. On yes → Curator Agent creates `concepts/<slug>.md` with the answer body, frontmatter, and citations.
3. Linker Agent updates inbound references from the entities the answer mentions.
4. Index Agent updates `index.md`.
5. `log.md` gets a `query-filed` entry distinct from `ingest`.

The wiki grows not just from sources but from explorations. Over time the wiki contains the questions you've asked and the synthesized answers — and those answers stay current because they're plain pages that future Diff Agent passes can update when new sources land.

---

## Why this design works

- **Specialization.** Small agents with narrow tools fail more obviously and recover more cheaply than one big agent. Each agent's prompt fits comfortably in context with room for its actual inputs.
- **Separation of read and write.** Ingest reads source + drafts; Diff edits existing pages; Linker bridges them. No agent both reads broadly and writes broadly.
- **Auditable.** `log.md` + git history make every change traceable to an event. If a claim looks wrong, you can find when it entered and why.
- **Composability with the vector store.** Wiki claims cite chunk_ids, so synthesis is always backed by a verifiable substrate. The wiki is not a replacement for raw retrieval — it's a structured cache *over* it.
- **Schema co-evolution.** `WIKI.md` + Schema Agent prevent the drift that kills hand-maintained wikis. Conventions tighten; old pages are migrated when it's worth doing.
- **Stable section headings.** This is the unsung load-bearing convention. Diff Agent's reliability depends on `## Pricing` always meaning the same thing across pages — that's what lets it edit one section without re-reading the whole page.
- **No agent is on a hot path for ingestion latency.** Synthesizer, Lint, Curator, Schema all run on cadences or on demand. The ingest path is short: Ingest → Linker → (Diff × N) → Index. Everything else compounds in the background.

---

## Q&A — answers to the load-bearing questions

Triaged from the design-interrogation question list for this track. Cut criteria: questions about ops detail (SLA targets, alert thresholds), pure UX phrasing, or already answered by the doc body. The ones below are the questions whose answer changes how the wiki actually behaves.

### §0 Purpose and constraints

**Q. Is the wiki primarily human-facing or agent-facing?**
Both, but **agent-facing first.** The wiki's job is to make the next chat answer better than the last by accumulating compiled knowledge. Humans browse it as a side benefit. Treating it as primarily human-facing leads to over-styling and under-structure.

**Q. What "trusted" bar must a page meet to ground a chat answer?**
- `source_count ≥ 2`, AND
- no unresolved `> CONTRADICTION` blocks, AND
- `confidence ≥ medium` in frontmatter.

Below the bar: chat agent cites the page but qualifies — "the wiki has a partial picture: …". Above it: the agent speaks authoritatively from the page.

**Q. Rollback strategy for a bad synthesis?**
Git revert the offending commit. Every wiki change is one commit per ingest/edit. The log entry stays (it records what happened); the page returns to its prior state.

### §1 Layout / IA

**Q. Are `sources / entities / concepts` enough?**
Yes for current scope. A fourth bucket (e.g. "playbooks") might emerge organically; let it surface in `_drafts/` first, then formalize via Schema Agent. Don't pre-add buckets.

**Q. How is `_drafts` leakage prevented?**
`wiki/_drafts/` is gitignored. Index Agent never reads from it. Curator Agent moves drafts to their final paths atomically before commit.

### §2 Page contract / frontmatter

**Q. Required vs optional frontmatter fields — who validates?**
WIKI.md declares per-type required fields (e.g., `entities/products/*` requires `brand, product_line_code, sku_count`). Lint Agent validates. Missing required fields → `_lint/` report; the page is flagged, not deleted.

**Q. `source_count` — manual or computed?**
Computed by Index Agent on each pass: count distinct `source_id`s in the page's citations. Never manually edited. Drift impossible if computation is the only writer.

**Q. Page-level vs claim-level confidence?**
Page-level for v1; claim-level too granular and noisy. When a page accumulates contradictory claims, `> CONTRADICTION` blocks (which are claim-level by location) carry the nuance. That's enough.

### §3 Citation grammar / resolvability

**Q. How is "every claim must be cited" enforced?**
Lint check: any sentence in a body section not ending in `[...]` or `[[...]]` is flagged `uncited_claim`. Not a blocker on the page; surfaced to the Diff Agent next time it touches that section.

**Q. Citation resolves but points to superseded content?**
Diff Agent leaves the original citation in place AND adds the newer source's citation alongside. Reader sees both. Time-stamped `> CONTRADICTION` blocks are the audit trail.

### §4 Structured-data integration

**Q. What threshold defines a "significant" SKU update?**
- Price change ≥ ±10% median.
- Total sales change ≥ ±25%.
- Sub-category re-assignment.
- Discontinuation flag set.

Other changes log silently. Tunable in `WIKI.md` per project.

**Q. Lazy SKU page — engagement reason in frontmatter?**
Yes: `entities/skus/<sku>.md` carries `created_reason: "mentioned-in-3-sources" | "user-query-2026-05-01" | "curator-promoted"`. Useful for future pruning and to explain why the page exists.

**Q. Recommendation methodology versioning?**
`concepts/recommendations/methodology` carries `methodology_version` in frontmatter. When the upstream pipeline changes its method, the version bumps and Diff Agent appends a "Method change" section noting what shifted.

### §5 Ingest Agent

**Q. Is playbook selection deterministic?**
Yes: `doc_kind → playbook` is a 1:1 lookup. No blended playbooks in v1 (they create unclear write-precedence). If a doc spans kinds (e.g., a brochure containing install instructions), the secondary content lands in the entity page's `## Open` section; Curator promotes to `concepts/install/...` if it warrants.

**Q. When are multimodal reads mandatory vs optional?**
Mandatory for `visual-catalog` and `presentation`. Optional (skipped unless content sparse) for `marketing`. Never used for `tech-bulletin`, `warranty`, `master-spec` (text-dominant). Encoded per playbook.

**Q. Max context footprint per ingest?**
Soft cap: 100K tokens of source text per Ingest Agent invocation. Above that, split: read TOC / first 10 pages, decide section boundaries, ingest section-by-section. PDFs > 200 pages get a "source-overview" page plus per-section child pages.

### §6 Diff Agent

**Q. >2 conflicting sources — which wins?**
Latest by source `year`, then by `confidence`, then by `source_id` lex order (deterministic tiebreaker). The conflict block lists ALL sources, not just the chosen primary. Reader sees the full disagreement.

**Q. `source_count` inflation from duplicate citations?**
Index Agent counts **distinct `source_id`s**, not citations. Same source cited 5 times = 1 toward `source_count`.

**Q. How is edit locality enforced?**
Diff Agent's prompt is constrained to one named section at a time. The agent receives `(page, section_name, current_section_text, proposed_change)` and returns `(new_section_text, frontmatter_updates)`. It can't see or edit other sections in that invocation.

### §7 Linker Agent

**Q. Slug normalization for `foo-co` vs `foo-corp`?**
Normalize to lowercase, replace runs of non-alphanumerics with `-`, strip leading/trailing `-`. Track a known-aliases file at `wiki/_aliases.md`: `foo-corp: [foo-co, foo company, foo-co-inc]`. Linker consults aliases before creating a new entity. Curator promotes recurring de-facto aliases into the file.

**Q. Stub creation minimum evidence?**
- Brand stub: 1 mention.
- Product-line stub: 1 mention.
- SKU stub: 3 mentions (or query-targeted, or curator-promoted).

**Q. Backlink thrash on high-centrality entities?**
The "Mentioned in" section is rebuilt on each Linker pass, not edited incrementally. For pages with > 50 backlinks, Linker collapses to "N source pages — see [[<entity>.backlinks]]" with an auto-generated companion file. Read-mostly, write-once-per-pass.

### §9 Synthesizer

**Q. Trigger condition?**
≥ 5 new sources OR ≥ 7 days since last run, whichever first. User can also force `/wiki synth`.

**Q. Anti-recency-bias?**
The Synthesizer prompt explicitly: "consider sources weighted by recency × confidence × source_count, not by recency alone." For each claim, the agent must cite at least one source older than 90 days if any exists for that claim.

**Q. Open Questions tracked as tasks?**
Each Open Question gets an ID (`OQ-<n>`). When a future ingest's claims could resolve it, Diff Agent appends "Possibly resolves OQ-N: [chunk_id]" to the relevant entity page. Curator periodically clears resolved questions.

### §10 Lint Agent

**Q. Blocker vs advisory findings?**
Blockers: broken citations, schema violations on required frontmatter, dead `[[wiki:...]]` links.
Advisory: orphans, stale claims, stub debt, frequent-mention-no-page.

**Q. Citation-supports-claim semantic check?**
v2. The cheap version (citation resolves) catches structural breakage. The expensive version (does the cited chunk semantically support the sentence) needs an LLM pass; ship when contradictions accumulate enough to justify the cost.

### §11 Curator

**Q. Hard criteria for split / merge / archive?**
- Split: page > 400 lines OR > 3 distinct sub-topics in `## Open`.
- Merge: alias-detected duplicates with body overlap > 70%.
- Archive: page unchanged for 180 days AND `source_count` < 2 AND no inbound links.

**Q. Provenance preservation through merges?**
Merged page carries `merged_from: [<old-slug-1>, <old-slug-2>]` in frontmatter. Old paths get redirect stubs (`# Moved → [[wiki:new-slug]]`). All citations resolve transparently via the stub.

### §12 Schema Agent

**Q. Cadence relative to growth?**
Every 50 ingested sources OR 90 days, whichever first. Frequent enough to catch convention drift, infrequent enough not to thrash conventions.

**Q. Auto-detecting emergent conventions?**
Lint runs a "novel frontmatter keys" check: any key on ≥ 5 pages but not in WIKI.md is reported. Schema Agent's quarterly review starts from that report.

### §13 Scale / ops

**Q. When does `wiki_lookup` need a real backend beyond index scans?**
- ~500 pages → BM25 over `wiki/.search/` (added by Index Agent).
- ~5000 pages → embedding-based `wiki_search` tool.
Build BM25 first; the upgrade path is additive.

**Q. Backup / DR?**
Git is the backup. `git push` on every Curator/Schema run is the off-site copy. No separate snapshot system needed.

### §14 Human workflow / trust

**Q. Where do humans intervene by design?**
- Doc-kind override (`/wiki reingest --playbook=`).
- Curator approvals (always assisted).
- Schema changes (always assisted).
- Contradiction resolution (chat surfaces; user decides).
- Lint triage (user picks what to fix).

**Q. Default ingest / per-agent automation modes?**

| Agent | Default mode | Why |
| --- | --- | --- |
| Ingest | assisted (first ~50 sources, then autonomous) | outputs need review until conventions stabilize |
| Diff | matches Ingest | contradiction handling needs human judgment early |
| Linker | autonomous | stub creation is mechanical |
| Index | autonomous | catalog-only; no editorial decisions |
| Synthesizer | autonomous (weekly) | edits only `synthesis.md`; low blast radius |
| Lint | autonomous | writes reports only; never modifies pages |
| Curator | always assisted | splits, merges, archives are structural |
| Schema | always assisted | affects every future page |

**Q. Low-confidence pages in chat UI?**
When the chat agent grounds an answer in a `confidence: low` page, the response is prefixed with "(working understanding, only N sources)". Hedging is baked into the prompt template, not optional.

**Q. Concurrent writes to the same page?**
Per-page FIFO at `_drafts/diff-queue/<page-slug>.json`. Diff Agent processes one page's queue serially; queues for different pages run in parallel. Each Diff run is one git commit — never a merge conflict. The queue file is the lock.
