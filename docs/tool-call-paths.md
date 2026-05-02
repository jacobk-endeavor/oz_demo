# Oz Chat — Tool Call Paths

How a tool call travels from the chat UI all the way to the substrate that answers it, plus a copy-pasteable prompt for exercising each tool from the chat box.

Companion doc to [docs/system-architecture.md](system-architecture.md) — that one is a top-down system overview; this one is the call-stack-level walk.

---

## 1. The shared header — what every tool call goes through first

```
Browser
   │  POST /api/oz/chat
   │  body: { message, mode?, ragScope?, trace_id?, ... }
   ▼
backend/oz/viteOzChatApi.ts:handler
   │  - resolveRuntimeKind(body.mode, config.chat.runtime)
   │  - resolveAgenticProvider(config.chat.agentic.provider)
   │  - builds sharedDeps:
   │       { transcripts, catalog.registry, wiki.registry,
   │         trackC.scaffold, audit }
   ▼
Selected loop:
   runOzChatLoopAgenticOpenAi(req, deps)   ── if mode=agentic, provider=openai
   runOzChatLoopAgentic(req, deps)         ── if mode=agentic, provider=anthropic
   runOzChatLoop(req, deps)                ── if mode=scaffold (hardcoded sequence)
   │
   │  agentic loops do:
   │   1. surface = createOzToolSurface(req, deps)        [chatRuntime.ts:306]
   │   2. tools  = ozChatOpenAiToolDefinitions()          [ozChatToolRegistry.ts]
   │   3. POST https://api.openai.com/v1/chat/completions (or anthropic /v1/messages)
   │   4. stream parser sees tool_use block →
   │      executeToolOnSurface(surface, name, input)
   │   5. surface[name](input)                            ← the tool call
   ▼
wrapOzToolSurface(surface, deps.audit)                    [chatRuntime.ts:272]
   │  audit proxy if OZ_TOOL_AUDIT=1
   ▼
   per-tool dispatch (next section)
```

---

## 2. Per-tool dispatch

