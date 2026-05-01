# Track C — Chat Integration

How the chat agent uses both retrieval surfaces (Track A's pgvector index and Track B's wiki) to answer questions, and how answers feed back into the wiki.

This track is the **interface**. It's where the user actually talks to the system. Tracks A and B make the substrate; Track C makes it queryable.

The chat agent has a **flat tool registry** that it uses via the standard tool-use protocol. There is no classifier or router in front of the tools — the LLM sees the registry, reads each tool's description, and decides which to call (and in what order) based on the question.

Tools fall into three conceptual groups (useful for organization, not for runtime routing):

1. **Retrieval tools** — `kb_search`, `wiki_lookup`, `wiki_read`, `wiki_grep`, `wiki_log`, `image_view`.
2. **Structured-data tools** — `catalog_*`, `recommendations_*`. Direct, deterministic lookups against `product_catalog.json` and `recommendations.json`.
3. **Bundled / composite helpers** (optional) — `product_dossier`, `compare`, `wiki_compare`, `drift_check`. Pre-built fan-outs for common cost-sensitive patterns. The LLM can use them when the question matches, or roll its own composition by calling primitives.

The system prompt + tool descriptions are the routing logic. There is no separate "decision rules" function.

## Architecture: tool-use, not routing

```
                ┌─────────────────────────────┐
                │    USER question            │
                └──────────────┬──────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │   Chat Agent (LLM, tool-use loop)  │
              │   system prompt declares the       │
              │   tool registry + when each is     │
              │   appropriate                      │
              └─────┬─────────┬─────────┬─────┬────┘
                    │         │         │     │  LLM emits tool_use
                    │         │         │     │  blocks; runtime
                    ▼         ▼         ▼     ▼  executes them
              kb_search    wiki_*       catalog_*    image_view
                                        recommendations_*
                    │         │         │     │
                    ▼         ▼         ▼     ▼
              pgvector    wiki/ md fs   JSON files   kb_extracts/
                                        (catalog,    img/
                                         recs)
                    │         │         │     │
                    └────── results back to LLM ────┘
                               │
                               ▼  LLM reads results, decides
                               │  whether to call more tools
                               ▼
                          final answer
```

**Why this shape:**
- **Substrates are agent-accessible, not pre-routed.** Each substrate is reachable via tool-use; the LLM picks the path.
- **Composability isn't pre-baked.** The LLM can chain `catalog_get` → `wiki_read` → `kb_search` organically when the question warrants it, without a hardcoded `product_dossier` template.
- **Tool descriptions ARE the routing logic.** Tight, behavior-specific descriptions tell the LLM when each tool is appropriate. Updates to routing happen via prompt changes, not classifier code.
- **User-facing overrides stay.** Prefix triggers (`/vector`, `/wiki`, `/catalog`, `/calls`) short-circuit the LLM's choice when the user wants a specific substrate.
- **Bundled tools are convenience, not gates.** `product_dossier` exists as a single-tool optimization for hot, cost-sensitive paths — but the LLM can equally call its primitives.

**Tradeoffs:** less deterministic (LLM picks vary turn-to-turn); higher per-turn cost (LLM does the routing rather than a regex); test assertions move from "what route was picked" to "what tool sequence was emitted."

## Layer 1 — Retrieval tools

### `kb_search(query, scope?, k=8)` — vector retrieval
- Hits `kb_rag_chunks` (and `call_rag_chunks`, the Sauron table — both have the same shape).
- Returns: `[{chunk_id, content, source_id, locator, score}]`.
- Use for: verbatim retrieval, "find the document where X."

### `wiki_lookup(query)` — wiki, index-first
- Reads `wiki/index.md` (or split index files at scale).
- Ranks candidate pages by title/tag/slug match against the query.
- Reads the top N pages and returns their content + paths.
- Use for: synthesis, "what do we know about X."

### `wiki_read(path)` — direct page read
- Reads a specific wiki page by path.
- Use for: follow-up questions ("tell me more about the supplier you just mentioned"), graph traversal.

### `wiki_grep(pattern)` — fallback search
- Greps the wiki tree for a literal/regex.
- Use when index lookup misses (rare but real).

### `wiki_log(since?, kind?)` — time-aware
- Reads `wiki/log.md`, optionally filtered by date or event kind (`ingest|query-filed|synth|lint`).
- Use for "what changed since…" questions.

### `image_view(path)` — multimodal
- Loads an extracted image from `kb_extracts/<source_id>/img/<...>`.
- Returns the image for the agent's vision pass.
- Use when an answer references a `[image:<path>]` citation and the user wants to see the image, OR when the agent itself needs to look at a diagram to answer.

---

## Layer 2 — Structured-data tools

These are **deterministic, no-LLM lookups** against `product_catalog.json` and `recommendations.json`. They're cheap, fast, exact, and they form the backbone for product-specific questions. The chat agent should prefer them over vector search for any question that has a stable identifier (SKU, product line code, sub-category).

