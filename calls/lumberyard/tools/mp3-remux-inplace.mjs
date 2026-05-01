/**
 * In-place re-encode to a well-formed MP3 (correct duration + seek) via ffmpeg.
 */
import { execFileSync } from 'node:child_process'
import { unlinkSync, renameSync } from 'node:fs'

/**
 * @param {string} inPath absolute path to .mp3
 */
export function remuxMp3InPlace(inPath) {
  const outTmp = `${inPath}.remuxing.mp3`
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inPath,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      outTmp,
    ],
    { stdio: 'inherit' },
  )
  unlinkSync(inPath)
  renameSync(outTmp, inPath)
}
