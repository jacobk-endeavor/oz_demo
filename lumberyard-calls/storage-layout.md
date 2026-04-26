# Storage layout (lumberyard call library)

## Intent

- **Transcripts** are the source of truth for what was “said” in the role-play.
- **Audio** is derived data for demos, RAG, or playback UIs; it can be wiped and rebuilt from scripts + API.
- **Manifest** (`call-library.json`) is the bridge for code that only needs JSON (paths, metadata) without parsing `.txt` files.

## `call-library.json` shape

- `version` — integer, bump if fields change.
- `generated` — ISO timestamp when the manifest was last written by the generator.
- `sourceRoot` — constant `"lumberyard-calls/"` (relative to repo root).
- `calls[]` — one entry per transcript/audio pair:
  - `id` — stable slug, e.g. `lumber-01-cedar-timbertech`
  - `title` — human title from the transcript header
  - `transcript` — path under `lumberyard-calls/`, e.g. `transcripts/01-cedar-timbertech.txt`
  - `audio` — path to MP3, or `null` if not generated
  - `tags` — topic strings: `competitor`, `purchase`, `product-preference`, etc.
  - `notable` — short bullets: competitor name, product named, order intent, etc. (for search/RAG)
  - `repPersona` / `customerPersona` — free-text from the `Title:` / `Notable` lines in the transcript

## Conventions

- Transcript filenames: `NN-short-slug.txt` with a leading sort index.
- One stitched MP3 per transcript: `audio/NN-short-slug.mp3` matching the stem of the `.txt` file.
- The generator updates `call-library.json` in place; treat it as **generated**—edit transcripts, then re-run the tool.

## Integration

- Ingest: read `call-library.json` to list available calls and resolve paths to transcript + audio.
- Rebuild: add or edit `transcripts/*.txt`, then run `node lumberyard-calls/tools/generate-audio.mjs`.
