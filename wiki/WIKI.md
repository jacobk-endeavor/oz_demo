# WIKI Contract (Track B Scaffold)

This file defines the minimum conventions for the Oz Demo wiki layer. Agents must read this file before writing or editing any wiki page.

## Layout

- `wiki/sources/` source-specific pages created by Ingest
- `wiki/entities/` durable entity pages maintained by Linker + Diff
- `wiki/concepts/` cross-source synthesis pages maintained by Diff + Curator
- `wiki/index.md` catalog of wiki pages, rebuilt by Index
- `wiki/log.md` append-only operational log
- `wiki/synthesis.md` top-level thesis maintained by Synthesizer
- `wiki/_drafts/` transient agent drafts (do not commit)
- `wiki/_lint/` lint reports
- `wiki/_archive/` superseded pages

## Page Types

Allowed `type` values:

- `source`
- `entity`
- `concept`
- `synthesis`

## Required Frontmatter

All committed pages must include:

```yaml
---
type: source | entity | concept | synthesis
slug: unique-slug
title: Human readable title
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_count: 0
related: []
tags: []
confidence: low | medium | high
---
```

Additional required fields by page kind:

- `source`: `source_id`, `doc_kind`
- `entity`: `entity_kind`
- `concept`: `concept_kind`
- `synthesis`: no extra required fields

Optional fields on `source` pages (from Track A ingest manifest when present):

- `brand` — string (or pipeline placeholder when unknown)
- `year` — number or string year label when known
- `product_line` — string product line name when known

## Citation Grammar

Every factual claim ends with at least one citation token:

- Documents/chunks: `[doc:<chunk_id>]`
- Calls: `[call:<chunk_id>]`
- Images: `[image:<path>]`
- Catalog records: `[catalog:sku=<sku>]`, `[catalog:line=<code>]`, `[catalog:sub=<code>]`
- Recommendations: `[recs:<kind>:<key>#<idx>]` or `[recs:method=<kind>]`
- Wiki references: `[[wiki:<slug>]]`

## Section Conventions

Use stable section names so Diff can patch by section instead of rewriting full pages.

Minimum body sections for `entity` and `concept` pages:

- `## Summary`
- `## Evidence`
- `## Open Questions`
- `## Mentioned in`

Use contradiction blocks instead of destructive rewrites:

```text
> CONTRADICTION (YYYY-MM-DD): prior claim X [doc:...] conflicts with newer claim Y [doc:...].
```

## Agent Boundaries

- Ingest writes only `sources/` and appends `log.md`
- Linker creates stubs and maintains `## Mentioned in`
- Diff edits existing entity/concept pages section-by-section
- Index rewrites `index.md` from frontmatter
- Synthesizer edits `synthesis.md` only
- Lint writes reports to `wiki/_lint/` only
- Schema (scaffold) writes schema-review reports to `wiki/_lint/` only; proposes `WIKI.md` + allowlist updates for human approval
- Curator proposes structural changes before applying

## Operational Notes

- Keep `_drafts/` out of commits (`wiki/_drafts/.gitkeep` only in scaffold)
- Prefer additive edits; preserve provenance and citations
- If confidence is `low`, include explicit uncertainty language in `## Summary`

## Automation modes

Human / agent trust defaults are documented in [track-b-wiki-layer.md §14](../docs/wiki-kb/track-b-wiki-layer.md#§14-human-workflow--trust). The fenced block below is parsed by wiki tooling (`wikiAutomationConfig.ts`). **`ingest_mode: threshold`** keeps Ingest (and Diff, which follows Ingest) **assisted** until `wiki_source_page_count` reaches `autonomous_after_sources`, then switches both to **autonomous**. Omit `ingest` and `diff` under `agents` to use that rule; set them explicitly to pin modes. Curator and Schema are always **assisted** in code regardless of overrides.

```yaml
# wiki-automation-config
ingest_mode: threshold
autonomous_after_sources: 50
agents:
  linker: autonomous
  index: autonomous
  synthesizer: autonomous
  lint: autonomous
  curator: assisted
  schema: assisted
```

Queue local extracts without a source page: `npx tsx scripts/wiki-ingest-queue.ts --repoRoot . --next` or `--all` (see script header).
