---
type: source
slug: "sources/2023-azek-deckorators-color-comparison-u-s-11-21-2022-7110ce9ef4a1"
title: "2023 Azek-Deckorators Color Comparison U.S. 11.21.2022"
created: 2026-05-01
updated: 2026-05-01
source_count: 1
related: []
tags: ["visual-catalog", "azek", "2023", "deckorators", "ufp", "harvest-collection", "legacy-collection", "picture-frame-board", "prime", "reserve-collection", "terrain-collection", "vault", "venture", "vintage-collection", "vista", "voyage"]
confidence: medium
source_id: 7110ce9ef4a1
doc_kind: visual-catalog
brand: "AZEK"
year: 2023
---

## Summary
- Playbook-guided ingest scaffold. Primary citation: [doc:7110ce9ef4a1_p001_00000]

## Detected Entities
- **Brands:** AZEK, Deckorators, UFP
- **Product lines:** Harvest Collection, Legacy Collection, Picture Frame Board, Prime+, Reserve Collection, Terrain Collection, Vault, Venture, Vintage Collection, Vista, Voyage

## Color Equivalence Pairs
- **VENTURE DECKING** → Azek Prime+ Collection Sea Salt Gray or Reserve Collection Driftwood
- **COMPARISON - AZEK** → Vintage Collection® Coastline; Legacy Collection Ashwood; Reserve Collection Storm

## Extracted Excerpts
### page=1

> VENTURE DECKING
> Compare to:
> Azek Prime+
> Collection Sea
> Salt Gray or
> Reserve Collection
> Driftwood
> Compare to:
> Azek Prime+
> Collection Coconut
> Husk or Azek Legacy
> Collection Pecan
> SANDBARSALTWATER
> VISTA DECKING
> IRONWOODSILVERWOODDRIFTWOOD DUNEWOOD
> PICTURE FRAME BOARD
> DARK SLATE
> VAULT DECKING
> VOYAGE DECKING
> COSTATUNDRASIERRA MESA
> MESQUITEDUSK
> KHAYA
>  SEDONA
> ©2022 UFP Retail Solutions, LLC. All rights reserved. Deckorators is a registered trademark of Deckorators, Inc.  10738_11/22
> DECKORATORS.COM
> DECKING COLOR
> COMPARISON - AZEK
> Compare to:
> Vintage
> Collection®
> Coastline;
> Legacy Collection
> Ashwood; Reserve
> Collection Storm
> Gray
> Compare to:
> Vintage
> Collection®
> Coastline;
> Legacy Collection
> Ashwood; Reserve
> Collection
> Driftwood
> Compare to:
> Vintage
> Collection®
> Weathered Teak;
> Legacy Collection
> Tigerwood;
> Reserve Collection
> Antique Leather™
> Compare to:
> Vintage
> Collection®
> Mahogany or
> Cypress; Legacy
> Collection Pecan
> Compare to:
> Vintage
> Collection®
> English Walnut or
> Dark Hickory;
> Legacy Collection
> Mocha; Reserve
> Collection Dark
> Roast®
> Compare to:
> Vintage
> Collection®
> Weathered Teak;
> Legacy Collection
> Tigerwood;
> Reserve Collection
> Antique Leather™
> Compare to:
> Legacy Collection
> Ashwood;…

[doc:7110ce9ef4a1_p001_00000]

## Playbook: visual-catalog
- **mandatory_multimodal_vision: true**
- **Multimodal:** vision pass **mandatory** — text extract is sparse.
- **Per page:** caption swatches (color name, tone, brand-equivalence hints).
- **Linker targets:** `entities/products/unknown` Colors table; `concepts/color-equivalence/<family>`.
- **Citations:** mix `[doc:<chunk_id>]` with `[image:<source_id>/img/page-<n>.png]`.
## Near-duplicate / supersession
- No explicit `supersedes` hint on this ingest event.
- No near-duplicate registry hints on this ingest event.

## Classification Check
- none

## Candidate Links
- To be populated by Linker Agent based on this source draft.