Every tool returns records with their citation form pre-formatted, so the agent can quote them directly without manual formatting.

### Catalog tools

#### `catalog_get(sku)` — fetch one SKU
- Returns: `{sku, description, product_line_code, product_line, sub_category, source_material, uom, unit_price_avg, unit_price_median, unit_cost_avg, unit_cost_median, total_qty_sold, total_sales, gp_pct_median, citation: "[catalog:sku=<sku>]"}` or `null`.
- Cheap — direct dict lookup keyed on SKU.
- Use for: "tell me about SKU X", or any time the agent has a SKU and needs its data.

#### `catalog_list({product_line?, sub_category?, brand?, min_sales?, max_sales?, sort_by?, top_n?})` — filtered list
- Filters the catalog by any combination of the above.
- `sort_by`: `total_sales | unit_price_median | gp_pct_median | sku | total_qty_sold` (asc/desc).
- `top_n`: limit (default 50).
- Returns an array of records with citations attached.
- Use for: "show me top 10 SKUs in product line AT by sales", "list all loss-making SKUs in Voyage decking".

#### `catalog_search(query, k=10)` — semantic + lexical
- Hybrid search: lexical match on description + embedding similarity (uses the per-SKU canonical-rendered chunks from Track A).
- Returns: ranked SKU records with score.
- Use when the user describes a product without naming a SKU: "find me composite decking that comes in tropical colors".

#### `catalog_aggregate({group_by, metric, filter?})` — rollups
- `group_by`: `product_line | product_line_code | sub_category | brand | uom`.
- `metric`: `count | sum_total_sales | avg_unit_price | avg_gp_pct | sum_total_qty_sold`.
- `filter`: same shape as `catalog_list`.
- Returns: `[{group_value, metric_value, sample_skus}]`.
- Use for: "what's the total sales by product line for Deckorators?", "average margin by sub-category".

#### `catalog_compare(skus[])` — side-by-side
- Returns: a structured comparison `{fields: [...], rows: [{sku, description, ...field_values, citation}]}`.
- Numeric deltas computed pairwise (vs. first SKU in the list, plus min/max/median across the set).
- Use for: "compare DK35031021, DK35031612, and DK35032112". Returns a comparison table the agent can render directly in the chat.

#### `catalog_neighbors(sku, by="price"|"margin"|"sales"|"description", k=10)` — nearest peers
- Returns: SKUs similar to `sku` along the chosen dimension. `by="description"` uses embedding similarity; the others use numeric distance within the same `sub_category`.
- Use for: "what other products are priced similarly to DK35031021?", "find SKUs in Voyage with worse margins than this one".

#### `catalog_diff(sku_a, sku_b)` — paired diff
- Returns: `{shared: {...}, only_a: {...}, only_b: {...}, numeric_deltas: {field: {a, b, abs_delta, pct_delta}}}`.
- A more focused version of `catalog_compare` for two SKUs.

### Recommendation tools

#### `recommendations_for(sku_or_subcat, kind?)` — fetch rules
- `kind`: `cross_sell | upsell | margin_substitution | all`.
- For `cross_sell`: takes a `sub_category`. For `upsell` / `margin_substitution`: takes a SKU.
- Returns the rule list with full record + citation: `{rules: [{...rule, citation: "[recs:upsell:DK35031021#0]"}]}`.
- Use for: "what should I cross-sell with this product?", "what's the upsell ladder for SKU X?".

#### `recommendations_explain(rule_citation)` — unpack a rule
- Returns: `{rule, methodology_text, related_skus_with_catalog_data, related_calls_via_kb_search?}`.
- Pulls the methodology block from `concepts/recommendations/methodology` (Track B) so explanations cite the method.
- Use when the user asks "*why* is X recommended for Y?" — answers with the rule + the method + the underlying SKU data.

#### `recommendations_top({kind, by, top_n=10, filter?})` — surface top opportunities
- `by`: `confidence | lift | co_invoices | price_uplift_pct | gp_pct_uplift_pp`.
- `filter`: by product line, sub-category, brand.
- Returns ranked rules with citations.
- Use for: "biggest cross-sell opportunities in Deckorators", "highest-margin upsell ladder we have".

### Why direct, not via vector search

`product_catalog.json` is structured. Vector retrieval over it would be lossy and slow. Direct dict/index lookups give:

- **Exact answers** for SKU-keyed questions.
- **Aggregations** vector retrieval can't do (sums, averages, group-bys).
- **Citations that resolve in O(1)** to the underlying record.
- **Comparisons** as first-class operations rather than the agent piecing them together from chunks.

Vector retrieval over the catalog (via `catalog_search`) is reserved for **fuzzy description matching** — when the user describes a product without naming it. Everything else goes through the structured tools.

---

## Layer 3 — Bundled / composite helpers (optional)

