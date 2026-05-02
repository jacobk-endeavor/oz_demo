/**
 * Authoritative system prompt + per-tool descriptions for the Oz chat agent (tool-use routing).
 * Spec: docs/wiki-kb/track-c-chat-integration.md — descriptions act as routing logic; no separate classifier.
 */

export const OZ_CHAT_SYSTEM_PROMPT_VERSION = '2026-05-track-c-0bx' as const

/** Full system prompt appended before tool definitions in an OpenAI-style chat completion. */
export const OZ_CHAT_SYSTEM_PROMPT = [
  'You are Oz, an assistant for a lumber / building-products distributor. You answer using tools — never invent catalog rows, chunk IDs, or wiki paths.',
  'Routing is entirely via tool choice: read each tool description and pick the smallest set that answers the user. Prefer structured catalog/recommendations tools when the user names a SKU, product line code, or asks for numeric rollups; prefer kb_search for verbatim document/call retrieval; prefer wiki_* when the question is about synthesized markdown knowledge or change history.',
  'Citations in answers must use the canonical forms returned by tools (e.g. [doc:…], [call:…], [catalog:sku=…], [[wiki:slug/path]]).',
  'When the user prefixes with /vector, /wiki, /catalog, or /calls, a separate system note already biased your substrate — honor it before exploring other surfaces.',
  'Sandbox and artifact tools (when present): Prefer typed generators — make_spreadsheet, make_docx, make_pdf — when the tabular or document schema is already known; use run_python to explore, transform, plot, or iterate before that shape is settled.',
  'Files returned by artifact tools must be shown to the user only as self-closing <artifact …/> tags matching tool_result fields (id, kind, title, size_bytes as applicable). Never paste raw signed URLs or bare download links from tool output. For display_table / display_panel, embed the slide-out affordance with <panel …/> the same way — never invent panel ids.',
  'Every <artifact id="…"/> and <panel id="…"/> value must be copied verbatim from a tool_result in the same assistant message turn (same assistant_message_id); ids from earlier assistant messages are invalid and must not be reused. See docs/code-sandbox-and-artifact-generation.md sections 2.2, 3, and 12.2.2.',
  `Prompt package: ${OZ_CHAT_SYSTEM_PROMPT_VERSION}`,
].join('\n')

const jsonParameters = (
  properties: Record<string, { type: string; description?: string; enum?: string[] }>,
  required?: string[],
) =>
  ({
    type: 'object',
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties: false,
  }) as const

