# calls/ — sales call dataset

Combined home for the two demo call corpora used by Oz. Both subfolders are independent data sources; the rest of the repo treats them as read-only inputs.

| Subfolder | What it is | Size | Tracked in git? |
| --- | --- | --- | --- |
| [lumberyard/](lumberyard/) | Hand-authored Russin scripts + ElevenLabs MP3s with a curated `call-library.json` manifest. Drives the Lumberyard activity table and competitor-intel UI. | 15 calls | Yes (audio gitignored) |
| [sauron/](sauron/) | LLM-generated bulk corpus (2000 stratified rep ↔ buyer transcripts) with Python build/QC scripts. Feeds the pgvector RAG index for chat. | 2000 calls | No (whole folder is gitignored) |

## How to interact with it

### Read transcripts directly
- **Lumberyard**: plain text in [lumberyard/transcripts/](lumberyard/transcripts/), one `.txt` per call. Format: `NAME [rep|customer]: ...`. The manifest [lumberyard/call-library.json](lumberyard/call-library.json) maps each transcript to its audio + tags.
- **Sauron**: a single JSON file [sauron/calls.json](sauron/calls.json). Each entry has `call_id`, `transcript` (newline-delimited turns), `scenario_tag`, `outcome_target`, and product/customer metadata. [sauron/calls_transcripts_only.json](sauron/calls_transcripts_only.json) is the slim variant the ingest script consumes.

### Use it from app code
- The Vite dev/preview server exposes:
  - `GET /api/oz/lumberyard-calls` → returns the Lumberyard manifest. Implementation: [frontend/vite.ozLumberyardApi.ts](../frontend/vite.ozLumberyardApi.ts) (reads from `calls/lumberyard/`).
  - `POST /api/oz/lumberyard-intel` → competitor-intel synthesis over the manifest (uses `OPENAI_API_KEY`, optional `BRAVE_SEARCH_API_KEY`).
  - RAG endpoints in [frontend/vite.ozRagCallsApi.ts](../frontend/vite.ozRagCallsApi.ts) → query Postgres `call_rag_chunks` table (populated from Sauron data).
- Frontend client: [frontend/src/features/lumberyard/lumberyardClient.ts](../frontend/src/features/lumberyard/lumberyardClient.ts).

### Regenerate / rebuild
- **Lumberyard audio** (after editing transcripts): `node calls/lumberyard/tools/generate-audio.mjs` (needs `ELEVENLABS_API_KEY`, voice IDs in `.env`). Refreshes `call-library.json` in place.
- **Lumberyard durations only** (no TTS): `node calls/lumberyard/tools/refresh-durations.mjs` (needs `ffprobe`).
- **Sauron transcripts**: `python calls/sauron/generate_transcripts.py` (needs `OPENROUTER_API_KEY`, see `calls/sauron/.env`).
- **Sauron → pgvector**: `python calls/sauron/scripts/ingest_calls_pgvector.py` (needs `DATABASE_URL` or `PG*` env vars). This is what populates the RAG index used by chat.

### Conventions
- Each call has a stable `id` / `call_id`. Don't renumber existing entries — append.
- Transcripts are the source of truth; audio and the manifest are derived. Never edit `call-library.json` by hand for fields the generator owns (paths, hashes, durations).
- `lumberyard/audio/` and the entire `sauron/` folder are gitignored. Treat them as locally rebuildable, not as committed artifacts.

## Where things live

```
calls/
├── lumberyard/
│   ├── transcripts/*.txt        source-of-truth scripts
│   ├── audio/*.mp3              generated MP3s (gitignored)
│   ├── call-library.json        manifest (paths, tags, durations)
│   ├── activity-mock.json       fake CRM activity for the UI
│   ├── synthetic-telemetry.json call-listening telemetry mock
│   ├── tools/                   audio generation + manifest refresh
│   ├── README.md                lumberyard-specific notes
│   └── storage-layout.md        manifest schema
└── sauron/                      (entire folder gitignored)
    ├── calls.json               full bulk corpus
    ├── calls_transcripts_only.json  slim variant for RAG ingest
    ├── buyers.json, products.json, identities.py  generation inputs
    ├── generate_transcripts.py, build_bulk_calls_manifest.py, audit_calls.py, transcript_qc.py  build/QC pipeline
    └── scripts/
        ├── ingest_calls_pgvector.py        loads transcripts → pgvector
        ├── rag_query_cli.py                CLI to query the index
        └── rebuild_call_metadata_pipeline.py  metadata refresh via OpenRouter
```
