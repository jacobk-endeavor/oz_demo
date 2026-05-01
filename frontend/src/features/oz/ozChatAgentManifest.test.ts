import { describe, expect, it } from 'vitest'
import { buildOzChatAgentManifest } from '../../../../backend/oz/ozChatAgentManifest'
import { createOzToolSurface } from '../../../../backend/oz/chatRuntime'

describe('ozChatAgentManifest', () => {
  it('returns contract version, prompt package, tools, and stable name ordering', () => {
    const m = buildOzChatAgentManifest()
    expect(m.contract_version).toMatch(/\d{4}-\d{2}/)
    expect(m.registry_prompt_version).toBeTruthy()
    expect(m.system_prompt).toContain(m.registry_prompt_version)
    expect(m.tools.length).toBeGreaterThan(10)
    expect(m.tool_names_ordered.length).toBe(m.tools.length)
    expect(m.tools.some((t) => t.function.name === 'product_dossier')).toBe(true)
    expect(new Set(m.tool_names_ordered).size).toBe(m.tool_names_ordered.length)
  })

  it('exposes Layer 3 bundled tools as explicit stubs on OzToolSurface', async () => {
    const surface = createOzToolSurface({ message: 'compare A and B' })
    const dossier = await surface.product_dossier({ target: 'DK35031021' })
    expect(dossier.status).toBe('stub')
    expect(dossier.bundled_tool).toBe('product_dossier')
    expect(dossier.tracking_issue).toBe('Oz-Demo-rx1')

    const cmp = await surface.compare({ targets: ['A', 'B'] })
    expect(cmp.bundled_tool).toBe('compare')
    expect(cmp.tracking_issue).toBe('Oz-Demo-6eb')

    const wiki = await surface.wiki_compare({ slugs: ['entities/products/voyage'] })
    expect(wiki.bundled_tool).toBe('wiki_compare')

    const drift = await surface.drift_check({ target: 'Voyage' })
    expect(drift.bundled_tool).toBe('drift_check')
    expect(drift.tracking_issue).toBe('Oz-Demo-coh')
  })
})