These are **pre-built fan-out tools** that the LLM may invoke instead of orchestrating primitives itself. They're optimizations, not gates — every composite below can be replicated by the LLM calling the primitive tools in sequence/parallel. They exist for:

- **Cost-sensitive hot paths** — when the same fan-out runs thousands of times, one composite call beats N parallel LLM-mediated tool calls on token budget.
- **Hard cost budgets** — composites can short-circuit at a defined ceiling, which is awkward to enforce when the LLM is choosing tools turn-by-turn.
- **Standardized output shapes** — a deterministic schema is easier for downstream rendering than free-form LLM compositions.

The LLM's tool description for each composite explicitly says: "use this when the question is purely '<canonical pattern>'; otherwise prefer composing primitives." The LLM is free to ignore.

### `product_dossier(target)` — the canonical product lookup

- `target`: a SKU, product-line code, or product-line name.
- Returns a unified record:
  ```yaml
  target: { kind: "sku" | "product_line", id, display_name }
  catalog:
    record: { ...catalog_get / aggregate result }
    citation: "[catalog:sku=...]"
  wiki:
    page_path: "wiki/entities/products/<line>.md" or "wiki/entities/skus/<sku>.md"
    summary: "<first paragraph of the wiki page>"
    sections: [section_heading, ...]
  documents:
    sources: [{source_id, title, doc_kind, year, citation: "[doc:...]"}]
    image_count: N
  recommendations:
    cross_sell: [...rules...]
    upsell: [...rules...]
    substitution: [...rules...]
  calls:
    mentioning: [{call_id, snippet, citation: "[call:...]"}]
  drift_flags:
    - "Brochure claims 50yr warranty; latest spec sheet says 25yr"
  ```
- Implementation: parallel calls to `catalog_get` / `catalog_list`, `wiki_lookup`/`wiki_read`, `kb_search`, `recommendations_for`. Citations are attached so the answer can quote any field.
- Use for: "tell me everything about <SKU/product>". This is the workhorse query.

### `compare(targets[], dimensions?)` — multi-target comparison

- `targets`: 2..N SKUs OR 2..N product lines OR 2..N entity slugs.
- `dimensions` (optional): which axes to compare on. If omitted, the tool picks defaults based on target kind.
  - SKUs default → `[unit_price, gp_pct, total_sales, total_qty_sold, sub_category]`.
  - Product lines default → `[sku_count, total_sales_year, sub_categories, top_skus, brands]`.
  - Entities default → `[positioning, applications, install_complexity, warranty_years, color_options]` (read from wiki frontmatter + structured sections).
- Returns: a comparison matrix with citations per cell.
- Internally uses: `catalog_compare` (for catalog axes) + `wiki_compare` (reads N entity pages, intersects sections) + optional `kb_search` for verbatim differences.
- Use for: "compare Captivate vs Evolution", "compare Voyage vs Vista decking", "compare these three SKUs side-by-side".

### `wiki_compare(slugs[])` — wiki-only comparison
- Reads N entity pages, returns: `{frontmatter_diff, shared_sections, divergent_sections, citation_overlap}`.
- Used by `compare` when targets are entity slugs.
- Use directly for: "what does the wiki say differently about Trex vs Fiberon decking?"

### `drift_check(target)` — contradiction surfacing
- For a SKU or entity: cross-checks claims across catalog data + wiki page + cited documents + recent calls.
- Returns flagged inconsistencies with the conflicting citations.
- Examples: warranty length differs between brochure and spec sheet; catalog shows SKU has $0 sales for 2 quarters but it's still on the active line card.
- Use for: "is anything inconsistent about product X?" — and used proactively by the Lint Agent (Track B) on a schedule.

---

## Tool selection guidance (baked into tool descriptions)

There is no external classifier. Each tool's description in the system prompt tells the LLM when it's appropriate. The table below is what those descriptions communicate to the LLM — it's the *content* of the routing logic, not a runtime if-then-else:

| Question shape | Tool the description suggests |
|---|---|
| specific SKU / product-line code mentioned | `catalog_get`, `catalog_list` |
| "compare 2+ products / SKUs" | LLM composes `catalog_compare` + `wiki_compare` (or calls bundled `compare`) |
| numeric aggregation across groups | `catalog_aggregate` |
| recommendations / cross-sell / upsell | `recommendations_for`, `recommendations_top` |
| "why is X recommended for Y?" | `recommendations_explain` |
| fuzzy product description ("show me composite decking that…") | `catalog_search` |
| person / supplier / customer / concept | `wiki_lookup` |
| time-bounded ("what changed since…") | `wiki_log` + `wiki_lookup` |
| open-ended product question ("tell me about X") | LLM composes catalog + wiki + kb + recs (or calls bundled `product_dossier`) |
| verbatim quote ("show me the words") | `kb_search` |
| hybrid (typology + quotes) | `wiki_lookup` then `kb_search` |
| drift / inconsistency check | LLM composes (or calls bundled `drift_check`) |

