/**
 * CLI: after ingest_kb.py writes kb_extracts/<source_id>/, create wiki source page + log line.
 * Invoked from backend/oz/viteKbIngestApi.ts (tsx).
 */
import process from 'node:process'
import { runIngestAgentScaffold } from '../frontend/src/features/oz/wikiIngestAgent'

function parseArgs(argv: string[]): { repoRoot: string; sourceId: string } {
  let repoRoot = ''
  let sourceId = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repoRoot') repoRoot = argv[++i] ?? ''
    else if (argv[i] === '--sourceId') sourceId = argv[++i] ?? ''
  }
  if (!repoRoot || !sourceId) {
    console.error('Usage: --repoRoot <path> --sourceId <12-char id>')
    process.exit(1)
  }
  return { repoRoot, sourceId }
}

async function main() {
  const { repoRoot, sourceId } = parseArgs(process.argv.slice(2))
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
      sourcePagePath: result.sourcePagePath,
      slug: result.slug,
      bootstrappedWikiPaths: result.bootstrappedWikiPaths,
    }),
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e))
  process.exit(1)
})
