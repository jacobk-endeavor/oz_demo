/**
 * Fills in durationSec (ffprobe) for each call in call-library.json without
 * re-running TTS. Run from repo root: node calls/lumberyard/tools/refresh-durations.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffprobeDurationSec } from './ffprobe-duration.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../../..')
const MANIFEST = join(REPO_ROOT, 'calls', 'lumberyard', 'call-library.json')

const raw = JSON.parse(readFileSync(MANIFEST, 'utf8'))
raw.calls = raw.calls.map((c) => {
  if (!c.audio) return c
  const rel = c.audio.replace(/^calls\/lumberyard\//, 'calls/lumberyard/')
  const abs = join(REPO_ROOT, rel)
  if (!existsSync(abs)) return c
  const d = ffprobeDurationSec(abs)
  if (d == null || d <= 0) return c
  return { ...c, durationSec: d }
})
writeFileSync(MANIFEST, JSON.stringify(raw, null, 2) + '\n', 'utf8')
console.log(`Updated durationSec in ${MANIFEST} (${raw.calls.length} calls)`)