**User-facing overrides** (force-route prefixes):
- `/vector <q>` → forces `kb_search` first
- `/wiki <q>` → forces `wiki_lookup` first
- `/catalog <q>` → forces structured-data tools first
- `/calls <q>` → forces `kb_search(scope=call)` first

These short-circuit the LLM's tool selection and are useful for power users / debugging.

## Common LLM tool-call patterns

These are patterns the LLM tends to follow once the tool registry is loaded. They are **observed/recommended sequences, not enforced routes** — the LLM may take other paths when the question warrants. The runtime logs tool sequences for audit.

### Pathway: "Tell me about SKU PGFGD"
```
product_dossier("PGFGD")
  ├─ catalog_get("PGFGD")                              → catalog row + citation
  ├─ wiki_lookup("PGFGD") || wiki_read entity page     → wiki page (if exists)
  ├─ kb_search("PGFGD", k=5)                           → docs that mention this SKU
  ├─ recommendations_for("PGFGD")                      → upsell + substitution rules
  └─ kb_search across call_rag_chunks for "PGFGD"      → relevant calls
→ unified answer with citations from all four substrates
```

### Pathway: "What products should I cross-sell with cedar decking?"
```
recommendations_for("CD-RC-RCDeck", kind="cross_sell")
  → top rules with [recs:cross_sell:CD-RC-RCDeck#N] citations
  → for each recommended sub_category, optionally catalog_aggregate to show breadth
  → wiki_lookup("cross-sell cedar") for any compiled concept page
→ rules + structured rationale + wiki context if available
```

### Pathway: "Compare Voyage vs Vista decking"
```
compare(["Voyage", "Vista"])
  ├─ wiki_compare(["entities/products/voyage", "entities/products/vista"])
  ├─ catalog_aggregate({group_by: "product_line", filter: {product_line: ["Voyage", "Vista"]}})
  └─ kb_search for direct comparative content (sometimes brochures pre-compare)
→ comparison table with citations per row
```

### Pathway: "What's our highest-margin upsell opportunity in decking?"
```
recommendations_top({kind: "upsell", by: "gp_pct_uplift_pp", filter: {product_line_prefix: "DK"}, top_n: 10})
  → ranked rules
  → for top rule: product_dossier(rule.sku) + product_dossier(rule.recommended_sku)
→ "These five upsell ladders represent the most margin uplift; here's the context for the top one."
```

### Pathway: "Show me all install guides for AZEK products"
```
catalog_aggregate (or wiki_lookup) to enumerate AZEK product lines
  → wiki_grep("doc_kind: install") filtered to those product lines
  → return list of source pages with summaries + links to the install concept pages
```

### Pathway: "Find me the brochure that talks about hidden fasteners"
```
kb_search("hidden fasteners", k=10)
  → chunks with [doc:<chunk_id>]
  → for top chunks, resolve to source pages: kb_search returns source_id; wiki_read(sources/<slug-from-source-id>)
→ ranked list of brochures with the relevant snippet and link to the source page
```

### Pathway: "Is anything inconsistent about Evolution decking?"
```
drift_check("Evolution")
  → check warranty across {brochure, spec sheet, warranty doc}
  → check SKU set: catalog vs line card mentions
  → check claimed install procedure: latest install guide vs older versions
→ list of contradictions with citations on each side
```

### Pathway: "What changed in our knowledge of Voyage decking this quarter?"
```
wiki_log(since: "2026-01-01", kind: "ingest")
  → filter entries with product_line=Voyage
  → for each: wiki_read(sources/<slug>)
  → diff entity page Voyage's git history for the same period
→ chronological summary of what new sources changed our model of Voyage
```

## Citation styles

Six citation forms are valid in answers. Each resolves deterministically. The agent picks the right form for each claim; good answers mix them.

| Form | What it points to | Resolved via | Use for |
| --- | --- | --- | --- |
| `[doc:<chunk_id>]` | a chunk in `kb_rag_chunks` | `kb_search` / direct DB lookup | verbatim quote from a document |
| `[image:<path>]` | an extracted image under `kb_extracts/` | `image_view` | visual evidence (color swatch, diagram, chart) |
| `[call:<chunk_id>]` | a chunk in `call_rag_chunks` | `kb_search` (call scope) | verbatim quote from a sales call |
| `[catalog:sku=<sku>]` / `[catalog:line=<code>]` / `[catalog:sub=<code>]` | a record in `product_catalog.json` | `catalog_get` / direct lookup | numeric facts about a product |
| `[recs:<kind>:<key>#<idx>]` / `[recs:method=<kind>]` | a recommendation rule or method block | `recommendations_explain` | recommendation rationale |
| `[[wiki:<slug>]]` | a wiki page | `wiki_read` | synthesis citation; the page itself bottoms out in the above forms |

**Rules:**

