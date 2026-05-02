# Code Sandbox + Artifact Generation + Model-Driven Slide-Out Panels

> **Status:** design / proposal. Nothing in this doc is wired yet.
> **Audience:** engineers and PMs deciding whether (and how) to ship this.
> **As of:** 2026-05-01.

This doc describes the next expansion of the Oz chat runtime: giving the model a **Python coding sandbox** for ad-hoc data analysis, **artifact generation** (xlsx / docx / pdf) that gets uploaded to DigitalOcean Spaces and returned to the user as a download link, and a **model-callable slide-out panel** that generalizes the hardcoded sheets (e.g. [LumberInvoicePreviewSheet.tsx](frontend/src/features/quoteAutomation/LumberInvoicePreviewSheet.tsx), [JobCostEstimateRecapSheet.tsx](frontend/src/features/fieldApp/JobCostEstimateRecapSheet.tsx)) into a tool the model can invoke.

It also outlines exactly **what wiring is missing** in the current infrastructure, so the work can be scoped.

---

## 1. The 30-second mental model

Today the chat agent has tools that **read** the three substrates (pgvector / wiki / catalog) and compose a templated reply — see [docs/system-architecture.md](docs/system-architecture.md) §3 for the loop. It has no way to **compute** new artifacts or **render** rich UI back into the chat surface.

This proposal adds three orthogonal capabilities, each surfaced as new entries in the tool registry at [backend/oz/ozChatToolRegistry.ts](backend/oz/ozChatToolRegistry.ts):

```
                ┌─────────────────────────────────────────┐
                │           Chat agent loop               │
                │   (chatRuntimeAgentic.ts / OpenAI)      │
                └─────────────┬───────────────────────────┘
                              │  picks one of:
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 ┌──────────────┐   ┌────────────────────┐  ┌───────────────────┐
 │ run_python   │   │ make_spreadsheet / │  │ display_table /   │
 │ (sandbox,    │   │ make_docx /        │  │ display_panel     │
 │ code+data,   │   │ make_pdf           │  │ (UI side-panel,   │
 │ returns text │   │ (artifact, upload  │  │ no artifact)      │
 │ + figures)   │   │ to DO Spaces)      │  │                   │
 └──────┬───────┘   └─────────┬──────────┘  └─────────┬─────────┘
        │                     │                       │
        ▼                     ▼                       ▼
   stdout/stderr +       <artifact …/> XML        <panel …/> XML
   inline figure         with signed URL          with row data
   (base64 PNG) →        embedded in reply        embedded in reply
   model can iterate
```

The two XML tag forms are the contract between the model and the renderer in [OzAssistantPanel.tsx](frontend/src/shared/ui/OzAssistantPanel.tsx). They get parsed out of the assistant text in the same pass that already parses citations via [shared/oz/citationGrammarResolver.ts](shared/oz/citationGrammarResolver.ts).

---

## 2. The three new tools

### 2.1 `run_python` — the sandbox

Purpose: let the model **try things**. Plot the catalog, group recommendations, sanity-check a number, generate a chart, scaffold an xlsx structure, etc. The model can iterate: run code → read errors → fix → re-run.

