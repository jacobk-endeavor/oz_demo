/**
 * CLI: `/wiki ingest --next` / `--all` — process kb_extracts bundles that do not yet have a wiki source page.
 * Uses automation modes from wiki/WIKI.md (`wikiAutomationConfig.ts`). Spec: docs/wiki-kb/track-b-wiki-layer.md §14.
 *
 * Usage:
 *   npx tsx scripts/wiki-ingest-queue.ts --repoRoot <path> [--next | --all] [--dry-run]
 */
import process from 'node:process'
import { runIngestAgentScaffold } from '../frontend/src/features/oz/wikiIngestAgent'
import {
  listPendingIngestSourceIds,
  resolveWikiAutomationConfig,
} from '../frontend/src/features/oz/wikiAutomationConfig'

function parseArgs(argv: string[]): {
  repoRoot: string
  next: boolean
  all: boolean
  dryRun: boolean
} {
  let repoRoot = ''
  let next = false
  let all = false
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repoRoot') repoRoot = argv[++i] ?? ''
    else if (a === '--next') next = true
    else if (a === '--all') all = true
    else if (a === '--dry-run') dryRun = true
  }
  if (!repoRoot) {
    console.error('Usage: --repoRoot <path> [--next | --all] [--dry-run]')
    process.exit(1)
  }
  if (next === all) {
    console.error('Exactly one of --next or --all is required.')
    process.exit(1)
  }
  return { repoRoot, next, all, dryRun }
}

async function main() {
  const { repoRoot, next, all, dryRun } = parseArgs(process.argv.slice(2))
  const { resolved, warnings } = await resolveWikiAutomationConfig(repoRoot)
  for (const w of warnings) {
    console.error(`[wiki automation] ${w}`)
  }

  const pending = await listPendingIngestSourceIds(repoRoot)
  const line = JSON.stringify({
    ok: true,
    automation: {
      ingest_mode: resolved.ingest_mode,
      autonomous_after_sources: resolved.autonomous_after_sources,
      wiki_source_page_count: resolved.wiki_source_page_count,
      agents: resolved.agents,
    },
    pending_count: pending.length,
    pending,
  })
  console.log(line)

  const toRun = next ? pending.slice(0, 1) : pending
  if (toRun.length === 0) {
    return
  }
  if (dryRun) {
    console.log(
      JSON.stringify({
        ok: true,
        dry_run: true,
        would_run: toRun,
      }),
    )
    return
  }

  for (const sourceId of toRun) {
    const result = await runIngestAgentScaffold({
      repoRoot,
      event: {
        event_version: 1,
        event: 'kb.ingested',
        source_id: sourceId,
      },
    })
    console.log(
      JSON.stringify({
        ok: true,
        source_id: sourceId,
        sourcePagePath: result.sourcePagePath,
        slug: result.slug,
        bootstrappedWikiPaths: result.bootstrappedWikiPaths,
      }),
    )
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e))
  process.exit(1)
})