- Numeric facts about products → `[catalog:...]`. Never paraphrase pricing/sales numbers without this citation.
- Direct quotes → `[doc:...]` or `[call:...]`.
- Recommendation rules → `[recs:...]` is mandatory; the methodology citation `[recs:method=cross_sell]` should accompany when explaining *why*.
- Synthesis claims → `[[wiki:...]]` is acceptable but should ideally be backed by the source citations the wiki page itself carries.
- Mixed claims are common and good: "Voyage decking sells $X annually [catalog:line=DK-MBC-VOYAGE], and customers report it competes well against Trex Transcend on color matching [doc:abc123_p004_00002] [call:c0042_00007]."

## Filing answers back into the wiki

The Track B "Pattern" — every synthesis-style answer is a candidate page.

**Flow:**
1. Chat agent finishes a Pattern C / E / G answer (synthesis or hybrid).
2. Asks: "File this as `concepts/<slug>.md`? (Y / suggest different slug / skip)"
3. **Yes** → spawns the Curator Agent (Track B), which creates the page, writes the citation chain, hands to the Linker Agent for cross-references.
4. **Suggest different slug** → Curator creates with that slug.
5. **Skip** → answer is recorded in `wiki/log.md` as a `query` event with the question and a link to the chat transcript reference, but no page created. Future `wiki_lookup` won't find it; the question is recorded for the user's reference.

## Tool boundaries

- The chat agent **never** writes to pgvector. Only Track A's CLI does. Vector store is immutable from the chat path.
- The chat agent **never** writes to `product_catalog.json` / `recommendations.json`. Those are upstream artifacts, regenerated by their own data pipelines. The chat layer is read-only against them.
- The chat agent **may trigger** Track B agents (Curator, Linker, Synthesizer) but doesn't itself edit wiki pages outside that mediation. Even quick edits go through an agent so logging and linking happen.
- All writes appear in `wiki/log.md` and in git history.

## Tool implementation surface

For grounding, here's where each tool lives in the codebase (proposed; mirrors how the existing Sauron RAG is exposed in [frontend/vite.ozRagCallsApi.ts](../../frontend/vite.ozRagCallsApi.ts)):

| Tool | Implementation |
| --- | --- |
| `kb_search`, `image_view` | Vite dev API endpoint backed by pgvector / file system |
| `wiki_lookup`, `wiki_read`, `wiki_grep`, `wiki_log` | Filesystem reads on `wiki/` (no DB) — fast, deterministic |
| `catalog_*` | In-memory index loaded from `product_catalog.json` at server startup; refreshed on file mtime change. Endpoints under `/api/oz/catalog/*` |
| `recommendations_*` | In-memory index loaded from `recommendations.json` at server startup |
| `product_dossier`, `compare`, `drift_check` | Server-side composite handlers that call the above tools and merge results |

The chat agent calls these as native tools (function-call style). Each returns JSON with citations pre-formatted; the agent quotes them directly without reformatting.

## Example sessions

### Session 1 — Product question (LLM composes primitives via tool-use)

```
User: Tell me about SKU DK35031021 and what we should upsell from it.

LLM emits tool_use blocks (parallel):
  catalog_get("DK35031021")
    → { description: "21' TUNDRA SOLID", sub_category: "DK-MBC-VOYAGE",
        unit_price_median: 20.00, gp_pct_median: -243.69,
        citation: "[catalog:sku=DK35031021]" }
  wiki_lookup("DK35031021 Tundra Voyage")
    → entities/products/voyage.md
  kb_search("DK35031021 Tundra", k=4)
    → brochure chunks
  recommendations_for("DK35031021", kind="upsell")
    → 5 upsell rules, top: DK35031612 (12' COSTA SLOTTED),
      price_uplift_pct: 188.3, citation: "[recs:upsell:DK35031021#0]"

  (Alternatively, the LLM could call the bundled product_dossier("DK35031021")
   for a single tool_use. Either path produces the same answer; the bundled
   path saves tokens at scale.)

Agent answers:
  "DK35031021 (21' Tundra Solid) is in the Voyage decking line [catalog:sku=DK35031021].
   Notable: median unit price $20.00 with a -243.69% gross margin — this is a
   loss-making SKU [catalog:sku=DK35031021]. The Voyage line is positioned as
   Deckorators' mid-tier composite [doc:abc123_p001_00000].

   Top upsell opportunities (all from [[wiki:concepts/recommendations/upsell]]):
   1. 12' Costa Slotted (DK35031612) — +188% price, 23.9% margin
      [recs:upsell:DK35031021#0]
   2. 12' Mesa Slotted (DK35032112) — +189% price, 24.6% margin
      [recs:upsell:DK35031021#1]
   3. 12' Khaya Slotted (DK39357912) — +192% price, 25.2% margin
      [recs:upsell:DK35031021#2]

   The negative margin on the source SKU explains why every recommended upsell
   shows >180% price uplift — the upsell isn't just a margin win, it's recovering
   from a loss. Method: [recs:method=upsell]."

Agent offers:
  "Want me to file this as concepts/voyage-tundra-margin-recovery.md?"
```

