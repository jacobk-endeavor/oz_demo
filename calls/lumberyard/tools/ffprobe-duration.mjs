import { execFileSync } from 'node:child_process'

/**
 * @param {string} filePath
 * @returns {number | null} duration in seconds
 */
export function ffprobeDurationSec(filePath) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8' },
    )
    const n = parseFloat(String(out).trim())
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n * 1000) / 1000
  } catch {
    return null
  }
}
