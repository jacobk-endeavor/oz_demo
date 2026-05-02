/**
 * Serialize tool results for LLM tool_result / tool message channels with size caps.
 * Sandbox-style tools (run_python) use a larger cap and preserve inline PNG/JPEG
 * data URLs by stripping them before truncation, then appending them after.
 */

export const TOOL_RESULT_CONTENT_CAP = 80_000
export const TOOL_RESULT_CONTENT_CAP_SANDBOX = 256 * 1024

/** Per docs/code-sandbox-and-artifact-generation.md §12.3 — inline base64 ceiling. */
const MAX_INLINE_FIGURE_CHARS = 1024 * 1024

const INLINE_DATA_URL_RE = /data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+/gi

const FIGURES_SEPARATOR = '\n__OZ_INLINE_FIGURES__\n'

function isSandboxClassTool(toolName: string): boolean {
  return toolName === 'run_python'
}

/**
 * Replace inline data URLs in strings with placeholders; collect figures (each ≤1MB)
 * for re-append after truncation.
 */
export function stripInlineFigureDataUrls(value: unknown): {
  stripped: unknown
  figures: string[]
} {
  const figures: string[] = []

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return v.replace(INLINE_DATA_URL_RE, (match) => {
        if (match.length > MAX_INLINE_FIGURE_CHARS) {
          return '[inline figure omitted: exceeds 1MB cap]'
        }
        const idx = figures.length
        figures.push(match)
        return `__OZ_INLINE_FIGURE_${idx}__`
      })
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        o[k] = walk(val)
      }
      return o
    }
    return v
  }

  return { stripped: walk(value), figures }
}

export function truncateForToolResult(value: unknown, toolName: string): string {
  try {
    const cap = isSandboxClassTool(toolName) ? TOOL_RESULT_CONTENT_CAP_SANDBOX : TOOL_RESULT_CONTENT_CAP

    if (!isSandboxClassTool(toolName)) {
      const text = JSON.stringify(value)
      return text.length > cap ? `${text.slice(0, cap)}…[truncated]` : text
    }

    const { stripped, figures } = stripInlineFigureDataUrls(value)
    let text = JSON.stringify(stripped)
    if (text.length > cap) {
      text = `${text.slice(0, cap)}…[truncated]`
    }
    if (figures.length > 0) {
      text += `${FIGURES_SEPARATOR}${figures.join('\n')}`
    }
    return text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `__serialization_error: ${msg}`
  }
}