### Session 2 — Comparison (LLM chains primitives, or calls bundled `compare`)

```
User: Compare Captivate and Evolution for residential siding.

LLM emits tool_use blocks:
  wiki_compare(["entities/products/captivate", "entities/products/evolution"])
  catalog_aggregate({group_by: "product_line",
                     filter: {product_line: ["Captivate", "Evolution"]}})
  kb_search("Captivate Evolution comparison residential", k=6)

  (Or, equivalently, one tool_use to bundled compare(...) with the same
   dimensions specified.)

Agent returns a comparison table with citations per cell, e.g.:
  | Dimension | Captivate | Evolution |
  |---|---|---|
  | Brand | AZEK [doc:...] | TimberTech [doc:...] |
  | Warranty | 30-year limited [doc:...] | Lifetime limited [doc:...] |
  | Color count | 12 (Captivate Color Chart) [doc:...] | 8 [doc:...] |
  | Total sales | $X [catalog:line=...] | $Y [catalog:line=...] |
  | Cross-sells with | trim/moulding [recs:...] | decking [recs:...] |
  ...
```

### Session 3 — Synthesis question (LLM picks wiki-first)

```
User: What are the most common objections we hear about lead times?

LLM (no SKU/code in question; tool descriptions point to wiki for "objections")
emits:
  wiki_lookup("lead time objections")
  → candidates: [concepts/objections/lead-time, entities/customer-foo, ...]
  wiki_read("concepts/objections/lead-time")
  → 4 objection types, 12 cited call chunks

Agent answers using wiki structure + call quotes:
  "Four common objections, with frequency:
   1. 'Too long for the project timeline' (8 sources, e.g. [call:c0023_00001])
   2. 'Inconsistent — last shipment was late' (5 sources, e.g. [call:c0042_00004])
   3. ...
   See [[wiki:concepts/objections/lead-time]] for the full breakdown."

Agent offers to file a Q2 snapshot. User says yes → Curator Agent creates the page.
```

## Scaling notes

- At ~500 wiki pages, `wiki_lookup` should switch from "read the full index" to "search the index" (qmd, BM25, or vector over wiki frontmatter).
- A separate `wiki_rag_chunks` table — embeddings of wiki pages themselves — becomes useful past ~1000 pages. That's "RAG over the compiled view," distinct from `kb_search`'s "RAG over raw sources." The chat agent gets a third retrieval tool: `wiki_search`.
- Three retrieval surfaces at scale:
  - `kb_search` — raw chunks (primary substrate).
  - `wiki_lookup` — index-mediated page reads (curated structure).
  - `wiki_search` — vector over wiki pages (fallback for "I don't know the slug").
- The LLM picks one (or composes) via tool-use as before; nothing else changes about the rest of the system.

## Failure modes

| Failure | Behavior |
| --- | --- |
| `wiki_lookup` returns nothing | Fall back to `kb_search`; tell the user "no compiled answer yet — pulling raw quotes." |
| `kb_search` returns nothing | Tell the user; offer to ingest a source. Don't fabricate. |
| Chunk cited in wiki no longer exists (deleted source) | Lint Agent should have caught this; the answer notes the broken reference. |
| Wiki page conflicts with vector quotes | Surface the contradiction explicitly; offer to file a `> CONTRADICTION` block via Diff Agent. |

The chat agent is honest about the seams: when the wiki and the raw sources disagree, that's information, not a bug to paper over.

---

## Q&A — answers to the load-bearing questions

Triaged from the design-interrogation question list for this track. Cut criteria: questions about evaluation methodology (benchmark suite design, KPI thresholds), broad rollout planning, and pure UX phrasing details. The ones below are the questions whose answer changes how the chat agent actually behaves.

### §0 Product / UX

**Q. Success metrics?**
- **Citation coverage** — % of factual claims with structured citations (target ≥ 95%).
- **Wiki-first hit rate** — % of synthesis questions answered without falling back to `kb_search` (rises over time as the wiki compiles).
- **"File this back" acceptance** — % of offered filings the user accepts (signal that synthesis answers are novel and useful).
- **Latency** — simple lookup p95 < 2s; multi-tool composite path p95 < 8s (whether composed by the LLM or via a bundled tool).

**Q. Behavior when confidence is low but user wants definitive?**
Answer with "Best understanding from N sources: …" + the answer + a "Confidence: low" footer. Never claim certainty when wiki + retrieval don't support it. Offer "Want me to scope a follow-up search?" or "Ingest a specific source?"

### §1 Tooling layers

