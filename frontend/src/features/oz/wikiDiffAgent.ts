export type DiffRequest = {
  page: string
  section_name: string
  current_section_text: string
  proposed_change: string
  contradiction?: {
    prior_claim: string
    new_claim: string
    date?: string
  }
}

export type DiffResult = {
  new_section_text: string
  frontmatter_updates: Record<string, string | number>
}

function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  if (!markdown.startsWith('---\n')) return { frontmatter: '', body: markdown }
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return { frontmatter: '', body: markdown }
  const frontmatter = markdown.slice(4, end)
  const body = markdown.slice(end + 5)
  return { frontmatter, body }
}

function updateFrontmatterValue(frontmatter: string, key: string, nextValue: string): string {
  const lines = frontmatter.length > 0 ? frontmatter.split('\n') : []
  const prefix = `${key}:`
  const index = lines.findIndex((line) => line.trimStart().startsWith(prefix))
  if (index >= 0) {
    lines[index] = `${key}: ${nextValue}`
  } else {
    lines.push(`${key}: ${nextValue}`)
  }
  return lines.join('\n')
}

function readFrontmatterInt(frontmatter: string, key: string): number | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'm'))
  if (match?.[1] == null) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isInteger(value) ? value : null
}

function extractSection(body: string, sectionName: string): { start: number; end: number; sectionText: string } | null {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionHeader = new RegExp(`^##\\s+${escaped}\\s*$`, 'm')
  const match = sectionHeader.exec(body)
  if (match == null || match.index < 0) return null
  const start = match.index
  const rest = body.slice(start + match[0].length)
  const nextMatch = /\n##\s+.+$/m.exec(rest)
  const end = nextMatch == null ? body.length : start + match[0].length + nextMatch.index + 1
  return { start, end, sectionText: body.slice(start, end).trimEnd() }
}

function contradictionBlock(input: { prior_claim: string; new_claim: string; date?: string }): string {
  const date = input.date ?? new Date().toISOString().slice(0, 10)
  return `> CONTRADICTION (${date}): prior claim ${input.prior_claim} conflicts with newer claim ${input.new_claim}.`
}

export function applySectionLockedDiff(request: DiffRequest): DiffResult {
  const sectionHeader = `## ${request.section_name}`
  const current = request.current_section_text.trim()
  const proposed = request.proposed_change.trim()
  const updatedSectionBody =
    request.contradiction == null
      ? `${proposed}\n`
      : `${current}\n\n${contradictionBlock(request.contradiction)}\n`
  const newSectionText = `${sectionHeader}\n${updatedSectionBody}`.trimEnd()

  return {
    new_section_text: newSectionText,
    frontmatter_updates: {
      updated: new Date().toISOString().slice(0, 10),
      source_count_delta: 1,
    },
  }
}

export function applyDiffToPage(pageMarkdown: string, request: DiffRequest): string {
  const { frontmatter, body } = splitFrontmatter(pageMarkdown)
  const section = extractSection(body, request.section_name)
  if (section == null) {
    throw new Error(`section not found: ${request.section_name}`)
  }
  const diff = applySectionLockedDiff(request)
  const mergedBody = `${body.slice(0, section.start)}${diff.new_section_text}\n${body.slice(section.end).replace(/^\n*/, '')}`
  const existingSourceCount = readFrontmatterInt(frontmatter, 'source_count') ?? 0
  const nextSourceCount = existingSourceCount + 1
  const nextDate = String(diff.frontmatter_updates.updated)
  let mergedFrontmatter = frontmatter
  mergedFrontmatter = updateFrontmatterValue(mergedFrontmatter, 'updated', nextDate)
  mergedFrontmatter = updateFrontmatterValue(mergedFrontmatter, 'source_count', String(nextSourceCount))
  return `---\n${mergedFrontmatter}\n---\n${mergedBody}`
}
