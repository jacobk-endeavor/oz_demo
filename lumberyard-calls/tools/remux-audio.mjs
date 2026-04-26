/**
 * Re-encode MP3s in lumberyard-calls/audio with ffmpeg so metadata and
 * seek tables match the full stream. Raw buffer-concatenated files often
 * play end-to-end but the browser reports a short duration and clamps
 * `currentTime`, so the scrub bar cannot reach the real middle of a call.
 *
 * Requires ffmpeg on PATH. Run from repo root:
 *   node lumberyard-calls/tools/remux-audio.mjs
 * Then: node lumberyard-calls/tools/refresh-durations.mjs
 */
import { readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { remuxMp3InPlace } from './mp3-remux-inplace.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../..')
const AUDIO = join(REPO_ROOT, 'lumberyard-calls', 'audio')

function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function main() {
  if (!hasFfmpeg()) {
    console.error('ffmpeg is required on PATH to remux audio.')
    process.exit(1)
  }
  if (!existsSync(AUDIO)) {
    console.error(`Audio directory not found: ${AUDIO}`)
    process.exit(1)
  }
  const files = readdirSync(AUDIO).filter((f) => f.endsWith('.mp3')).sort()
  for (const f of files) {
    const p = join(AUDIO, f)
    console.log('Remuxing', f)
    remuxMp3InPlace(p)
  }
  console.log(`Remuxed ${files.length} file(s) in ${AUDIO}`)
}

main()