All resolved inside `createOzToolSurface` ([backend/oz/chatRuntime.ts:306](../backend/oz/chatRuntime.ts#L306)). Grouped by the substrate they hit.

### 2.1 Filesystem (wiki tree)

```
surface.wiki_read   → wikiRegistry.wiki_read   → trackC.scaffold.wiki_read(path)
                     → fs.readFile(OZ_WIKI_ROOT_PATH/<path>.md)

surface.wiki_grep   → wikiRegistry.wiki_grep   → trackC.scaffold.wiki_grep(query, top_n)
                     → tokenize(query) → scan all .md under wikiRoot, score

surface.wiki_log    → wikiRegistry.wiki_log    → trackC.scaffold.wiki_log({kind, since, until, top_n})
                     → fs.readFile(OZ_WIKI_ROOT_PATH/log.md), filter by kind/date

surface.wiki_lookup → trackC.scaffold.wiki_lookup(query, top_n)
                     → listMarkdownFiles(wikiRoot), score by:
                       [exact slug match +200 | tag substring +60 |
                        title token overlap ×15 | body token overlap ×2 |
                        .search/bm25.json scores ×5 if present]

surface.image_view  → trackC.scaffold.image_view(path)
                     → guard path.startsWith('kb_extracts/')
                     → fs.readFile(OZ_KB_EXTRACTS_ROOT/<rest>) → base64
```

### 2.2 Postgres (pgvector)

```
surface.kb_search           → kbSearch(payload)
                             → trackC.scaffold.kb_search(args)        [trackCToolScaffold.ts:382]
                             → readOnlyDbQuery() (uses DATABASE_URL pool)
                             → embedOpenAiText(query) via OPENAI_API_KEY
                             → runKbSearch({dbQuery, embedQuery}, args) [kbSearchRag.ts:113]
                             → SELECT … ORDER BY embedding <=> $1::vector LIMIT $k
                               on kb_rag_chunks (HNSW cosine,
                               + optional WHERE meta->>'doc_kind' = $kind)

surface.search_transcripts  → transcriptRegistry.search_transcripts({...payload, scope})
                             → SELECT on call_rag_chunks WHERE owner_user_id = $scope
                               ORDER BY embedding <=> $1::vector

surface.read_transcript     → transcriptRegistry.read_transcript({call_id, scope, max_chunks})
                             → SELECT chunk text on call_rag_chunks WHERE call_id = $1
```

### 2.3 Structured JSON (in-memory maps)

The TrackC scaffold loads `product_catalog_flat.json` and `recommendations.json` once at startup (and on mtime change) into:
- `catalogBySku: Map<string, JsonRecord>`
- `recommendationsByRuleKey: Record<string, JsonRecord[]>`

Every catalog/rec tool just hits these maps — no I/O per call, no DB.

```
surface.catalog_get          → catalogRegistry.catalog_get(payload)
                              → trackC.scaffold.catalog_get(sku)
                              → catalogBySku.get(sku.toUpperCase())

surface.catalog_list         → catalogRegistry.catalog_list(payload)
                              → trackC.scaffold.catalog_list({product_line, sub_category, brand,
                                                              min_sales, sort_by, top_n})
                              → catalogState.records.filter(...).sort(...).slice(0, top_n)

surface.catalog_search       → trackC.scaffold.catalog_search(query, k)
                              → lexical token overlap over description + sku, top k

surface.catalog_aggregate    → trackC.scaffold.catalog_aggregate({group_by, metric})
                              → in-memory groupBy + reduce

surface.catalog_compare      → trackC.scaffold.catalog_compare(skus[])
                              → join multiple catalog rows on shared columns

surface.catalog_diff         → trackC.scaffold.catalog_diff(sku_a, sku_b)
                              → both rows + field-level numeric delta

surface.catalog_neighbors    → trackC.scaffold.catalog_neighbors(sku, by, k)
                              → k-NN by 'price' | 'margin' | 'sales' | 'description'

surface.recommendations_for      → trackC.scaffold.recommendations_for(sku_or_subcat, kind)
                                  → recommendationsByRuleKey lookup, filter by kind

surface.recommendations_explain  → trackC.scaffold.recommendations_explain(citation)
                                  → parse "[recs:kind:left#index]" → fetch rule
                                  → also wiki_read('concepts/recommendations/methodology.md')

surface.recommendations_top      → trackC.scaffold.recommendations_top({kind, by, top_n, filter})
                                  → in-memory rank by lift / confidence / co_invoices / uplift
```

### 2.4 Graph (currently stub adapters)

```
surface.graph_search    → searchAdapter.search(bounded)
                         → searchAdapter is deps.graph.searchAdapter
                           or createGraphSearchStubAdapter() (returns empty)

surface.graph_neighbors → neighborsAdapter.neighbors(bounded)
                         → similar stub pattern
```

### 2.5 Layer-3 bundled (TrackC composes primitives; otherwise returns a tracking-issue stub)

```
surface.product_dossier → tc.layer3ProductDossier(target)
                         → fan-out: catalog_get + catalog_neighbors + wiki_lookup
                           + recommendations_for + kb_search(global) + kb_search(call)
                         → composes a single result envelope

surface.compare          → tc.layer3Compare(targets[])
                         → catalog_compare (when ≥2 catalog SKUs resolve) + wiki_read each + kb_search

surface.wiki_compare     → tc.layer3WikiCompare(slugs[])
                         → wiki_read per slug, return matrix

surface.drift_check      → tc.layer3DriftCheck(target)
                         → cross-substrate consistency probe (catalog vs wiki vs kb)
                         → still light/stubbed today (Oz-Demo-coh)
```

---

## 3. Two worked examples

### 3.1 Catalog probe — `catalog_list` then `catalog_get`

```
1. POST /api/oz/chat  body: { mode:"agentic", message:"...catalog_list...catalog_get..." }
2. viteOzChatApi.handler: resolveRuntimeKind→'agentic', resolveAgenticProvider→'openai'
3. runOzChatLoopAgenticOpenAi(req, sharedDeps)
4. createOzToolSurface(req, sharedDeps) — surface bound to scaffold + adapters
5. POST https://api.openai.com/v1/chat/completions { tools:[…] }
6. Streaming chunk: delta.tool_calls=[{
     name:"catalog_list",
     arguments:{product_line:"Captivate MFG", top_n:1}
   }]
7. finish_reason="tool_calls"
   → executeToolOnSurface(surface, "catalog_list", {product_line:"Captivate MFG", top_n:1})
   → surface.catalog_list                                 [chatRuntime.ts:445]
   → catalogRegistry.catalog_list                         (registry from sharedDeps)
   → trackC.scaffold.catalog_list                         [trackCToolScaffold.ts]
   → catalogState.records.filter(r => r.product_line === "Captivate MFG").slice(0,1)
   → returns [{sku:"1/248ACSMB-SHEET", description:"…"}]
8. tool_result block → next openai turn
9. Streaming chunk: delta.tool_calls=[{
     name:"catalog_get", arguments:{sku:"1/248ACSMB-SHEET"}
   }]
10. → surface.catalog_get → trackC.scaffold.catalog_get → catalogBySku.get("1/248ACSMB-SHEET")
11. tool_result block → next openai turn
12. Streaming text deltas → final reply with the description quoted
13. SSE done event back to client
```

### 3.2 Vector probe — `kb_search`

```
1. POST /api/oz/chat  mode:"agentic", message:"kb_search for warranty…"
2..4. (same shared header)
5. POST /v1/chat/completions
6. tool_use: { name:"kb_search", arguments:{query:"warranty", surface:"kb"} }
   → surface.kb_search                                    [chatRuntime.ts:457]
   → kbSearch(payload)                                    [chatRuntime.ts:397]
   → trackC.scaffold.kb_search(args)                      [trackCToolScaffold.ts:382]
   → readOnlyDbQuery()                                    [trackCToolScaffold.ts:449]
   → pg.Pool from poolFactory(buildDatabaseUrlFromPgVars())
     (sslmode=no-verify so DigitalOcean CA chain isn't rejected)
   → embedOpenAiText({apiKey, model:"text-embedding-3-small", text}) → vector
   → runKbSearch({dbQuery, embedQuery}, args)             [kbSearchRag.ts:113]
   → SELECT chunk_id, source_id, content, embedding <=> $1 AS dist
       FROM kb_rag_chunks WHERE status='ready'
       ORDER BY embedding <=> $1 LIMIT $2
   → returns chunks with provenance: {source:"postgres", retrieval:"semantic_vector"}
7. tool_result → next turn → final reply with chunk_id 4e2c7db0e625_p001_00001
```

---

## 4. Reference table — where each component lives

| Layer | File | Key entry point |
|---|---|---|
| HTTP handler + dispatch | [backend/oz/viteOzChatApi.ts](../backend/oz/viteOzChatApi.ts) | `resolveRuntimeKind`, `resolveAgenticProvider`, sharedDeps construction |
| Scaffold loop (no LLM) | [backend/oz/chatRuntime.ts](../backend/oz/chatRuntime.ts) | `runOzChatLoop` |
| OpenAI loop | [backend/oz/chatRuntimeAgenticOpenAi.ts](../backend/oz/chatRuntimeAgenticOpenAi.ts) | `runOzChatLoopAgenticOpenAi` |
| Anthropic loop | [backend/oz/chatRuntimeAgentic.ts](../backend/oz/chatRuntimeAgentic.ts) | `runOzChatLoopAgentic` |
| Tool surface assembly | [backend/oz/chatRuntime.ts:306](../backend/oz/chatRuntime.ts#L306) | `createOzToolSurface` |
| Audit proxy | [backend/oz/chatRuntime.ts:272](../backend/oz/chatRuntime.ts#L272) | `wrapOzToolSurface` |
| All catalog/wiki/recs/layer-3 implementations | [backend/oz/trackCToolScaffold.ts](../backend/oz/trackCToolScaffold.ts) | one method per tool name |
| Vector SQL | [backend/oz/kbSearchRag.ts:113](../backend/oz/kbSearchRag.ts#L113) | `runKbSearch` |
| Tool definitions sent to the model | [backend/oz/ozChatToolRegistry.ts](../backend/oz/ozChatToolRegistry.ts) | `ozChatOpenAiToolDefinitions` |
| Route prefixes | [backend/oz/ozChatRoutePrefixes.ts](../backend/oz/ozChatRoutePrefixes.ts) | `parseOzChatRoutePrefix` |

**Debugging tip:** set `OZ_TOOL_AUDIT=1` in `.env`. Every tool dispatch then logs one stderr line: `{tool, ok, latency_ms, args_summary, result_summary}` (PII-redacted). Fastest way to see in real time which tool fired, with what args, and how long it took.

---

## 5. Probing each tool from the chat UI

**Setup, once per browser tab:**

1. In the bottom-right corner of the app, switch the **RUNTIME** toggle to **agentic**. The label should read `→ agentic via openai (yaml: …)`.
2. Confirm `agentic_available: true` in the toggle's tooltip; if it's disabled, your `.env` is missing `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` if `chat.agentic.provider: anthropic`).
3. Optional — set `OZ_TOOL_AUDIT=1` in `.env` and check the terminal running `npm run dev` for `[oz-tool-audit]` lines as you fire prompts.

For each prompt below: paste it into the chat input. Send. Watch the SSE telemetry (in the network tab or via the architecture-doc trace events) — the `tool_call` and `tool_result` events tell you which tool fired and whether it returned non-empty data.

Each prompt names the tool explicitly so the model picks it deterministically. **What to look for** explains how to verify the call really hit the substrate (vs. the model hallucinating).

> **Heads up — tool naming.** The model picks tools by description; naming the tool in your prompt is the strongest possible nudge but not a hard contract. If the model picks an adjacent tool, the answer may still be correct; check `tool_call` events to see what actually fired.

### 5.1 Filesystem (wiki tree)

#### `wiki_read`
```
Use wiki_read on path "sources/2020-warranty-services-checklist-2021-08-26-4e2c7db0e625" and quote the warranty services manager's email and the [doc:...] citation that page carries.
```
**Look for:** `mmatheson@ufpi.com` and `[doc:4e2c7db0e625_p001_00000]` in the reply.
**Why it matters:** that email + chunk_id only exist in that specific dense source page; if both appear, `OZ_WIKI_ROOT_PATH` is resolving correctly and the markdown was actually read.

#### `wiki_grep`
```
Use wiki_grep with query "Mesquite" top_n=5 and list every wiki path that mentions it, with the snippets.
```
**Look for:** at least one hit pointing at the Azek or Fiberon color-comparison source page (e.g. `wiki/sources/2023-azek-deckorators-color-comparison-…`). If nothing comes back, the grep scanner isn't seeing your wiki tree.

#### `wiki_log`
```
Use wiki_log with kind="ingest" top_n=5 and show the most recent ingest events with timestamps and source_ids.
```
**Look for:** lines that include `event=kb.ingested` and a 12-character `source_id=`. These are written to `wiki/log.md` by the wiki ingest scaffold, so any real entries prove the log is being read.

#### `wiki_lookup`
```
Use wiki_lookup with query "Deckorators warranty procedure" top_n=3. Return each page's path, score, and tags.
```
**Look for:** the warranty source page in the top 3 with a non-zero score. The score breakdown comes from slug + tag + title + body matches plus optional BM25 — if anything ranks here, scoring works.

#### `image_view`
```
Use image_view on path "kb_extracts/4e2c7db0e625/img/page-1.png" and describe what you see, or report the precise error if the file is missing.
```
**Look for:** either a base64-decoded image description, or a clean error like `not_found`. The warranty PDF didn't extract images (text-only pages), so `not_found` is the expected pass — it proves the path guard fires and `kb_extracts/` is reachable.

### 5.2 Postgres (pgvector)

#### `kb_search`
```
Use kb_search with surface="kb" k=4 to find documents about Deckorators warranty claim filing procedure. Quote one chunk_id and the first 100 characters of its content.
```
**Look for:** a chunk_id beginning with `4e2c7db0e625_` and a quoted snippet of warranty checklist text. The provenance flag in the result should be `{source:"postgres", retrieval:"semantic_vector"}` — if it's `stub`, the DB isn't connected.

#### `kb_search` with surface="call"
```
/calls Use kb_search surface="call" call_scope="admin" k=3 to find sales-call evidence about capped composite decking.
```
**Look for:** chunks from the `call_rag_chunks` table (different `source_id` shape; locator is a chunk index, not `page=N`). If empty, you may not have ingested call transcripts yet — that's data-not-present, not wiring-broken.

#### `search_transcripts`
```
Use search_transcripts with query "warranty inspection" top_k=3 and return the top hits with their call_ids.
```
**Look for:** results scoped to your rep id (default) or `admin` if you pass `call_scope="admin"`. Empty here usually means call ingest hasn't run.

#### `read_transcript`
```
Use search_transcripts to find a call about decking quotes, then call read_transcript on its call_id and summarize the transcript in 3 bullets.
```
**Look for:** two tool calls in the SSE stream — `search_transcripts` then `read_transcript` — with the same `call_id`. Proves the search→fetch chain.

### 5.3 Structured JSON (catalog + recommendations)

#### `catalog_get`
```
Use catalog_get for SKU "1/248ACSMB-SHEET" and quote its description verbatim.
```
**Look for:** `1/2" X 4' X 8' AZEK CAPTIVATE Midnight Black Smooth`. That string is the actual catalog row; if missing, `product_catalog_flat.json` isn't loaded (try `npx tsx scripts/build-flat-catalog.ts`).

#### `catalog_list`
```
Use catalog_list with product_line="Captivate MFG" sort_by="total_sales" top_n=5. List the SKUs and their sales totals.
```
**Look for:** five real SKUs with `product_line: "Captivate MFG"`, sorted by descending sales. If only blank `product_line` rows show up, the flat catalog wasn't regenerated from the hierarchical one.

#### `catalog_search`
```
Use catalog_search with query "AZEK Captivate Midnight" k=5. Return the matched SKUs and descriptions.
```
**Look for:** matches that share at least 2 of those tokens in the description. Lexical scorer, not vector — dumb but fast.

#### `catalog_aggregate`
```
Use catalog_aggregate with group_by="product_line" metric="total_sales" and return the top 5 product lines by total sales.
```
**Look for:** non-empty rollups. The numbers should look like real currency-shaped totals (not zero).

#### `catalog_compare`
```
Use catalog_compare with skus=["1/248ACSMB-SHEET"]. Identify which catalog fields it carries and any blank fields.
```
**Look for:** a row matrix listing `description`, `unit_price_avg`, `total_sales`, etc. for the SKU. If the model can spot blanks, the comparison shape is intact.

#### `catalog_diff`
```
Use catalog_list product_line="Captivate MFG" top_n=2 to pick two SKUs, then catalog_diff between them, then summarize numeric_deltas.
```
**Look for:** a chained call sequence: list → diff. The diff should show `numeric_deltas` for shared numeric fields like `unit_price_avg`.

#### `catalog_neighbors`
```
Use catalog_neighbors with sku="1/248ACSMB-SHEET" by="price" k=5 and list the neighbors with their unit_price_avg.
```
**Look for:** five SKUs with `unit_price_avg` close to the anchor's. If the model returns "no neighbors," the price field is blank in the flat catalog (re-run `build-flat-catalog.ts`).

#### `recommendations_for`
```
Use recommendations_for with sku_or_subcat="1/248ACSMB-SHEET" kind="cross_sell". Return up to 3 rules with their lift values.
```
**Look for:** rules whose `left_sku` matches the input. Empty here means no rules are loaded — check `recommendations.json` exists at repo root.

#### `recommendations_explain`
```
Use recommendations_for to get one cross_sell rule for any SKU, then call recommendations_explain on its citation. Return the methodology text.
```
**Look for:** two calls in the stream — `recommendations_for` then `recommendations_explain` — and a non-empty `methodology_text` field. The methodology text comes from `wiki/concepts/recommendations/methodology.md` if it exists.

#### `recommendations_top`
```
Use recommendations_top with kind="cross_sell" by="lift" top_n=5 and list the top rules.
```
**Look for:** rules ordered by descending lift. If `by="confidence"` flips the order, ranking works.

### 5.4 Graph (stub adapters)

#### `graph_search` / `graph_neighbors`
```
Use graph_search with query "Captivate suppliers" depth=2 size=10. Then call graph_neighbors on any returned nodeId.
```
**Look for:** empty result lists. **This is the correct outcome today** — the graph adapters are stubbed pending a real graph backend. The point is to confirm the model can call them and the surface returns gracefully.

### 5.5 Combined / Layer-3

#### `wiki_lookup` + `kb_search`
```
Tell me the warranty claim procedure for Deckorators decking using both wiki_lookup AND kb_search. Include at least one [doc:...] citation and one [wiki:...] citation.
```
**Look for:** in the SSE stream, two distinct `tool_call` events (`wiki_lookup`, `kb_search`), each `ok:true`. The reply must contain both citation forms — that proves cross-substrate fusion.

#### `product_dossier` (stub today)
```
Use product_dossier with target="1/248ACSMB-SHEET" and summarize what you found across catalog, wiki, kb, and recommendations.
```
**Look for:** either real fan-out results (TrackC scaffold composing primitives) or a structured stub envelope referencing tracking issue `Oz-Demo-rx1`. Both are valid signals — depends whether the scaffold's layer3 implementations are wired in your build.

#### `compare`
```
Use compare with targets=["1/248ACSMB-SHEET", "Captivate MFG"]. Return a matrix of catalog facts and wiki context.
```
**Look for:** a structured response with both targets covered, or a `Oz-Demo-6eb` stub envelope. Same caveat as above.

#### `wiki_compare`
```
Use wiki_compare with slugs=["sources/2023-azek-deckorators-color-comparison-u-s-11-21-2022-7110ce9ef4a1","sources/2023-fiberon-deckorators-color-comparison-u-s-11-21-2022-e1bf2c19219a"]. Highlight differences between the two pages.
```
**Look for:** real differences (Fiberon vs. AZEK color names) or a stub envelope.

#### `drift_check`
```
Use drift_check with target="Captivate MFG" and report any inconsistencies between catalog claims, wiki narrative, and kb citations.
```
**Look for:** an envelope describing how the substrates were consulted. Today this is a thin stub — useful as a placeholder probe.

### 5.6 Route-prefix nudges (optional)

Prefix the message to bias the model's first tool pick:

| Prefix | Bias |
|---|---|
| `/wiki` | Start with `wiki_lookup` / `wiki_read` |
| `/vector` | Start with `kb_search` |
| `/catalog` | Start with `catalog_get` / `catalog_list` |
| `/calls` | Start with `kb_search surface=call` / `read_transcript` |

Example: `/wiki What do we know about Deckorators warranty?` will make the model reach for `wiki_*` first instead of `kb_search`.

### 5.7 Automated alternative

If you'd rather assert these in CI than eyeball them, run:

```bash
./scripts/probe-loop.sh
```

That kills + restarts vite, waits for `/api/oz/chat/config`, and runs a 4-probe smoke (wiki / vector / catalog / combined). Exit `0` means all tools fired and returned non-empty results. The harness is at [scripts/probe-agentic-chat.ts](../scripts/probe-agentic-chat.ts) — extend the `PROBES` array to cover any tool you want to gate releases on.
