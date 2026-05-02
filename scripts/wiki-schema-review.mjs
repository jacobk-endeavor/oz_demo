#!/usr/bin/env node
/**
 * Schema Agent scaffold: scan wiki markdown for YAML frontmatter keys, compare to
 * the contract in wiki/WIKI.md, and write wiki/_lint/<date>-schema-review.md.
 *
 * Cadence (human / CI reminder): every 50 ingested sources OR 90 days — see
 * docs/wiki-kb/track-b-wiki-layer.md §9 Schema Agent, Q&A §12.
 *
 * Keep DOCUMENTED_KEYS in sync with wiki/WIKI.md "Required Frontmatter" + kind-specific fields.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/** @type {Set<string>} */
const DOCUMENTED_KEYS = new Set([
  'type',
  'slug',
  'title',
  'created',
  'updated',
  'source_count',
  'related',
  'tags',
  'confidence',
  'source_id',
  'doc_kind',
  'entity_kind',
  'concept_kind',
  /** Optional on source pages — see wiki/WIKI.md */
  'brand',
  'year',
  'product_line',
])

function parseArgs(argv) {
  let repoRoot = process.cwd()
  let threshold = 5
  let outPath = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repoRoot') repoRoot = path.resolve(argv[++i] ?? '')
    else if (argv[i] === '--threshold') threshold = Number(argv[++i] ?? '5')
    else if (argv[i] === '--out') outPath = path.resolve(argv[++i] ?? '')
  }
  if (!Number.isFinite(threshold) || threshold < 1) {
    console.error('Invalid --threshold')
    process.exit(1)
  }
  return { repoRoot, threshold, outPath }
}

/**
 * @param {string} content
 * @returns {string[] | null}
 */
function extractFrontmatterKeys(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const fm = m[1]
  const keys = []
  for (const line of fm.split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const trimmed = line.trimStart()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (/^\s/.test(line)) continue
    const km = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/)
    if (km) keys.push(km[1])
  }
  return keys
}

async function walkMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '_drafts' || entry.name === '_lint') continue
      out.push(...(await walkMarkdownFiles(full)))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    out.push(full)
  }
  return out
}

function isoDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function main() {
  const { repoRoot, threshold, outPath: outArg } = parseArgs(process.argv.slice(2))
  const wikiRoot = path.join(repoRoot, 'wiki')
  const wikiContractPath = path.join(wikiRoot, 'WIKI.md')
  const lintDir = path.join(wikiRoot, '_lint')

  await fs.mkdir(lintDir, { recursive: true })

  const files = await walkMarkdownFiles(wikiRoot)
  /** @type {Map<string, number>} */
  const keyCounts = new Map()
  /** @type {Map<string, Set<string>>} */
  const keyFiles = new Map()
  let withFm = 0

  for (const file of files) {
    const rel = path.relative(repoRoot, file)
    const content = await fs.readFile(file, 'utf8')
    const keys = extractFrontmatterKeys(content)
    if (!keys) continue
    withFm++
    for (const k of keys) {
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1)
      let set = keyFiles.get(k)
      if (!set) {
        set = new Set()
        keyFiles.set(k, set)
      }
      set.add(rel)
    }
  }

  const sortedKeys = [...keyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const emergent = sortedKeys.filter(([k, n]) => !DOCUMENTED_KEYS.has(k) && n >= threshold)
  const undocumentedUsed = sortedKeys.filter(([k]) => !DOCUMENTED_KEYS.has(k))

  const outFile = outArg || path.join(lintDir, `${isoDate()}-schema-review.md`)

  const lines = []
  lines.push('# Schema review (automated)')
  lines.push('')
  lines.push(`- **Generated:** ${new Date().toISOString()}`)
  lines.push(`- **Repo root:** \`${repoRoot}\``)
  lines.push(`- **Cadence:** every **50** ingested sources **or** **90** days (whichever first); see \`docs/wiki-kb/track-b-wiki-layer.md\` §9 Schema Agent, Q&A §12.`)
  lines.push(`- **Emergent threshold:** ≥ **${threshold}** pages with the same frontmatter key not listed in \`wiki/WIKI.md\``)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Markdown files under \`wiki/\` (excluding \`_drafts/\`): **${files.length}**`)
  lines.push(`- Pages with YAML frontmatter: **${withFm}**`)
  lines.push(`- Distinct frontmatter keys observed: **${keyCounts.size}**`)
  lines.push(`- Emergent convention candidates (undocumented key, count ≥ ${threshold}): **${emergent.length}**`)
  lines.push('')
  lines.push('## Key frequency (all pages with frontmatter)')
  lines.push('')
  lines.push('| Key | Count | Documented in WIKI.md |')
  lines.push('| --- | ---: | --- |')
  for (const [k, n] of sortedKeys) {
    const doc = DOCUMENTED_KEYS.has(k) ? 'yes' : 'no'
    lines.push(`| \`${k}\` | ${n} | ${doc} |`)
  }
  lines.push('')
  lines.push('## Emergent candidates')
  lines.push('')
  if (emergent.length === 0) {
    lines.push(`*(None at ≥${threshold} pages. Lint-style “novel keys” report would list keys here when usage crosses the threshold.)*`)
  } else {
    for (const [k, n] of emergent) {
      const filesStr = [...(keyFiles.get(k) ?? [])].sort().join(', ')
      lines.push(`- **\`${k}\`** — ${n} pages: ${filesStr}`)
    }
  }
  lines.push('')
  lines.push('## Undocumented keys in use (any count)')
  lines.push('')
  if (undocumentedUsed.length === 0) {
    lines.push('*All observed keys appear in the contract.*')
  } else {
    for (const [k, n] of undocumentedUsed) {
      lines.push(`- \`${k}\` — ${n}`)
    }
  }
  lines.push('')
  lines.push('## WIKI.md vs current wiki (manual checklist)')
  lines.push('')
  lines.push('- **Contract file:** `wiki/WIKI.md` — canonical required fields match current source + synthesis pages (see key table above).')
  lines.push('- **Layout:** `wiki/WIKI.md` lists top-level dirs; repo includes scaffold `README.md` placeholders under entities/concepts without frontmatter — expected until Index/Linker populate.')
  lines.push('- **Slugs:** source pages use path-shaped slugs (e.g. `sources/<slug>`) as generated by ingest — consistent with “unique slug” wording.')
  lines.push('')
  lines.push('## Proposed WIKI.md updates (pending human approval)')
  lines.push('')
  if (emergent.length === 0) {
    lines.push(
      '1. **No emergent keys above threshold** — optional: tighten wording only if product owners want stricter typing for manifest-derived fields.',
    )
  } else {
    for (let i = 0; i < emergent.length; i++) {
      const [k, n] = emergent[i]
      lines.push(
        `${i + 1}. **Document optional field \`${k}\`** — appears on **${n}** pages; add to \`wiki/WIKI.md\` optional section with semantics (or stop emitting the key from ingest if unintended).`,
      )
    }
    lines.push(
      `${emergent.length + 1}. **When catalog / SKU / recommendation pages appear:** extend the contract per \`docs/wiki-kb/track-b-wiki-layer.md\` (e.g. \`product_line_code\`, \`catalog_refresh\`, \`created_reason\`, \`methodology_version\`).`,
    )
    lines.push(
      `${emergent.length + 2}. **Re-run this report** after 50-source / 90-day cadence.`,
    )
  }
  if (emergent.length === 0) {
    lines.push(
      '2. **When catalog / SKU / recommendation pages appear:** extend the contract with optional keys from `docs/wiki-kb/track-b-wiki-layer.md` (e.g. `product_line_code`, `catalog_refresh`, `created_reason` for SKU pages, `methodology_version` on recommendations methodology) — add only after keys appear in real pages.',
    )
    lines.push(
      '3. **Re-run this report** after bulk ingest milestones (50 sources) or on a 90-day timer; merge emergent candidates into `WIKI.md` when Lint would flag them.',
    )
  }
  lines.push('')
  lines.push(`---`)
  lines.push(`Contract keys checked (sync with \`wiki/WIKI.md\`): ${[...DOCUMENTED_KEYS].sort().join(', ')}.`)

  await fs.writeFile(outFile, lines.join('\n') + '\n', 'utf8')
  console.log(`Wrote ${path.relative(repoRoot, outFile)}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e))
  process.exit(1)
})
