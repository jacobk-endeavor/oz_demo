/**
 * Nightly-style maintenance: HEAD Spaces for recent oz_artifacts rows and tombstone missing objects.
 * Requires DATABASE_URL and DO_SPACES_* (same as artifact uploads). See backend/oz/artifactRegistry.ts.
 *
 * Usage:
 *   npx tsx scripts/repair-oz-artifacts.ts [--days 7]
 */
import process from 'node:process'
import { runOzArtifactRepairJob, getOzArtifactsDb } from '../backend/oz/artifactRegistry'
import { tryCreateSpacesArtifactClientFromEnv } from '../backend/oz/artifactStorage'

function readEnv(): Record<string, string> {
  return process.env as Record<string, string>
}

function parseArgs(argv: string[]): { days: number } {
  let days = 7
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--days') days = Number(argv[++i] ?? '7')
  }
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    console.error('--days must be between 1 and 365')
    process.exit(1)
  }
  return { days }
}

async function main(): Promise<void> {
  const { days } = parseArgs(process.argv.slice(2))
  const db = getOzArtifactsDb(readEnv)
  if (!db) {
    console.error('repair-oz-artifacts: DATABASE_URL is not set')
    process.exit(1)
  }
  const spaces = tryCreateSpacesArtifactClientFromEnv()
  if (!spaces) {
    console.error('repair-oz-artifacts: DO Spaces env vars incomplete (see loadSpacesArtifactEnv)')
    process.exit(1)
  }

  const result = await runOzArtifactRepairJob(db, spaces, { lookbackDays: days })
  console.log(JSON.stringify({ ok: true, lookbackDays: days, ...result }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