export type OzOpenAiStyleTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** OpenAI-compatible tool list covering OzToolSurface (Layers 1–2 + Layer 3 stubs + graph/memory stubs). */
export function ozChatOpenAiToolDefinitions(): OzOpenAiStyleTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'graph_search',
        description:
          'Traverse the knowledge graph by query when the user asks about relationships between entities already modeled as nodes (suppliers, SKUs, brands). Avoid for simple SKU or wiki lookups.',
        parameters: jsonParameters({
          query: { type: 'string', description: 'Natural language graph probe.' },
          depth: { type: 'number', description: 'Traversal depth (bounded by runtime).' },
          size: { type: 'number', description: 'Max nodes to return.' },
          scope: { type: 'string', description: 'Optional tenant or territory scope.' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'graph_neighbors',
        description:
          'List neighbors of a known graph node. Use after graph_search when you need adjacent entities.',
        parameters: jsonParameters({
          nodeId: { type: 'string', description: 'Opaque graph node id.' },
          depth: { type: 'number' },
          size: { type: 'number' },
          scope: { type: 'string' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_transcripts',
        description:
          'Semantic search over sales-call chunks (pgvector). Use for call evidence, rep quotes, objections, delivery complaints. Combine with read_transcript for full snippets.',
        parameters: jsonParameters({
          query: { type: 'string' },
          scope: { type: 'string', description: 'Optional rep or territory filter.' },
          top_k: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_transcript',
        description:
          'Load transcript chunks for a specific call_id after search_transcripts surfaces a hit.',
        parameters: jsonParameters({
          call_id: { type: 'string' },
          scope: { type: 'string' },
          max_chunks: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_get',
        description:
          'Direct lookup of one SKU in product_catalog.json. Use whenever the user names a SKU or part number.',
        parameters: jsonParameters({ sku: { type: 'string' } }, ['sku']),
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_list',
        description:
          'Filtered listing / ranking over catalog rows (sales, margin, product line). Use for “top N”, “show me SKUs in …”, loss-makers, etc.',
        parameters: jsonParameters({
          product_line: { type: 'string' },
          sub_category: { type: 'string' },
          brand: { type: 'string' },
          min_sales: { type: 'number' },
          sort_by: { type: 'string' },
          top_n: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_search',
        description:
          'Hybrid lexical + embedding search when the user describes a product but does not give a SKU.',
        parameters: jsonParameters({
          query: { type: 'string' },
          k: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_aggregate',
        description:
          'Rollups (sum/avg/count) grouped by product line, brand, sub_category, etc. Use for portfolio questions.',
        parameters: jsonParameters({
          group_by: { type: 'string' },
          metric: { type: 'string' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_compare',
        description: 'Side-by-side comparison for multiple SKUs (fields + deltas).',
        parameters: {
          type: 'object',
          properties: {
            skus: {
              type: 'array',
              items: { type: 'string' },
              description: 'Two or more SKU codes to compare.',
            },
          },
          required: ['skus'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_diff',
        description: 'Pairwise diff between two SKUs with numeric deltas.',
        parameters: jsonParameters({
          sku_a: { type: 'string' },
          sku_b: { type: 'string' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'catalog_neighbors',
        description: 'Nearest SKUs by price, margin, sales, or description similarity.',
        parameters: jsonParameters({
          sku: { type: 'string' },
          by: { type: 'string', enum: ['price', 'margin', 'sales', 'description'] },
          k: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'wiki_read',
        description: 'Read one markdown page by repo-relative wiki path when you already know the path.',
        parameters: jsonParameters({ path: { type: 'string' } }, ['path']),
      },
    },
    {
      type: 'function',
      function: {
        name: 'wiki_grep',
        description: 'Literal / regex search across wiki files when index lookup misses.',
        parameters: jsonParameters({
          query: { type: 'string' },
          top_n: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'wiki_log',
        description: 'Read wiki/log.md for operational history (ingest, lint, synth events).',
        parameters: jsonParameters({
          kind: { type: 'string' },
          since: { type: 'string' },
          until: { type: 'string' },
          top_n: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'kb_search',
        description:
          'Vector retrieval over kb_rag_chunks and call_rag_chunks. Primary tool for document chunks and call RAG; set surface to narrow.',
        parameters: jsonParameters({
          query: { type: 'string' },
          surface: { type: 'string', enum: ['kb', 'call', 'global'] },
          k: { type: 'number' },
          kind: { type: 'string' },
          call_scope: { type: 'string' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'recommendations_for',
        description:
          'Fetch cross-sell, upsell, or substitution rules for a SKU or sub_category from recommendations.json.',
        parameters: jsonParameters({
          sku_or_subcat: { type: 'string' },
          kind: { type: 'string', enum: ['cross_sell', 'upsell', 'margin_substitution', 'all'] },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'recommendations_explain',
        description: 'Unpack a specific rec rule citation with methodology text.',
        parameters: jsonParameters({ citation: { type: 'string' } }, ['citation']),
      },
    },
    {
      type: 'function',
      function: {
        name: 'recommendations_top',
        description: 'Ranked opportunities across rules with filters.',
        parameters: jsonParameters({
          kind: { type: 'string' },
          by: { type: 'string' },
          top_n: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'wiki_lookup',
        description:
          'Index-first wiki discovery: ranks pages by title/tag match. Start here for “what do we know about X” synthesis questions.',
        parameters: jsonParameters({
          query: { type: 'string' },
          top_n: { type: 'number' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_view',
        description:
          'Load an extracted figure/diagram from kb_extracts for vision or detailed explanation.',
        parameters: jsonParameters({ path: { type: 'string' } }, ['path']),
      },
    },
    {
      type: 'function',
      function: {
        name: 'product_dossier',
        description:
          'Bundled fan-out for “everything about SKU / product line” (catalog + wiki + kb + recs + calls). Prefer composing catalog_get, wiki_lookup, kb_search, recommendations_for yourself unless you need one-shot latency; this runtime may return a stub until Oz-Demo-rx1 lands.',
        parameters: jsonParameters({ target: { type: 'string', description: 'SKU, product-line code, or line name.' } }, [
          'target',
        ]),
      },
    },
    {
      type: 'function',
      function: {
        name: 'compare',
        description:
          'Bundled multi-target comparison across catalog + wiki + optional kb_search. Prefer catalog_compare + wiki_lookup/wiki_read unless you need a packaged matrix; stub until Oz-Demo-6eb.',
        parameters: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Two or more SKUs, product lines, or entity slugs to compare.',
            },
            dimensions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional comparison axes; bundled handler may ignore when stubbed.',
            },
          },
          required: ['targets'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'wiki_compare',
        description:
          'Bundled wiki-only diff across multiple entity pages. Prefer wiki_read per page until Oz-Demo-6eb ships the composite.',
        parameters: {
          type: 'object',
          properties: {
            slugs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Wiki paths or slugs (e.g. entities/products/voyage).',
            },
          },
          required: ['slugs'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'drift_check',
        description:
          'Bundled inconsistency scan across catalog, wiki, documents, and calls. Compose primitives for now; full composite tracks Oz-Demo-coh.',
        parameters: jsonParameters({ target: { type: 'string', description: 'SKU or entity name.' } }, ['target']),
      },
    },
  ]
}

/** Same names as createOzToolSurface keys, in stable order for tests and logging. */
export const OZ_CHAT_TOOL_NAMES_ORDERED = ozChatOpenAiToolDefinitions().map((t) => t.function.name)
