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
- Curator proposes structural changes before applying

## Operational Notes

- Keep `_drafts/` out of commits (`wiki/_drafts/.gitkeep` only in scaffold)
- Prefer additive edits; preserve provenance and citations
- If confidence is `low`, include explicit uncertainty language in `## Summary`