**Tool definition** (added to [ozChatOpenAiToolDefinitions()](backend/oz/ozChatToolRegistry.ts#L38)):

```ts
{
  type: 'function',
  function: {
    name: 'run_python',
    description:
      'Run Python in an isolated sandbox with full stdlib + pandas/numpy/openpyxl/' +
      'python-docx/reportlab/matplotlib. Use when you need to compute, transform, ' +
      'or visualize data before answering — especially for ranking, aggregations, ' +
      'graph generation, or constructing artifact files. Inputs: code (str) and ' +
      'optional data_refs (list of {kind, id} pulled from previous tool results). ' +
      'Returns stdout, stderr, exit_code, durations, and any inline figures/files.',
    parameters: jsonParameters({
      code:      { type: 'string', description: 'Full Python program to execute.' },
      data_refs: { type: 'array',  description: 'Optional refs to previous catalog/kb/wiki results to mount as JSON in /sandbox/inputs/.' },
      timeout_s: { type: 'number', description: 'Wall-clock timeout (default 30, max 120).' },
    }, ['code']),
  },
},
```

**Runtime behavior** — implemented in a new module `backend/oz/pythonSandbox.ts`:

1. Spawn a fresh container per call (or reuse a pool — see §6.2). Image: `oz-sandbox:latest` based on `python:3.12-slim` with pinned pandas, numpy, openpyxl, python-docx, reportlab, matplotlib, pillow, plotly.
2. Mount `/sandbox/inputs/` with any `data_refs` the model passed (resolved server-side from the prior tool results — never trust the client to send the bytes).
3. Mount `/sandbox/outputs/` as the only writable path. Anything the script writes there becomes a candidate artifact.
4. Run `python /sandbox/main.py` with: `--no-network` by default, **CPU/RAM caps**, **wall-clock timeout**.
5. After the run:
   - Capture stdout, stderr, exit code.
   - Walk `/sandbox/outputs/`. PNG/JPEG ≤ N MB → returned inline as base64 in the tool result so the model can reason about its own chart. Larger files or non-image kinds → uploaded to DigitalOcean Spaces and returned as a `{kind, key, signed_url}` ref the model can then wrap in a `<artifact …/>` tag.
6. Tear down the container.

> **"Unlimited access within the sandbox"** in the user request means: inside the container the script can do anything (full stdlib, write any file, install nothing — the image is the contract). It does **not** mean network egress, host filesystem access, or arbitrary subprocess to the host. See §5.

**Why give the model this tool at all** — the current loop can describe data but can't *compute* on it. With `run_python` the model can: load `product_catalog.json`, group by `product_line`, plot top-N margin contributors, save a chart, then point the user at it. It can also scaffold a spreadsheet by writing to `/sandbox/outputs/foo.xlsx` and letting the post-run uploader return the link.

### 2.2 `make_spreadsheet` / `make_docx` / `make_pdf` — typed artifact generation

These are **convenience wrappers** around `run_python` for the common case where the model knows the schema and just wants a file. They run a stricter, faster path:

```ts
{
  name: 'make_spreadsheet',
  description:
    'Generate a multi-sheet xlsx from structured data. Prefer this over run_python ' +
    'when the rows/columns are already in hand — faster and more deterministic. ' +
    'For exploratory analysis or charting, use run_python.',
  parameters: jsonParameters({
    title:  { type: 'string' },
    sheets: { type: 'array', description: '[{name, columns:[…], rows:[[…]], formats?:[…]}]' },
    notes:  { type: 'string', description: 'Optional cover-sheet text.' },
  }, ['sheets']),
},
{
  name: 'make_docx',
  description: 'Generate a docx report. Sections: heading, paragraphs, tables, image refs.',
  parameters: jsonParameters({
    title:    { type: 'string' },
    sections: { type: 'array' },
  }, ['title', 'sections']),
},
{
  name: 'make_pdf',
  description: 'Generate a PDF (reportlab). Same section grammar as make_docx; PDF-typeset.',
  parameters: jsonParameters({
    title:    { type: 'string' },
    sections: { type: 'array' },
  }, ['title', 'sections']),
},
```

Internally these compile down to `run_python` with a server-controlled template script — the model can't smuggle arbitrary code through the wrapper. Each returns one artifact ref.

**When the model picks which:**
- "show me a sheet of …" / "export the top 50 SKUs" → `make_spreadsheet`
- "draft a customer-facing report on Voyage colors" → `make_docx`
- "give me a printable summary" → `make_pdf`
- "plot margin vs sales for product line VYG and tell me the outlier" → `run_python` (because the answer is in the figure + text, not a static template)

System prompt addendum (extends [OZ_CHAT_SYSTEM_PROMPT](backend/oz/ozChatToolRegistry.ts#L9)):

> *Prefer typed artifact tools (`make_spreadsheet`/`make_docx`/`make_pdf`) when you already know the schema. Use `run_python` to explore, transform, plot, or sanity-check before deciding what artifact to produce. Always render artifacts to the user with the `<artifact …/>` tag returned in the tool result; never paste a raw URL.*

### 2.3 `display_table` / `display_panel` — the model-callable slide-out

Today the slide-out / sheet pattern is hardcoded into specific feature pages — see [LumberInvoicePreviewSheet.tsx](frontend/src/features/quoteAutomation/LumberInvoicePreviewSheet.tsx) and the row-attach grammar in [shared/tableRowContext.ts](frontend/src/shared/tableRowContext.ts) (`scope: 'lead' | 'lumberyard' | 'competitor'`). The model can't *open* one of those panels; the page mounts it.

**Generalize that:**

```ts
{
  name: 'display_table',
  description:
    'Open the right-side slide-out panel and render tabular data inline in chat. ' +
    'Use for any rows the user might want to scan, sort, or pin into composer ' +
    'context (catalog rows, recommendations, transcript hits, run_python results). ' +
    'Each row gets a stable id so the user can attach it back to a follow-up turn.',
  parameters: jsonParameters({
    title:   { type: 'string' },
    columns: { type: 'array',  description: '[{key, label, kind?: "number"|"currency"|"text"}]' },
    rows:    { type: 'array',  description: '[{id, cells: {key: value}}]' },
    scope:   { type: 'string', description: 'Optional: "catalog"|"recs"|"calls"|"sandbox" — controls the chip color when pinned.' },
  }, ['title', 'columns', 'rows']),
},
{
  name: 'display_panel',
  description:
    'Open the slide-out and render a richer non-tabular component (e.g. an invoice ' +
    'preview, a job-cost recap). Pass a kind + props payload; the renderer maps ' +
    'kind to a registered component. Use display_table for plain rows.',
  parameters: jsonParameters({
    kind:  { type: 'string', description: 'Registered: "invoice_preview"|"job_cost_recap"|"chart"|"docx_outline"|"file_drop".' },
    props: { type: 'object', description: 'Component-specific props.' },
  }, ['kind', 'props']),
},
```

**How it actually renders** — the agentic streamer ([backend/oz/chatRuntimeAgentic.ts](backend/oz/chatRuntimeAgentic.ts)) emits these as normal `tool_call` / `tool_result` events. The frontend [useOzChatStream.ts](frontend/src/features/oz/useOzChatStream.ts) already consumes those. We add a new event handler: when a `tool_result` arrives for `display_table` / `display_panel`, the result payload is stashed in a Zustand store keyed by message id, **and** the assistant text gets a sentinel `<panel id="…"/>` injected at the cursor position so the markdown renderer in [OzAssistantPanel.tsx](frontend/src/shared/ui/OzAssistantPanel.tsx) (or [SimpleAssistantMarkdown.tsx](frontend/src/shared/ui/SimpleAssistantMarkdown.tsx)) can render an inline "Open panel →" affordance.

Clicking the affordance toggles a right-side slide-out (CSS `transition-transform translate-x-full → translate-x-0`, the same primitive [OzWorkflowShell.tsx](frontend/src/shared/ui/OzWorkflowShell.tsx#L555) already uses for its expansions). The pinned-row chips on top of the composer reuse [tableRowContext.ts](frontend/src/shared/tableRowContext.ts) — we just add `'sandbox'` to `TableContextScope`.

---

## 3. The XML tag contract

The chat reply is plaintext markdown today (see [SimpleAssistantMarkdown.tsx](frontend/src/shared/ui/SimpleAssistantMarkdown.tsx)). The citation grammar already lets the model embed `[[wiki:slug]]`, `[doc:id]`, `[catalog:sku=…]` etc. via [shared/oz/citationGrammarResolver.ts](shared/oz/citationGrammarResolver.ts).

For artifacts and panels, **XML tags** are clearer than citation syntax because the payload is a server-allocated id, not a free-form citation token. The tags the model is allowed to emit:

```xml
<!-- Artifact = file uploaded to DO Spaces -->
<artifact
  id="art_01HX…"        <!-- server-allocated; never invented by the model -->
  kind="xlsx|docx|pdf|png|csv|other"
  title="Top-50 margin SKUs by product line"
  size_bytes="48213"
/>

<!-- Panel = inline UI surface (slide-out) -->
<panel
  id="pan_01HX…"        <!-- ditto -->
  kind="table|invoice_preview|job_cost_recap|chart"
/>
```

**Provenance rule:** the `id` value MUST be one returned in a prior `tool_result` in the same turn. The renderer enforces this — any `<artifact id="…"/>` whose id wasn't seen in a tool result is rendered as a literal warning ("Stale or invalid artifact id"). This is the same trust posture as catalog / wiki citations today: the model proposes; the runtime validates.

The tags are parsed in the same post-pass that already runs citation resolution. Concretely, extend [citationGrammarResolver.ts](shared/oz/citationGrammarResolver.ts) with two new node types (`artifact`, `panel`), and add a `<ArtifactPill/>` + `<PanelPill/>` React component in `frontend/src/shared/ui/`.

---

## 4. End-to-end flow (worked example)

User: *"Make me a spreadsheet of the top 30 SKUs by margin in product line VYG, with a chart of margin vs sales."*

```
1. POST /api/oz/chat   { message, mode: "agentic" }

2. chatRuntimeAgentic.ts loop:
     turn 0 → model picks catalog_list({product_line:"VYG", sort_by:"margin", top_n:30})
              tool_result: 30 rows of catalog data
     turn 1 → model picks run_python({
                 code: "<load /sandbox/inputs/catalog.json, plot margin vs sales,
                        save figure to /sandbox/outputs/chart.png>",
                 data_refs: [{kind:"catalog_list_result", id:"trc_…"}]
              })
              sandbox runs in container, writes chart.png
              uploader pushes chart.png → DO Spaces
              tool_result: { stdout, stderr, artifacts: [{id:"art_chart…", kind:"png", url:"…signed"}] }
     turn 2 → model picks make_spreadsheet({
                 title: "VYG top-30 margin",
                 sheets: [{ name:"Top 30", columns:[…], rows:[…] },
                          { name:"Notes",  columns:[…], rows:[[…]] }],
              })
              wrapper compiles to a fixed openpyxl template
              uploader pushes .xlsx → DO Spaces
              tool_result: { id:"art_xlsx…", kind:"xlsx", url:"…signed" }
     turn 3 → model emits final assistant text:
                "Here are the top 30 SKUs in VYG by margin.
                 <artifact id="art_xlsx…" kind="xlsx" title="VYG top-30 margin"/>
                 The chart confirms two outliers …
                 <artifact id="art_chart…" kind="png" title="margin vs sales"/>"

3. SSE stream to browser:
     tool_call → tool_result → token → token → … → done
     - ArtifactPill mounts on each <artifact …/> and renders a download button
       pointing at the (short-lived) signed URL.
     - The chart PNG renders inline.
```

For a "show me the rows" request the path collapses to one tool call:

```
catalog_list → display_table({title, columns, rows})
   model emits: "<panel id="pan_…" kind="table"/>"
   panel slides out from the right with the rows;
   each row has a "+" to pin into the next composer turn.
```

---

## 5. Sandbox security model

This is the part that has to be right.

### 5.1 What "unlimited access within the sandbox" means in practice

| Capability | Inside container | Outside (host / network) |
|---|---|---|
| Stdlib + image-pinned packages | Allowed | n/a |
| Read `/sandbox/inputs/` | Allowed | n/a |
| Write `/sandbox/outputs/` | Allowed | n/a |
| Write any other path in the container | Allowed (rootfs is ephemeral) | n/a |
| Spawn subprocesses inside the container | Allowed | n/a |
| Network egress | **Denied by default** (`--network=none`); opt-in via `network: 'allow'` flag exposed only on backend, never to the model | n/a |
| Read host filesystem | n/a | **Denied** |
| Write to repo / DB / DO Spaces directly | n/a | **Denied** — only the post-run uploader has Spaces creds |
| Long-running daemons | n/a | **Denied** — wall-clock timeout kills the container |

Concretely: gVisor (`runsc`) or Firecracker microVMs, not bare Docker. Container has `--read-only` rootfs, `tmpfs` overlay on `/sandbox`, no `CAP_SYS_*`, seccomp default-deny, `--memory=512m --cpus=1.0` (tunable), `--pids-limit=128`.

### 5.2 Why we do not let the model touch DO Spaces directly

If `run_python` could write to Spaces, every artifact would need IAM scoping per-tenant inside the container, and a successful exploit of the sandbox would leak credentials. Instead the runtime **post-processes** `/sandbox/outputs/` after the container exits and pushes the bytes to Spaces from the trusted host. The model never sees the access key.

### 5.3 Sandbox host placement

Two viable options:

- **Co-located:** sandbox runner runs on the same host as the Vite dev server / backend, talking to it over a unix socket. Fine for the demo. Easy to set up; one box, one cleanup script.
- **Remote pool:** sandbox runner is a separate service ("oz-sandbox-runner"), reached over HTTPS with mTLS. Required if we ever multi-tenant or want to scale CPU independently of the chat backend.

Recommended start: co-located, behind a runner abstraction (`SandboxBackend` interface) so we can swap in remote later without touching `run_python` callers.

---

## 6. Where this fits in the current infrastructure

### 6.1 New files

| Path | Role |
|---|---|
| `backend/oz/pythonSandbox.ts` | Spawn / manage / tear down sandbox container; mount inputs; harvest outputs. |
| `backend/oz/artifactStorage.ts` | DO Spaces client (s3-compatible). `putArtifact(bytes, kind, meta) → {id, url, signedUrl}`. Key layout: `s3://oz-artifacts-<env>/<tenant>/<yyyymmdd>/<art_id>.<ext>` (see [docs/infra/oz-artifacts-spaces.md](infra/oz-artifacts-spaces.md)). |
| `backend/oz/artifactRegistry.ts` | In-memory + Postgres-backed table `oz_artifacts (id, tenant, kind, title, key, sha256, bytes, created_at, ttl_at)`. Source of truth for "is this id valid in this turn". |
| `backend/oz/sandboxTemplates/` | Server-side Python templates for `make_spreadsheet`, `make_docx`, `make_pdf`. Model never sees these. |
| `frontend/src/shared/ui/ArtifactPill.tsx` | Renders `<artifact …/>` — fetches the title/size/kind from registry, shows a download button. |
| `frontend/src/shared/ui/PanelPill.tsx` + `SlideOutPanel.tsx` | Renders `<panel …/>`; the slide-out is one shared component, the inner content is keyed by `panel.kind` to a registered renderer. |
| `frontend/src/features/oz/panelRegistry.ts` | Maps `panel.kind` → React component (`'table' → DataTablePanel`, `'invoice_preview' → LumberInvoicePreviewSheet`, …). Registering an existing hardcoded sheet here is what makes it model-callable. |

### 6.2 Files that change

| Path | Change |
|---|---|
| [backend/oz/ozChatToolRegistry.ts](backend/oz/ozChatToolRegistry.ts) | Add 6 tool definitions (`run_python`, `make_spreadsheet`, `make_docx`, `make_pdf`, `display_table`, `display_panel`). Update `OZ_CHAT_SYSTEM_PROMPT` with the artifact / panel guidance + XML-tag contract. Bump `OZ_CHAT_SYSTEM_PROMPT_VERSION`. |
| [backend/oz/chatRuntime.ts](backend/oz/chatRuntime.ts) | Extend `OzToolSurface` and `createOzToolSurface` with the 6 new methods, wired through `RuntimeDependencies` to `pythonSandbox` and `artifactStorage`. |
| [backend/oz/chatRuntimeAgentic.ts](backend/oz/chatRuntimeAgentic.ts) and [chatRuntimeAgenticOpenAi.ts](backend/oz/chatRuntimeAgenticOpenAi.ts) | No code changes if the tools follow the surface convention; but the `MAX_AGENT_ITERATIONS` cap (currently 12) may need a bump to 16 for sandbox-iterating turns. Worth gating: count `run_python` calls separately and cap at 4 per turn. |
| [backend/oz/trackCToolScaffold.ts](backend/oz/trackCToolScaffold.ts) | Make sandbox / Spaces clients optional — fall back to `tools_unavailable: ['run_python', 'make_*']` when the runner isn't reachable, like graph tools fall back today. |
| [shared/oz/citationGrammarResolver.ts](shared/oz/citationGrammarResolver.ts) | Add `artifact` and `panel` node kinds. Validation rejects unknown ids — the registry from §6.1 is the oracle. |
| [frontend/src/shared/ui/SimpleAssistantMarkdown.tsx](frontend/src/shared/ui/SimpleAssistantMarkdown.tsx) and/or [OzAssistantPanel.tsx](frontend/src/shared/ui/OzAssistantPanel.tsx) | Hook up `ArtifactPill` / `PanelPill` to the resolver output; mount the `SlideOutPanel`. |
| [frontend/src/shared/tableRowContext.ts](frontend/src/shared/tableRowContext.ts) | Add `'sandbox'` to `TableContextScope` so rows produced by `display_table` can be pinned. |
| [docs/oz-chat-contract-schema.md](docs/oz-chat-contract-schema.md) | Document the `<artifact/>` / `<panel/>` tag forms and the new `tool_call` payload shapes. |
| [docs/data-retention-and-artifact-policy.md](docs/data-retention-and-artifact-policy.md) | Document Spaces TTL, signed-URL lifetime, and what's redacted. |

### 6.3 Infrastructure / ops

- **Chat uploads bucket** — `oz-uploads-<env>` (e.g. `oz-uploads-dev`), separate from artifacts; CORS allow only the chat origin; lifecycle rule expiring objects after 24 h (provisioned as **1-day** S3-compatible lifecycle — see [`infra/digitalocean/README.md`](../infra/digitalocean/README.md)). Object keys: `s3://oz-uploads-<env>/<tenant>/<conv_id>/<upload_id>.<ext>` (§12.1.2).
- **Artifacts bucket** — `oz-artifacts-<env>` (e.g. `oz-artifacts-dev`, `oz-artifacts-prod`); **CORS** allow only the chat app origin(s); **lifecycle** rule expiring objects after **30 days** (object keys follow `<tenant>/<yyyymmdd>/<art_id>.<ext>`). Provisioning: [docs/infra/oz-artifacts-spaces.md](infra/oz-artifacts-spaces.md) and [infra/spaces-artifacts/](../infra/spaces-artifacts/).
- **Signed URLs** — short TTL (1 h default, configurable on `putArtifact`). The Node service holds Spaces keys and returns presigned `GetObject` URLs; the model never sees long-lived credentials. Rotate access keys quarterly.
- **Sandbox image** — a small `Dockerfile` next to [Dockerfile](Dockerfile) (or a multi-stage in the existing one) producing `oz-sandbox:<sha>`. Pin all package versions; rebuild on dependabot bumps; CI publishes to a private registry.
- **Telemetry** — extend the `OZ_TOOL_AUDIT=1` log line in [chatRuntime.ts](backend/oz/chatRuntime.ts) so sandbox calls log `{tool, latency_ms, exit_code, container_image_sha, sandbox_egress_bytes, artifacts_emitted}`. Critical for billing / abuse / debugging.

### 6.4 Tests to add (TDD-first, since that's how the rest of the runtime grew)

- `backend/oz/pythonSandbox.test.ts` — happy path, timeout, OOM, network-denied, output harvesting, file-size cap.
- `backend/oz/artifactStorage.test.ts` — put / get / signed URL TTL; failure modes (Spaces 5xx).
- `backend/oz/ozChatToolRegistry.test.ts` (existing) — assert the 6 new tools appear in `OZ_CHAT_TOOL_NAMES_ORDERED`.
- `backend/oz/chatRuntimeAgentic.test.ts` (existing) — fixtures: model emits `run_python` → tool_result has artifacts → final message contains `<artifact …/>` whose id matches.
- `frontend/src/shared/ui/ArtifactPill.test.tsx` — renders title/size/download, blocks unknown ids.
- `frontend/src/shared/ui/SlideOutPanel.test.tsx` — opens / closes, focus trap, Escape to close, registry lookup.
- `frontend/src/shared/oz/citationGrammarResolver.test.ts` — adds artifact / panel cases.

---

## 7. Phased rollout

A rough sequencing — each phase ships independently and demos something:

1. **Phase 1 — model-callable slide-out only (no sandbox).** Add `display_table` / `display_panel`, `<panel/>` parsing, register the existing hardcoded sheets in `panelRegistry`. The model can now open the invoice preview / job-cost recap from chat. **No new infra.** This is the cheapest, most demoable win.
2. **Phase 2 — typed artifact tools.** Add `make_spreadsheet`, `make_docx`, `make_pdf` running on the host (no container yet — these compile down to deterministic templates, not arbitrary code). Add `artifactStorage` + DO Spaces; add `<artifact/>` parsing + `ArtifactPill`.
3. **Phase 3 — `run_python` sandbox.** Add `pythonSandbox`, container image, runner abstraction. This is where most of the security work lives. After this, `make_*` tools route through the sandbox too (single code path).
4. **Phase 4 — promote artifacts back into ingest.** A natural follow-up: a generated docx can be re-ingested as a wiki source via [viteKbIngestApi.ts](backend/oz/viteKbIngestApi.ts) so the next conversation can cite it. Requires only an "ingest this artifact" link on the ArtifactPill.

---

## 8. Open questions

- **Multi-tenant sandbox isolation.** Today the demo is single-tenant. If we go multi-tenant, do we shard artifact buckets per tenant, or share a bucket with prefix-scoped IAM? (Probably the latter, but it has to be settled before §6.3.)
- **Cost.** A naive "every chart goes to Spaces" path is fine. A "model loops 8 times trying to fix a chart" path costs CPU + storage. The 4-call cap on `run_python` per turn (§6.2) is a starting heuristic — measure once we have data.
- **Streaming partials from the sandbox.** Long-running scripts could stream stdout to the client in real time. Worth doing? The Anthropic / OpenAI tool-call semantics don't naturally support partial tool results, so this would be a separate side-channel SSE event (`sandbox_partial`). Defer until we see a real need.
- **Determinism for tests.** Snapshotting xlsx / pdf bytes is painful (timestamps, font metrics). Snapshot the *input* to the template instead, plus a hash of the output, plus a structural assertion ("workbook has 2 sheets, sheet 1 has 31 rows"). Avoid full byte-for-byte goldens.
- **Where does the slide-out actually live in the layout.** Today the chat is one column with a composer. The slide-out has to overlay either the chat column or the whole shell. The pattern in [OzWorkflowShell.tsx](frontend/src/shared/ui/OzWorkflowShell.tsx) uses an inline expansion, not a true overlay drawer — for chat we probably want an overlay drawer pinned to the right edge of the chat column with a backdrop on mobile only.

---

## 9. References

- Chat runtime: [backend/oz/chatRuntime.ts](backend/oz/chatRuntime.ts), [backend/oz/chatRuntimeAgentic.ts](backend/oz/chatRuntimeAgentic.ts), [backend/oz/chatRuntimeAgenticOpenAi.ts](backend/oz/chatRuntimeAgenticOpenAi.ts), [backend/oz/ozChatToolRegistry.ts](backend/oz/ozChatToolRegistry.ts), [backend/oz/trackCToolScaffold.ts](backend/oz/trackCToolScaffold.ts)
- Citation grammar: [shared/oz/citationGrammarResolver.ts](shared/oz/citationGrammarResolver.ts)
- UI surfaces: [frontend/src/shared/ui/OzAssistantPanel.tsx](frontend/src/shared/ui/OzAssistantPanel.tsx), [frontend/src/shared/ui/SimpleAssistantMarkdown.tsx](frontend/src/shared/ui/SimpleAssistantMarkdown.tsx), [frontend/src/shared/ui/OzWorkflowShell.tsx](frontend/src/shared/ui/OzWorkflowShell.tsx)
- Existing slide-out / sheet inspirations: [frontend/src/features/quoteAutomation/LumberInvoicePreviewSheet.tsx](frontend/src/features/quoteAutomation/LumberInvoicePreviewSheet.tsx), [frontend/src/features/fieldApp/JobCostEstimateRecapSheet.tsx](frontend/src/features/fieldApp/JobCostEstimateRecapSheet.tsx)
- Row pinning grammar: [frontend/src/shared/tableRowContext.ts](frontend/src/shared/tableRowContext.ts)
- Architecture context this builds on: [docs/system-architecture.md](docs/system-architecture.md)

---

## 10. Implementation validation questions (sandbox, chat files, KB, and task direction)

This section records **questions we must answer before shipping** so the model integration is not merely “defined in the registry” but **actually executable**, and so **user-supplied files** flow from chat into sandbox context (and optionally into the knowledge base) with clear UX.

### 10.1 Does the model integration truly run code in the sandbox?

- **End-to-end proof:** Can a single agentic turn invoke `run_python`, receive real `stdout`/`stderr`/exit code, and see inline figures or artifact refs in the **same** tool-result channel the model already consumes? Where could that chain break (runner unreachable, tool stubbed in `trackCToolScaffold`, `MAX_AGENT_ITERATIONS`, prompt/version mismatch)?
- **Trust boundary:** Are `data_refs` always resolved server-side from prior tool results, or is there any path where the client could inject bytes into `/sandbox/inputs/`? If yes, that path must be closed before calling “sandboxed” complete.
- **Failure modes:** What does the user see when the sandbox OOMs, times out, or hits the per-turn `run_python` cap? Does the model get a structured error it can use to retry, or does the turn fail opaquely?
- **Parity across environments:** Does the dev stack use the same runner abstraction as prod (see §5.3), or could “works on my machine” hide a missing container image or `--network=none` surprise?

### 10.2 Chat attachments → sandbox “local context”

The design in §2.1 mounts resolved refs under `/sandbox/inputs/`. **User-uploaded files** are not the same as catalog/wiki tool results; we need an explicit story:

- **Object keys (Spaces):** Canonical layout — `s3://oz-uploads-<env>/<tenant>/<conv_id>/<upload_id>.<ext>` — in a dedicated bucket per env (`oz-uploads-<env>`), separate from artifacts; per-tenant prefix is the first path segment after the bucket. CORS allows **only** the chat web origin; lifecycle matches §12.1.2. Operator provisioning: [`infra/digitalocean/README.md`](../infra/digitalocean/README.md).
- **Ingestion path:** When the user attaches a file in the composer, where are bytes stored for the duration of the session (object storage, encrypted blob row, size limits, MIME allowlist)? Who generates the stable name the sandbox sees (`/sandbox/inputs/user_upload_1.csv`)?
- **Tool surface:** Do we add a tool parameter (e.g. `upload_ids: string[]`) that maps server-side to those blobs, or a dedicated prep step that materializes uploads into inputs before the model’s first `run_python` call in that turn?
- **Model visibility:** Does the system prompt list available input filenames and sizes so the model can write correct paths? How do we prevent path confusion when multiple files share similar names?
- **Privacy / retention:** Are uploads deleted after the conversation or TTL’d like artifacts (see §6.3)? If the user declines KB promotion (§10.4), is the file still deleted on schedule?

### 10.3 “Add this file to the knowledge base?” — confirmation popup

After a user attaches a file and the assistant has used it (or the user explicitly asks to save it), we should offer **optional promotion** into the wiki/KB ingest pipeline (aligned with Phase 4 in §7, but triggered from chat UX):

- **When to show:** Only after a successful processing path (ingest stub complete, or model acknowledged use), not on every accidental attachment — what are the exact triggers (user clicks “Save to KB”, or automatic prompt after first tool use of that blob)?
- **What we explain:** Short copy that describes visibility (who sees it), retention, and that re-ingest may take time — consistent with [docs/data-retention-and-artifact-policy.md](docs/data-retention-and-artifact-policy.md) once extended.
- **API:** Which backend endpoint(s) (e.g. existing vite KB ingest) receive the file metadata + consent flag? Idempotency if the user clicks twice?
- **Denylist:** Binary types we never promote without conversion; max size; PII warnings for uploads that look like exports.

### 10.4 Claude-like “task direction” popup (requirements / task list)

Separate from KB promotion: a **direction-gathering** modal in the spirit of Claude’s project/task UI — asks the user to point at or describe **where requirements live** (task list, beads issues, spec doc, Notion, etc.) so the agent can align turns with explicit scope.

- **Inputs:** Free text (“Requirements are in `bd` issue Oz-42 and the Field App recap sheet”) plus optional **structured picks**: link to in-app task list, paste of acceptance criteria, or file attachment cross-reference.
- **Persistence:** Is this direction stored per-thread, per-project, or session-only? How does it merge with `OZ_CHAT_SYSTEM_PROMPT` or a thread-level system addendum without blowing token limits?
- **Relationship to tools:** Should `display_panel` or a new tool read “pinned direction” so the model can cite “you asked for X from the task list” in replies?

### 10.5 UI adaptation (concrete surface changes)

To support §10.2–§10.4 without crowding the composer:

- **Attachment strip:** Visible list of files attached to the current turn (name, size, remove); optional “Used in this reply” badge when the sandbox or a tool consumed the file.
- **Stacked modals / drawers:** KB promotion (§10.3) vs task-direction (§10.4) should not fight for focus — define z-order, Esc behavior, and mobile full-screen vs desktop centered card (Claude-like: compact card with primary/secondary actions).
- **Empty states:** If the user opens “Task direction” before attaching anything, guide them to link requirements or attach a spec.
- **Accessibility:** Focus trap, aria labels for “Add to knowledge base” vs “Set task direction”, and keyboard paths for both flows.

### 10.6 Decision checklist (for PM / eng review)

| Topic | Question |
|--------|----------|
| Sandbox reality | Have we run one full loop: upload → `run_python` → artifact → render in UI? |
| Chat files | Is there a server-authoritative map from attachment id → `/sandbox/inputs/` path for that turn? |
| KB popup | Is consent explicit, logged, and wired to an ingest API? |
| Task popup | Is thread-level “direction” stored and injected into the agent context deterministically? |
| UI | Can a user complete attach → chat → optional KB + optional task direction without layout breakage on narrow viewports? |

---

**Stakeholder prompt:** *Do you want the chat attachment flow to include (1) post-use “Add to knowledge base?” popups, (2) a Claude-style modal to capture task list / requirements direction, and (3) the UI adaptations above (attachment strip, modal stacking, a11y)?* Confirming scope here gates §6–§7 sequencing and whether Phase 4 (§7) moves inline with Phase 3 or ships as a fast follow.

---

## 11. Full-document implementation interrogation

Questions below are derived by **walking the proposal top-to-bottom** (§1–§9). They should be answered or explicitly deferred before calling any phase “done.” §10 stays focused on sandbox reality, attachments, KB, and task-direction UX; this section catches **everything else** that still needs a concrete decision.

### 11.1 Mental model & tool surface (§1–§2)

- **Tool inventory:** §6.2 lists six tools (`run_python`, three `make_*`, `display_table`, `display_panel`). Confirm none are deferred to a later phase under different names, and that `OZ_CHAT_TOOL_NAMES_ORDERED` stays in sync with production rollout flags.
- **`data_refs` schema:** What exact `{kind, id}` enumerations does the resolver accept, and how does each kind map to a filename under `/sandbox/inputs/` (§2.1)? What happens when the model references an id from an older turn or a trimmed context window?
- **Package parity:** The sandbox image lists **plotly** (§2.1) but the proposed `run_python` description string does not mention it. Is plotly in or out for v1, and where is the single source of truth (image vs prompt vs tests)?
- **Wrapper vs arbitrary code (§2.2):** Phase 2 runs `make_*` on the host without the container; Phase 3 routes everything through the sandbox. What is the cutover plan so we do not maintain two divergent template implementations forever?
- **`display_panel` registry:** `kind` includes `"file_drop"` — does that duplicate chat attachments (§10.2), and who owns focus when both exist?

### 11.2 Streaming, injection, and XML contract (§3–§4)

- **Streaming assistant tokens:** Tags are parsed after the full message exists today. If the UI streams tokens, how do we avoid flashing malformed `<artifact …` fragments or executing resolver logic on incomplete XML? Parse only on final message, or incremental parser?
- **`<panel/>` injection (§2.3):** “Injected at the cursor position” during agentic streaming — which component owns injection (backend after tool_result, or frontend), and how is ordering guaranteed relative to the model’s own emitted `<panel …/>` text?
- **Provenance window:** “Same turn” for valid ids (§3): is that defined as the same HTTP request / same assistant message id / same tool-result batch? What about multi-step turns that span multiple assistant segments?
- **Registry oracle:** Validation rejects unknown artifact ids (§3). Does the client fetch metadata by id from `artifactRegistry`, or is everything embedded in the stream? How do we handle expiry mid-session (signed URL TTL §6.3 vs artifact TTL)?

### 11.3 Sandbox security & placement (§5)

- **Isolation technology:** gVisor vs Firecracker (§5.1) — which ships in v1, and what is the migration criterion for the other?
- **Network opt-in:** `network: 'allow'` is backend-only (§5.1). Which internal role or config flag sets it, and is it per-tenant, per-env, or per-request allowlisting?
- **Resource limits:** Defaults (`512m`, `1` CPU, `120s` max in tool params) — who can override them in prod, and what abuse signals trigger hard caps?

### 11.4 Infrastructure, registry, and artifacts (§6)

- **`oz_artifacts` vs Spaces:** §6.1 describes Postgres `oz_artifacts` **and** object storage. On read path for `ArtifactPill`, if DB and Spaces disagree after a failed upload, which wins? Is there a repair job?
- **Inline base64 ceiling:** PNG/JPEG ≤ **N** MB inline (§2.1) — what is N, and how do we keep tool-result payloads under provider max message sizes?
- **Multi-tenant fields:** `artifactRegistry` includes `tenant` — how is tenant derived today in the demo, and what breaks if it is null?
- **CI for sandbox image:** §6.3 says CI publishes `oz-sandbox:<sha>`. Does the chat backend pin by digest in config, and how do rollbacks work?

### 11.5 Phasing, tests, and rollout (§7–§8)

- **Phase 1 without sandbox:** `display_table` / `display_panel` still need tool results stashed in Zustand (§2.3). Is that store keyed only by message id, or also thread id, to avoid collisions when the user switches threads quickly?
- **Phase order vs Phase 4:** User-uploaded KB promotion (§10.3) overlaps Phase 4 (§7). Should chat-upload ingest reuse the same pipeline as artifact re-ingest, or stay separate for auditing?
- **Testing strategy (§6.4):** Are integration tests run against a real local Docker sandbox or a mocked runner? What is the minimum bar to merge Phase 3 safely?
- **§8 open questions:** For each bullet (multi-tenant buckets, cost caps, streaming stdout, determinism, slide-out layout), either assign an owner/decision date or mark “explicitly out of scope for v1.”

### 11.6 References & contract docs (§9)

- **Doc drift:** [docs/oz-chat-contract-schema.md](docs/oz-chat-contract-schema.md) and [docs/data-retention-and-artifact-policy.md](docs/data-retention-and-artifact-policy.md) are listed as updates (§6.2) but do not exist yet in every branch. What is the sequencing: contract doc before implementation, or alongside?

### 11.7 Cross-cutting

- **Observability:** When `tools_unavailable` includes sandbox tools (`trackCToolScaffold`, §6.2), does the UI explain why (runner down vs feature flag), or does the model silently omit capabilities?
- **Abuse:** What prevents a user from uploading huge files every turn to exhaust storage or sandbox CPU, and how does that interact with the cost questions in §8?

---

**Review gate:** Treat §10.6 plus §11 as a **single exit checklist** for implementation readiness; skip items only with a written “defer / out of scope” note in [docs/oz-chat-contract-schema.md](docs/oz-chat-contract-schema.md) or the phase README when those exist.

---

## 12. Answers to §10 and §11 (review pass, 2026-05-01)

These answers are the working baseline. Anything not answered here is explicitly deferred and tracked via the beads chain in §13.

### 12.1 Answers to §10

#### 12.1.1 Sandbox reality (§10.1)

- **End-to-end proof.** Full chain: `chatRuntimeAgentic.ts` → `OzToolSurface.run_python` → `pythonSandbox.ts` → container exit → uploader → `tool_result` event back to the model. Break points to harden: missing surface method (TS catches), runner unreachable (startup smoke test that runs `print("ok")` on every backend boot), [`MAX_AGENT_ITERATIONS = 12`](backend/oz/chatRuntimeAgentic.ts#L24) ending the loop mid-iteration (raise to 16, count `run_python` separately), [`TOOL_RESULT_CONTENT_CAP = 80_000`](backend/oz/chatRuntimeAgentic.ts#L26) truncating big stdout (raise to 256 KB for sandbox results, append inline figures *after* truncation), `OZ_CHAT_SYSTEM_PROMPT_VERSION` not bumped. Acceptance bar: a fixture-driven turn in `chatRuntimeAgentic.test.ts` where `run_python` returns a real `art_…` id and the final message contains a matching `<artifact id="art_…"/>`.
- **Trust boundary.** `data_refs` are server-side only. The model passes `{kind, id}`; the resolver looks the id up in the server's prior-tool-result cache. Client never touches `/sandbox/inputs/`. User uploads use a separate channel (§10.2) keyed by server-issued `upload_id`.
- **Failure modes.** Structured tool-result error: `{ok:false, reason:"timeout"|"oom"|"nonzero_exit"|"sandbox_unavailable"|"egress_denied"|"call_cap_exceeded"|"ref_expired", stdout, stderr, exit_code, runtime_ms}`. Per-turn cap is 4 `run_python` calls. System prompt instructs the model to fall back to non-sandbox tools and tell the user when reasons are unrecoverable.
- **Parity across environments.** Both envs go through `SandboxBackend`; dev = `LocalDockerBackend`, prod = `RemoteSandboxBackend`. Image pinned by digest in `ozConfig.ts`. `--network=none` is enforced in the backend, not the image, so it's identical in both.

#### 12.1.2 Chat attachments → sandbox local context (§10.2)

- **Ingestion path.** New endpoint `POST /api/oz/chat/uploads`. Multipart, MIME allowlist (`text/csv`, `application/json`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/pdf`, `text/plain`, `image/png`, `image/jpeg`), 25 MB per-file, 100 MB per-turn aggregate. Bytes go to `s3://oz-uploads-<env>/<tenant>/<conv_id>/<upload_id>.<ext>` (bucket **`oz-uploads-<env>`**, distinct from `oz-artifacts-<env>`). Provision the bucket + CORS + lifecycle via [`infra/digitalocean/provision-oz-uploads-bucket.sh`](../infra/digitalocean/provision-oz-uploads-bucket.sh). Returns `{upload_id, filename, kind, size_bytes, sha256}`. Server is the only owner of `upload_id → /sandbox/inputs/<safe_name>` mapping.
- **Tool surface.** Add `upload_ids?: string[]` to `run_python` and to `make_*` (so a docx can embed a user-uploaded image). Server resolves each id to `/sandbox/inputs/upload_<n>__<sanitized_filename>`.
- **Model visibility.** `chat_uploads` block injected into the system prompt for any turn with uploads, listing `[{upload_id, mounted_at, filename, kind, size_bytes}]`. Numeric prefix in `mounted_at` disambiguates same-named files. Tool description gets one extra sentence pointing to that block.
- **Privacy / retention.** Uploads default to **24 h TTL** (vs 30 d for artifacts). KB promotion (§10.3) copies bytes into the KB pipeline; declining promotion does **not** extend the upload TTL.

#### 12.1.3 KB-promotion popup (§10.3)

- **When.** Only on (a) explicit "Save to KB" click, or (b) successful tool-call consumption of the upload **and** kind ∈ {csv, xlsx, pdf, docx, txt, md}. Never auto-prompt on bare attach.
- **Copy.** *"Add this file to the knowledge base? Future conversations in this workspace will be able to cite it. Indexing takes a few minutes. You can remove it later from the Knowledge Base page."*
- **API.** Reuse [`viteKbIngestApi.ts`](backend/oz/viteKbIngestApi.ts) with `{upload_id, consent:true, source:"chat-promotion"}`. Idempotent on `(upload_id, tenant)`; second click is a no-op resolving to the same `source_id`. Returns `source_id` so the chip can flip to "Indexed".
- **Denylist.** Hard reject anything off the allowlist or `>` 25 MB. (PII soft-warn scan was de-scoped on 2026-05-02 — allowlist + size cap + explicit consent are sufficient for the demo; re-file if a real tenant requires it.) All promotions logged to `wiki/log.md` plus an audit row.

#### 12.1.4 Task-direction popup (§10.4)

- **Inputs.** Free text + structured optional picks: `bd:` issue link, pasted acceptance criteria (markdown), Notion/wiki URL, cross-references to `upload_id`s in this conversation.
- **Persistence.** Per-thread row in `oz_thread_direction (thread_id, tenant, direction_text, structured_refs jsonb, set_at, set_by)`. Per-thread matches the scoping in [`memoryAdapters.ts`](backend/oz/memoryAdapters.ts).
- **Prompt injection.** `direction_summary` block inserted right after [`OZ_CHAT_SYSTEM_PROMPT`](backend/oz/ozChatToolRegistry.ts#L9), capped at 800 tokens. Truncation is server-enforced; the modal warns the user when their input would be cut.
- **Tool relationship.** No new tool in v1. `display_panel({kind:"thread_direction"})` lets the model show its current understanding of direction when uncertain — defer if it isn't pulling weight.

#### 12.1.5 UI adaptation (§10.5)

- **Attachment strip.** `UploadStrip` below the composer, above the existing chips. "Used in this reply" badge fires when `upload_id` shows up in any tool input that turn.
- **Modal stacking.** KB-promotion = inline card pinned under the assistant message that produced the use (no focus trap). Task-direction = centered modal at conversation start or via a header button (focus trap, Esc closes, `Enter` confirms). Mounted at different DOM depths so they never collide.
- **Empty states.** Task-direction modal opened with no attachments shows three one-click options: link a `bd` issue, paste acceptance criteria, attach a spec.
- **A11y.** `role="dialog"` for modal, `role="region"` for inline card, `aria-labelledby` on both. `Cmd-K` opens task direction. Upload strip is `role="list"` with `aria-label="Files attached to this turn"`.

#### 12.1.6 Stakeholder prompt — recommended scope

Yes to all three (KB-promotion popup, task-direction modal, UI adaptations) — but ship them on the Phase-1 train, not gated behind Phase 3. They depend only on the upload endpoint. New sequencing: **Phase 1a (slide-out) → Phase 1b (uploads + KB promotion + task direction) → Phase 2 (typed artifacts) → Phase 3 (sandbox) → Phase 4 (artifact → KB re-ingest)**.

### 12.2 Answers to §11

#### 12.2.1 Mental model & tool surface (§11.1)

- **Tool inventory.** Six tools, names final. `OZ_CHAT_TOOL_NAMES_ORDERED` is generated from `ozChatOpenAiToolDefinitions()` so it stays in sync; an [`ozChatToolRegistry.test.ts`](backend/oz/ozChatToolRegistry.test.ts) assertion locks the per-phase ordered list.
- **`data_refs` schema.** `kind` ∈ `{catalog_list_result, catalog_get_result, kb_search_result, search_transcripts_result, recommendations_for_result, run_python_result, upload}`. Each kind maps to a fixed `/sandbox/inputs/` filename pattern. Out-of-window ids return `{ok:false, reason:"ref_expired", id}`. Cache lives on the server, keyed by `(conversation_id, message_id)`.
- **Package parity.** Single source of truth = the image `Dockerfile`. Plotly is **out** for v1; description / image / `available_packages` smoke test all stay in sync.
- **Wrapper vs arbitrary code.** One Python module under `backend/oz/sandboxTemplates/`. Phase 2 invokes via `python -m`; Phase 3 invokes the same module inside the container. Cutover to container-only after two clean weeks; one PR.
- **`display_panel` `file_drop` kind.** Drop it from the registry. Chat attachments own that flow.

#### 12.2.2 Streaming, injection, XML contract (§11.2)

- **Streaming tokens.** Incremental tag-aware parser: buffer any `<` until `>` arrives (validate then), or until a non-tag character forces it to be treated as literal. `ArtifactPill` / `PanelPill` only mount on complete valid tags. Final-message reparse catches tags spanning truncation boundaries.
- **`<panel/>` injection.** Backend-owned. Streamer emits `<panel id="…"/>` on the SSE channel after the corresponding `tool_result` event. Frontend never injects.
- **Provenance window.** Same `assistant_message_id` (one assistant turn = one message id, even multi-step). Prior-message tool results are *not* valid provenance.
- **Registry oracle.** Minimal metadata `{id, kind, title, size_bytes}` is embedded in the SSE `tool_result`. Signed URL is a lazy fetch (`GET /api/oz/artifacts/<id>/signed-url`) issued on download click — fresh TTL per click. Expired = `410 Gone`, pill renders an "Artifact expired" state.

#### 12.2.3 Sandbox security & placement (§11.3)

- **Isolation tech.** gVisor in v1. Migrate to Firecracker only on (a) shared-hardware multi-tenant or (b) wider exposure of `network: 'allow'`. Migration criterion documented next to the runner config.
- **Network opt-in.** `network: 'allow'` is backend-only, gated on a server-side trusted-operator role. Never reachable from the user-facing chat path. Per-tenant overrides are logged.
- **Resource limits.** Defaults in `ozConfig.ts`: `memory=512m`, `cpus=1.0`, `pids=128`, `wall_clock=30s` (max 120s), `output_bytes=64MB`. Abuse signals (`>20` sandbox calls/min/user, `>500 MB` artifacts/day/user) trigger 1 h hard cap + Slack alert via the existing `OZ_TOOL_AUDIT` channel.

#### 12.2.4 Infrastructure, registry, artifacts (§11.4)

- **`oz_artifacts` vs Spaces.** DB row is the source of truth; Spaces is the bytes. Write order: Spaces upload (idempotent by sha256-keyed object) → DB row insert only on Spaces success. DB hit + Spaces miss → `status='lost'`, `410 Gone`. Nightly repair job walks the last 7 days and tombstones lost rows. No retroactive recovery.
- **Inline base64 ceiling.** N = **1 MB** for inline base64 (most matplotlib charts at 100 dpi). Above 1 MB → upload + ref only. Sandbox `TOOL_RESULT_CONTENT_CAP` raised to 256 KB; inline figures appended *after* truncation so they always fit.
- **Multi-tenant fields.** Tenant defaults to `"demo"`. Multi-tenant readiness = swap the default for a `requireTenant(req)` middleware.
- **CI for sandbox image.** CI builds + pushes `oz-sandbox:<git_sha>` to private registry. Backend pins by digest in `ozConfig.sandboxImageDigest`. Rollback = bump digest, redeploy. No image deletion in registry.

#### 12.2.5 Phasing, tests, rollout (§11.5)

- **Phase 1 panel store.** Keyed by `(thread_id, message_id)`, both. Reuses the per-stream-state pattern in [`useOzChatStream.ts`](frontend/src/features/oz/useOzChatStream.ts).
- **Phase order vs Phase 4.** Same pipeline: chat-upload promotion writes through [`viteKbIngestApi.ts`](backend/oz/viteKbIngestApi.ts) with `source:"chat-upload"`; artifact re-ingest with `source:"chat-artifact"`. One pipeline, two source labels.
- **Testing strategy.** Three tiers: (a) unit on the runner abstraction with a mocked backend (every PR); (b) integration against a real local Docker sandbox (PRs touching `pythonSandbox.ts` or `sandboxTemplates/`, gated on `[sandbox]` label); (c) E2E against the prod-image digest in nightly CI. Phase 3 merge bar: (a) green, (b) green for touched paths, plus one human-reviewed E2E run.
- **§8 open-question dispositions.**
  - Multi-tenant buckets → out of scope for v1.
  - Cost caps → owner = sandbox-runner author; decision date = end of Phase 3 first week (telemetry-driven).
  - Streaming stdout → out of scope for v1.
  - Determinism for tests → owner = `pythonSandbox.test.ts` author; decided in that PR.
  - Slide-out layout → owner = frontend; decided during Phase 1a design review.

#### 12.2.6 References & contract docs (§11.6)

Contract doc lands **before** implementation in the same PR that adds the tool definitions. Retention/policy doc lands **alongside** Phase 2 (when artifacts first hit Spaces). Tools don't ship without the contract doc; the [`OZ_CHAT_SYSTEM_PROMPT`](backend/oz/ozChatToolRegistry.ts#L9) links to it.

#### 12.2.7 Cross-cutting (§11.7)

- **Observability.** When sandbox tools are unavailable, the agent loop emits `runtime_summary={tools_unavailable:[…], reason:"runner_unreachable"|"feature_disabled"}`. UI shows a banner ("Sandbox temporarily unavailable — typed exports still work") only on unexpected unavailability.
- **Abuse.** Three layers: (a) per-turn caps (100 MB uploads, 4 `run_python` calls); (b) per-user/day caps on sandbox CPU-seconds and total artifact bytes; (c) per-tenant monthly caps wired to billing. Cap breaches return structured errors to the model; daily-cap breaches return `429` to the user. Same `OZ_TOOL_AUDIT` channel; alerts page through existing oncall.

### 12.3 Pre-shipping fixes that affect the existing runtime

These three land *before* any new tool ships, because they harden the existing runtime first:

1. Raise `TOOL_RESULT_CONTENT_CAP` in [`chatRuntimeAgentic.ts`](backend/oz/chatRuntimeAgentic.ts#L26) to 256 KB for sandbox-class results, with inline figures appended after truncation.
2. Add a `(thread_id, message_id)`-keyed Zustand store in [`useOzChatStream.ts`](frontend/src/features/oz/useOzChatStream.ts) for panel-result payloads, so fast thread switches don't collide.
3. Drop `file_drop` from the proposed `display_panel` kinds — chat attachments (§10.2) own that flow.

---

## 13. Beads task chain

Implementation work is tracked in beads. The chain below is the canonical sequencing — see the actual issues for current status (`bd ready`, `bd show <id>`).

**Umbrella epic:** [`Oz-Demo-ih4`](#) — *EPIC: Code sandbox + artifact generation + model-callable slide-out panels*. Blocked by every leaf below; closing all leaves unblocks the epic.

### 13.1 Foundation (cross-phase, no blockers)

These five harden the existing runtime first and are the entry points for everything else.

| ID | Title | Blocks |
|---|---|---|
| `Oz-Demo-9s8` | F1: Raise `TOOL_RESULT_CONTENT_CAP` to 256 KB for sandbox results | P3-3 |
| `Oz-Demo-8vu` | F2: `(thread_id, message_id)` keyed panel store in `useOzChatStream` | F4 |
| `Oz-Demo-7eq` | F3: Extend `citationGrammarResolver` with `artifact` + `panel` node kinds | F4 |
| `Oz-Demo-mt9` | F4: `ArtifactPill`, `PanelPill`, `SlideOutPanel` components | P1a-3, P1a-6, P2-7 |
| `Oz-Demo-3hr` | F5: Update `OZ_CHAT_SYSTEM_PROMPT` with XML-tag contract; bump version | P1a-3, P2-4/5/6, P3-4 |
| `Oz-Demo-aii` | D1: `docs/oz-chat-contract-schema.md` updates (XML tags, tool_call payloads) | P1a-3, P2-4, P3-4 |

### 13.2 Phase 1a — model-callable slide-out (no new infra)

The cheapest demoable win: model can open the existing hardcoded sheets from chat.

| ID | Title | Depends on |
|---|---|---|
| `Oz-Demo-40y` | P1a-1: `display_table` + `display_panel` tool definitions in registry | — |
| `Oz-Demo-49n` | P1a-2: `panelRegistry.ts` maps `panel.kind` → React component | — |
| `Oz-Demo-tn4` | P1a-3: Wire `SlideOutPanel` into `OzAssistantPanel`; backend emits `<panel/>` after tool_result | F4, F5, D1, P1a-1, P1a-2 |
| `Oz-Demo-a3g` | P1a-4: Register existing hardcoded sheets in `panelRegistry` | P1a-2, P1a-3 |
| `Oz-Demo-ann` | P1a-5: Extend `TableContextScope` with `'sandbox'` and generalize chip color mapping | P1a-3 |
| `Oz-Demo-0wm` | P1a-6: `SlideOutPanel` + `panelRegistry` tests | F4, P1a-2 |

### 13.3 Phase 1b — uploads + KB promotion + task direction

Doesn't depend on the sandbox; ships on the same train as Phase 1a per §12.1.6.

| ID | Title | Depends on |
|---|---|---|
| `Oz-Demo-u71` | P1b-0: Provision `oz-uploads-<env>` DO Spaces bucket + 24 h lifecycle rule | — |
| `Oz-Demo-2ur` | P1b-1: `POST /api/oz/chat/uploads` endpoint (multipart, MIME allowlist, size caps) | P1b-0 |
| `Oz-Demo-adh` | P1b-2: `UploadStrip` UI under composer + "Used in this reply" badge | P1b-1 |
| `Oz-Demo-9zl` | P1b-3: `chat_uploads` system-prompt block injection + tool param `upload_ids` | P1b-1, F5, P2-4 |
| `Oz-Demo-irv` | P1b-4: KB-promotion inline card UX (no focus trap) | P1b-1, P1b-2 |
| `Oz-Demo-u4j` | P1b-5: KB-promotion API — `viteKbIngestApi` accepts `{upload_id, consent, source}` | P1b-1, P1b-4 |
| `Oz-Demo-abp` | P1b-8: `oz_thread_direction` table + GET/PUT API | — |
| `Oz-Demo-i4c` | P1b-7: Task-direction modal (frontend) — Cmd-K, header button, focus trap, Esc close | P1b-8 |
| `Oz-Demo-1zl` | P1b-9: Inject `direction_summary` into system prompt (800 token cap, server-enforced) | P1b-7, P1b-8 |

### 13.4 Phase 2 — typed artifact tools

| ID | Title | Depends on |
|---|---|---|
| `Oz-Demo-mll` | P2-0: Provision `oz-artifacts-<env>` DO Spaces bucket + 30 d lifecycle + signed-URL access | — |
| `Oz-Demo-ddb` | P2-1: `backend/oz/artifactStorage.ts` — DO Spaces s3-compatible client | P2-0 |
| `Oz-Demo-5yu` | P2-2: `backend/oz/artifactRegistry.ts` — Postgres `oz_artifacts` table + repair job | P2-1 |
| `Oz-Demo-ha8` | P2-3: `backend/oz/sandboxTemplates/` Python module (host-mode, Phase 2 entry) | — |
| `Oz-Demo-dkj` | P2-4: `make_spreadsheet` tool — registry def + surface impl + tests | F5, D1, P2-2, P2-3 |
| `Oz-Demo-hhr` | P2-5: `make_docx` tool — registry def + surface impl + tests | F5, P2-2, P2-3 |
| `Oz-Demo-itz` | P2-6: `make_pdf` tool — registry def + surface impl + tests | F5, P2-2, P2-3 |
| `Oz-Demo-syb` | P2-7: `GET /api/oz/artifacts/<id>/signed-url` — lazy fresh-TTL endpoint | F4, P2-2 |
| `Oz-Demo-38c` | D2: `docs/data-retention-and-artifact-policy.md` updates | P1b-0, P2-0 |

### 13.5 Phase 3 — `run_python` sandbox

| ID | Title | Depends on |
|---|---|---|
| `Oz-Demo-byc` | P3-5: Bump `MAX_AGENT_ITERATIONS` to 16 in `chatRuntimeAgentic` + OpenAI variant | — |
| `Oz-Demo-g3v` | P3-1: `oz-sandbox` container image (Dockerfile, pinned packages, CI publish by digest) | — |
| `Oz-Demo-zsa` | P3-2: `SandboxBackend` interface + `LocalDockerBackend` (gVisor runtime, dev/prod parity) | P3-1 |
| `Oz-Demo-429` | P3-3: `pythonSandbox.ts` — input mounting, output harvesting, structured errors | F1, P2-1, P3-2 |
| `Oz-Demo-4qh` | P3-4: `run_python` tool — registry def + surface impl + per-turn 4-call cap | F5, D1, P3-3, P3-5 |
| `Oz-Demo-bwn` | P3-6: Sandbox startup smoke test on backend boot | P3-3 |
| `Oz-Demo-vk6` | P3-11: `pythonSandbox.test.ts` — three-tier test strategy | P3-1, P3-3 |
| `Oz-Demo-1xm` | P3-7: Migrate `make_*` tools to sandbox-routed path; delete host-mode branch | P3-3, P2-4, P2-5, P2-6 |
| `Oz-Demo-0zc` | P3-8: Per-user/day CPU + artifact byte caps + Slack alerts | P3-4 |
| `Oz-Demo-wte` | P3-9: `OZ_TOOL_AUDIT` extensions for sandbox calls | P3-4 |
| `Oz-Demo-tnr` | P3-10: "Sandbox unavailable" UI banner when `tools_unavailable` includes `run_python` | P3-4, P3-6 |

### 13.6 Phase 4 — artifact → KB re-ingest

| ID | Title | Depends on |
|---|---|---|
| `Oz-Demo-56n` | P4-1: "Ingest this artifact" button on `ArtifactPill` → KB | P1b-5, P2-7 |

### 13.7 Initial ready set

Tasks with no blockers (entry points the next agent can pick up):

- **Foundation:** `Oz-Demo-9s8` (F1), `Oz-Demo-8vu` (F2), `Oz-Demo-7eq` (F3), `Oz-Demo-3hr` (F5), `Oz-Demo-aii` (D1)
- **Phase 1a:** `Oz-Demo-40y` (P1a-1), `Oz-Demo-49n` (P1a-2)
- **Phase 1b:** `Oz-Demo-u71` (P1b-0), `Oz-Demo-abp` (P1b-8)
- **Phase 2:** `Oz-Demo-mll` (P2-0), `Oz-Demo-ha8` (P2-3)
- **Phase 3:** `Oz-Demo-g3v` (P3-1), `Oz-Demo-byc` (P3-5)

Run `bd show <id>` for full description and dependency lists, or `bd ready` to see the live unblocked frontier.