**Q. Three layers — overkill for v1?**
The first two are mandatory; Layer 3 (composites) is optional. Layer 2 (structured) is mandatory because catalog and recommendations exist with stable IDs; vector retrieval over them is wasteful. Layer 3 composites are bundled fan-outs that the LLM *may* call as cost-sensitive optimizations — the same fan-out is achievable by the LLM composing primitives directly via tool-use. Ship Layers 1+2 first; add Layer 3 helpers when token-cost or latency on hot paths demands it.

**Q. Read-only enforcement against vector + JSON?**
Tool implementations live in a backend module with explicit read-only Postgres role (SELECT only) and read-only file handles to the JSON files. The chat agent has no write tools to those substrates by construction.

### §2 Retrieval layer

**Q. How does `wiki_lookup` actually rank candidate pages?**
Not "ask the LLM to pick" (expensive, non-deterministic). The pipeline:

1. Exact slug match → highest weight.
2. Frontmatter `tags` match → high.
3. Frontmatter `title` token overlap → medium.
4. BM25 over `wiki/.search/` index (rebuilt by Index Agent each pass).
5. At > 500 pages: add embedding similarity over page summaries via `wiki_search`. Don't add earlier; BM25 is enough.

Agent reads top 3 pages by default (configurable). Returning scores lets the agent decide when to cast wider.

**Q. Conflict policy when `wiki_lookup` and `kb_search` disagree?**
**Wiki is authoritative for synthesis; vector is authoritative for verbatim quotes.** On a fact conflict:

- Agent never silently picks. Both are surfaced.
- Format: "The wiki says X [[wiki:slug]], but a quoted source says Y [doc:chunk_id]. These disagree."
- Offer: "Want me to file a `> CONTRADICTION` on [[wiki:slug]] via the Diff Agent?"

This is the wiki's compounding mechanism in the chat layer.

**Q. Stale wiki summary outranking fresh raw evidence?**
Page frontmatter `updated` is part of the wiki ranking score (newer scores higher). Plus: for high-stakes answers (warranty, pricing), the agent always pulls a verbatim `kb_search` quote alongside the wiki summary even when the wiki page seems sufficient.

**Q. `image_view` path traversal safety?**
Paths must start with `kb_extracts/` and resolve (after `realpath`) to a file inside that directory. Any `..` or absolute path → reject. Whitelist-only.

### §3 Structured-data layer

**Q. Direct lookups always preferred over context inference?**
Yes when a stable ID is present in the question. Tool descriptions explicitly say "use this when the question contains a SKU code matching `[A-Z]{2}\d{8}` or a product-line code from the catalog." The LLM picks Layer 2 directly when the pattern is obvious. Context inference (e.g., "the user means SKU X based on prior turn") is a fallback, not a default.

