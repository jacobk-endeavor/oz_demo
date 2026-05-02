import { describe, expect, it } from 'vitest'
import {
  TOOL_RESULT_CONTENT_CAP,
  TOOL_RESULT_CONTENT_CAP_SANDBOX,
  stripInlineFigureDataUrls,
  truncateForToolResult,
} from '../../../../backend/oz/toolResultTruncate'

describe('truncateForToolResult', () => {
  it('uses 80k cap for non-sandbox tools', () => {
    const payload = { x: 'y'.repeat(TOOL_RESULT_CONTENT_CAP + 10) }
    const out = truncateForToolResult(payload, 'wiki_grep')
    expect(out.endsWith('…[truncated]')).toBe(true)
    expect(out.length).toBe(TOOL_RESULT_CONTENT_CAP + '…[truncated]'.length)
  })

  it('uses 256k cap for run_python', () => {
    const payload = { x: 'y'.repeat(TOOL_RESULT_CONTENT_CAP_SANDBOX + 10) }
    const out = truncateForToolResult(payload, 'run_python')
    expect(out.endsWith('…[truncated]')).toBe(true)
    expect(out.length).toBe(TOOL_RESULT_CONTENT_CAP_SANDBOX + '…[truncated]'.length)
  })

  it('appends inline figures after truncation so they survive', () => {
    const fig =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const filler = 'z'.repeat(TOOL_RESULT_CONTENT_CAP_SANDBOX + 50)
    const payload = { stdout: filler + fig, ok: true }
    const out = truncateForToolResult(payload, 'run_python')
    expect(out.includes('…[truncated]')).toBe(true)
    expect(out.includes(fig)).toBe(true)
    expect(out.indexOf(fig)).toBeGreaterThan(out.indexOf('…[truncated]'))
  })

  it('does not strip figures from non-sandbox tools', () => {
    const fig = 'data:image/png;base64,QQ=='
    const payload = { preview: fig }
    const out = truncateForToolResult(payload, 'wiki_grep')
    expect(out).toBe(JSON.stringify(payload))
  })
})

describe('stripInlineFigureDataUrls', () => {
  it('replaces inline data URLs with placeholders', () => {
    const fig = 'data:image/jpeg;base64,/9j/4AAQ'
    const { stripped, figures } = stripInlineFigureDataUrls({ s: fig })
    expect(figures).toEqual([fig])
    expect(stripped).toEqual({ s: '__OZ_INLINE_FIGURE_0__' })
  })
})
