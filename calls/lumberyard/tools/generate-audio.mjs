/**
 * Load repo-root .env, read calls/lumberyard/transcripts/*.txt, synthesize
 * one MP3 per file (rep / customer lines use two different voices) via ElevenLabs,
 * stitch with ffmpeg, update call-library.json.
 *
 * Usage: from repo root: node calls/lumberyard/tools/generate-audio.mjs
 * Needs: Node 18+.
 * Optional: `ffmpeg` on PATH for clean concat; if missing, raw MP3 buffers are
 * concatenated (usually playable; tiny gaps can occur at joins).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs'
import { ffprobeDurationSec } from './ffprobe-duration.mjs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../../..')
const LUMBER_ROOT = join(REPO_ROOT, 'calls', 'lumberyard')
const TRANSCRIPTS = join(LUMBER_ROOT, 'transcripts')
const OUT_AUDIO = join(LUMBER_ROOT, 'audio')
const MANIFEST = join(LUMBER_ROOT, 'call-library.json')
const DEFAULT_CUSTOMER_VOICE = '21m00Tcm4TlvDq8ikWAM' // Rachel (public voice) if env unset

function loadEnvfile(path) {
  const out = {}
  if (!existsSync(path)) return out
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    out[key] = val
  }
  return out
}

const repLine = /^\s*(.+?)\s*\[rep\]\s*:\s*(.+?)\s*$/i
const cusLine = /^\s*(.+?)\s*\[customer\]\s*:\s*(.+?)\s*$/i

function parseTranscriptPath(filePath) {
  const name = basename(filePath, '.txt')
  const raw = readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const meta = { title: '', repPersona: '', customerPersona: '', notable: [], tags: [] }
  const dialogue = []
  for (const line of lines) {
    if (line.startsWith('#')) {
      const rest = line.replace(/^#\s*/, '').trim()
      const low = rest.toLowerCase()
      if (low.startsWith('title:')) meta.title = rest.replace(/^title:\s*/i, '').trim()
      else if (low.startsWith('rep:')) meta.repPersona = rest.replace(/^rep:\s*/i, '').trim()
      else if (low.startsWith('customer:')) meta.customerPersona = rest.replace(/^customer:\s*/i, '').trim()
      else if (low.startsWith('notable:')) meta.notable.push(rest.replace(/^notable:\s*/i, '').trim())
      else if (/^notable-?\d*:/i.test(rest)) {
        const colon = rest.indexOf(':')
        if (colon !== -1) meta.notable.push(rest.slice(colon + 1).trim())
      } else if (low.startsWith('tags:')) {
        meta.tags = rest
          .replace(/^tags:\s*/i, '')
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      }
      continue
    }
    if (!line.trim()) continue
    let m = line.match(repLine)
    if (m) {
      dialogue.push({ role: 'rep', name: m[1].trim(), text: m[2].trim() })
      continue
    }
    m = line.match(cusLine)
    if (m) {
      dialogue.push({ role: 'customer', name: m[1].trim(), text: m[2].trim() })
      continue
    }
    if (line.trim() && !line.trim().startsWith('#')) {
      throw new Error(`${filePath}: no [rep]/[customer] on line: ${line.slice(0, 80)}`)
    }
  }
  if (dialogue.length === 0) throw new Error(`${filePath}: no dialogue lines found`)
  return { name, meta, dialogue, raw }
}