**Q. Freshness when JSON sources update mid-session?**
Tools watch file mtime; on change, in-memory indices reload. Mid-answer reloads are skipped (would change citations under the LLM's feet); reload happens between turns.

**Q. Null / missing fields?**
Tools return `null`, never `0` or `""`. Renderers display "—". Agent prompt guidance includes "do not assume defaults for null fields."

**Q. Aggregations over outliers?**
Aggregation tools include count, sum, avg, **median, p25, p75** by default — outliers visible without a second call. Currency / unit consistency is the catalog's responsibility (Track A flags inconsistent UoMs in `meta`).

### §4 Bundled / composite helpers

**Q. When are bundled composites worth building?**
When (a) the same fan-out is the LLM's first move > 100 times/day and the per-turn token cost adds up, or (b) the path needs hard cost-budget enforcement that's awkward when the LLM is choosing tools turn-by-turn, or (c) downstream rendering wants a deterministic schema. Otherwise the LLM composing primitives via tool-use is preferred — it stays adaptable.

**Q. Minimum evidence for a "complete" dossier?**
At least one of: catalog record OR wiki entity page OR ≥ 2 source citations. If none → the bundled tool returns "no compiled view of <target>" rather than a stub. If the LLM is composing primitives, it makes the same decision in its summary.

**Q. Graceful degradation when one substrate is unavailable?**
Bundled composites return `substrates_consulted` listing which sub-tools succeeded/failed. The LLM-composed path achieves the same by inspecting individual tool results — it sees the failure and surfaces the gap explicitly: "Catalog data shown; wiki page not found." Failures never poison the response.

**Q. Drift check noise control?**
`drift_check` (when invoked, either as a bundled tool or composed by the LLM) only reports differences ≥ a per-field threshold (e.g., warranty year mismatch is drift; price differing < 5% across docs isn't). Thresholds in `WIKI.md`.

### §5 Tool selection (no classifier)

**Q. Why no classifier?**
The LLM IS the classifier. Tool descriptions in the system prompt tell it when each tool is appropriate. A separate regex-or-LLM classifier in front would (a) duplicate the LLM's reasoning capability, (b) be brittle to novel question shapes, (c) hide tool selection in code rather than making it transparent in prompts. With tool-use, every tool call is visible in the conversation log.

**Q. Force a route from the user side?**
Yes: prefix-trigger commands `/vector <q>`, `/wiki <q>`, `/catalog <q>`, `/calls <q>` short-circuit the LLM's choice. Implemented as a tiny pre-LLM hook that appends a system note like "user requested vector-only — only call kb_search." Useful for power users and debugging.

**Q. Detect systematic misrouting?**
Tool-call sequences are logged. Recurring "wiki_lookup → empty → kb_search → 5 results" patterns mean a wiki page is missing — surface to Curator. Recurring "LLM picked the wrong primitive for this question shape" patterns are a signal to tighten the relevant tool's description in the system prompt.

**Q. `kb_search` filter by doc_kind?**
Yes — add `kind?` parameter. `kb_sources.meta.doc_kind` is already populated; the chunk-side filter is a join. When the user names a doc-kind ("in install guides…", "according to the warranty…"), pass `kind=` to filter rather than relying on rank.

### §6 Citation quality / answer integrity

**Q. Mandatory structured citation on numeric claims?**
Yes. Post-generation validation pass checks for naked numerics without citations and flags them; agent gets a chance to amend. If still uncited after one retry, the numeric is hedged ("approximately") or removed.

**Q. Quote mode for verbatim claims?**
Quoted text rendered with `"..."` AND citation is mandatory. Renderer enforces: text in `"..."` followed by a non-citation = render-time error.

**Q. Cited chunk doesn't actually support the sentence?**
v2 problem (semantic verification). v1: spot-check via Lint Agent on wiki pages, accept the risk on chat answers, instrument citation-coverage metric to spot regressions.

### §7 Filing back

**Q. "Novel enough" criteria for filing?**
- Answer combines ≥ 3 sources, AND
- No existing wiki page covers the synthesis, AND
- Question form is generalizable (not "what did rep X say in call Y").

The offer is suppressed if any fail.

**Q. Avoiding duplicate concept pages from similar queries?**
Curator runs a similarity check before creating: candidate body ≥ 0.8 cosine to an existing concept page → file as addition to that page rather than create new.

**Q. Skip-filing artifact?**
`wiki/log.md` `query` events carry the question and citations used in the answer (compact). Future searches find prior questions and their citations even when no page was filed.

### §8 Failure modes

**Q. Exact language when no evidence found?**
"No compiled view of <target> in the wiki, and no relevant chunks in the index. Want me to ingest a source, or run a wider search?" Concrete, action-oriented.

**Q. Partial answers on tool failure?**
Yes — return partial with explicit gap notes ("catalog data shown; wiki page lookup failed").

**Q. Contradictions surfaced prominently?**
Inline in the answer body, not in footnotes. The contradiction itself is information.

**Q. Preventing fabricated bridge text between citations?**
Two mitigations: (1) answer prompt instructs "do not assert any claim that isn't grounded in a tool result"; (2) post-generation Lint pass strips sentences without ≥ 1 citation in factual sections.

### §9 Security / governance

**Q. Tool least-privilege scope?**
Each tool has its own DB role / file handle scope. The chat agent's process gets a token-restricted scope granting only the tool surface; no shell, no file write outside `wiki/_drafts/<session>/`.

**Q. Sensitive call transcript redaction?**
Scope-aware: chat answers default to `scope=kb` (no calls). Calls pulled only when the question explicitly asks ("what did the customer say…"). At that point, redaction policies live in the call-ingest pipeline upstream of Track C.

**Q. Audit logs?**
Every tool call logged: `{session, turn, tool, args (PII-redacted), latency, result_summary}`. Retained per project data-retention policy.

### §10 Citation rendering

**Q. How do citations render in the chat UI?**
The grammar is meant to be rendered, not just printed:

| Form | Hover | Click |
| --- | --- | --- |
| `[doc:<chunk_id>]` | chunk content + source title | open source page in sidebar |
| `[call:<chunk_id>]` | chunk + call_id + rep | open call transcript |
| `[image:<path>]` | thumbnail | full-size in modal |
| `[catalog:sku=<sku>]` | SKU description + key fields | open product dossier |
| `[catalog:line=<code>]` | product-line summary | open product-line entity page |
| `[recs:<...>]` | rule fields + method snippet | open recommendations concept |
| `[[wiki:<slug>]]` | first paragraph | open wiki page |

A small renderer module shared between the chat UI ([frontend/src/features/oz/](../../frontend/src/features/oz/)) and any wiki preview. Citations are deterministic strings; rendering is pure.

### §11 Long-term scaling

**Q. When does `wiki_search` become mandatory?**
~5000 pages. Index Agent's BM25 starts to feel slow above that. The upgrade is additive: BM25 stays for short queries, embeddings used for longer/fuzzier ones.

**Q. Compact embeddings/summaries in tool responses to bound cost?**
Yes for composite tools at scale. `product_dossier` returns a 200-token summary by default and the full record only when the agent passes `expand=true`. Tunable; default optimizes for tokens-per-turn.
