import { describe, expect, it } from 'vitest'
import {
  OZ_CHAT_SYSTEM_PROMPT,
  OZ_CHAT_SYSTEM_PROMPT_VERSION,
  OZ_CHAT_TOOL_NAMES_ORDERED,
  ozChatOpenAiToolDefinitions,
} from '../../../../backend/oz/ozChatToolRegistry'

describe('ozChatToolRegistry', () => {
  it('exports a versioned system prompt', () => {
    expect(OZ_CHAT_SYSTEM_PROMPT.length).toBeGreaterThan(80)
    expect(OZ_CHAT_SYSTEM_PROMPT).toContain(OZ_CHAT_SYSTEM_PROMPT_VERSION)
  })

  it('lists display tools in the ordered tool-name export', () => {
    expect(OZ_CHAT_TOOL_NAMES_ORDERED).toContain('display_table')
    expect(OZ_CHAT_TOOL_NAMES_ORDERED).toContain('display_panel')
    expect(OZ_CHAT_TOOL_NAMES_ORDERED).toEqual(
      ozChatOpenAiToolDefinitions().map((t) => t.function.name),
    )
  })

  it('defines one OpenAI-style entry per flat tool surface tool', () => {
    const defs = ozChatOpenAiToolDefinitions()
    const names = defs.map((d) => d.function.name)
    expect(names).toContain('kb_search')
    expect(names).toContain('wiki_lookup')
    expect(names).toContain('catalog_get')
    expect(names).toContain('search_transcripts')
    expect(names).toContain('product_dossier')
    expect(names).toContain('wiki_compare')
    expect(names).toContain('display_table')
    expect(names).toContain('display_panel')
    expect(new Set(names).size).toBe(names.length)
  })
})