async function ttsToMp3Buffer({ apiKey, voiceId, text, modelId }) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: modelId }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TTS ${res.status}: ${err}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function stitchMp3(concatListPath, outPath) {
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', outPath],
    { stdio: 'inherit' }
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const env = loadEnvfile(join(REPO_ROOT, '.env'))
  const apiKey = env.ELEVENLABS_API_KEY
  const voiceRep = env.ELEVENLABS_VOICE_ID
  const voiceCustomer = env.ELEVENLABS_VOICE_ID_CUSTOMER || DEFAULT_CUSTOMER_VOICE
  const modelId = env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY in .env (repo root)')
  if (!voiceRep) throw new Error('Missing ELEVENLABS_VOICE_ID in .env (rep voice)')

  const useFfmpeg = hasFfmpeg()
  if (!useFfmpeg) {
    console.warn('ffmpeg not on PATH: stitching via raw MP3 buffer concat (install ffmpeg for cleaner joins).')
  }

  mkdirSync(OUT_AUDIO, { recursive: true })

  const files = readdirSync(TRANSCRIPTS)
    .filter((f) => f.endsWith('.txt'))
    .sort()
  if (files.length === 0) throw new Error(`No .txt in ${TRANSCRIPTS}`)

  /** Keep callDate + productTags when re-running TTS (stable ids). */
  const preservedById = new Map()
  if (existsSync(MANIFEST)) {
    try {
      const prev = JSON.parse(readFileSync(MANIFEST, 'utf8'))
      for (const c of prev.calls ?? []) {
        preservedById.set(c.id, {
          callDate: c.callDate,
          productTags: c.productTags,
          source: c.source,
          location: c.location,
          customerName: c.customerName,
        })
      }
    } catch {
      // ignore
    }
  }

  const calls = []
  for (const f of files) {
    const tpath = join(TRANSCRIPTS, f)
    const { name, meta, dialogue } = parseTranscriptPath(tpath)
    const outMp3 = join(OUT_AUDIO, `${name}.mp3`)
    const tempDir = useFfmpeg ? mkdtempSync(join(tmpdir(), 'lumber-tts-')) : null
    const segments = []
    const bufParts = []
    const concatList = tempDir && join(tempDir, 'concat.txt')
    let idx = 0
    try {
      for (const turn of dialogue) {
        const voice = turn.role === 'rep' ? voiceRep : voiceCustomer
        const buffer = await ttsToMp3Buffer({
          apiKey,
          voiceId: voice,
          text: turn.text,
          modelId,
        })
        idx += 1
        bufParts.push(buffer)
        if (useFfmpeg) {
          const seg = join(tempDir, `s-${String(idx).padStart(3, '0')}.mp3`)
          writeFileSync(seg, buffer)
          segments.push(seg)
        }
        await sleep(450)
      }
      if (useFfmpeg && concatList) {
        const listBody = segments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
        writeFileSync(concatList, listBody, 'utf8')
        stitchMp3(concatList, outMp3)
      } else {
        writeFileSync(outMp3, Buffer.concat(bufParts))
      }
    } finally {
      if (tempDir) {
        try {
          rmSync(tempDir, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
    }
    const id = `lumber-${name}`
    const h = createHash('sha256').update(readFileSync(tpath, 'utf8'), 'utf8').digest('hex')
    const durationSec = existsSync(outMp3) ? ffprobeDurationSec(outMp3) : null
    const keep = preservedById.get(id) || {}
    const productTags = Array.isArray(keep.productTags) ? keep.productTags : []
    calls.push({
      id,
      title: meta.title,
      tags: meta.tags,
      notable: meta.notable,
      repPersona: meta.repPersona,
      customerPersona: meta.customerPersona,
      transcript: `calls/lumberyard/transcripts/${f}`,
      audio: `calls/lumberyard/audio/${name}.mp3`,
      contentSha256: h,
      ...(durationSec != null && durationSec > 0 ? { durationSec } : {}),
      ...(keep.callDate ? { callDate: keep.callDate } : {}),
      ...(keep.source ? { source: keep.source } : {}),
      ...(keep.location != null && String(keep.location).trim() !== '' ? { location: keep.location } : {}),
      ...(keep.customerName != null && String(keep.customerName).trim() !== '' ? { customerName: keep.customerName } : {}),
      productTags,
    })
  }

  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    sourceRoot: 'calls/lumberyard/',
    stitch: useFfmpeg ? 'ffmpeg-concat' : 'mp3-buffer-concat',
    defaultCustomerVoice: voiceCustomer === DEFAULT_CUSTOMER_VOICE,
    modelId,
    calls,
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${calls.length} MP3(s) to ${OUT_AUDIO} and ${MANIFEST}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
