# Lumberyard call library (demo / voice pipeline)

This folder is the **on-disk “storage”** for sample sales rep ↔ customer conversations: plain-text transcripts, generated MP3s, and a single manifest the rest of the app or pipelines can read.

## Layout

| Path | Purpose |
| --- | --- |
| `transcripts/*.txt` | Source scripts. Lines use `NAME [rep]: ...` or `NAME [customer]: ...` (see any file for examples). |
| `audio/<slug>.mp3` | Stitched two-voice audio produced by the generator (gitignored; regenerate locally). |
| `tools/generate-audio.mjs` | Loads repo-root `.env`, calls ElevenLabs TTS per line, then `ffmpeg` to concatenate. |
| `call-library.json` | Manifest: ids, files, tags, and paths for downstream use. |
| `storage-layout.md` | Short schema / integration notes. |

## Environment

From the repo root `.env` (see `.env.example`):

- `ELEVENLABS_API_KEY` — required.
- `ELEVENLABS_VOICE_ID` — rep voice.
- `ELEVENLABS_VOICE_ID_CUSTOMER` — customer voice (add if missing; see `.env.example`).
- `ELEVENLABS_MODEL_ID` — defaults to `eleven_multilingual_v2`.
- In the app dev server, **`GET /api/oz/lumberyard-calls`** and **`POST /api/oz/lumberyard-intel`** (see `frontend/vite.ozLumberyardApi.ts`) use **`OPENAI_API_KEY`**. For live web search on competitor websites, set **`BRAVE_SEARCH_API_KEY`** (optional).

## Generate audio

Requires **Node 18+**. **ffmpeg** is optional: if present on `PATH`, output is concatenated with `ffmpeg` for cleaner joins; otherwise the tool joins raw MP3 buffers (usually fine for demos).

```bash
cd /path/to/Oz-Demo
node calls/lumberyard/tools/generate-audio.mjs
```

This reads every `transcripts/*.txt`, writes `audio/<slug>.mp3` (gitignored), and rewrites `call-library.json` with timestamps, a `stitch` field, and file paths.

## Notes

- Do not commit real API keys; keep `.env` local and out of VCS.
- If generation fails, check `xi-api-key`, voice IDs, and network; the script pauses briefly between API calls to reduce rate limiting.
