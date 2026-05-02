import { describe, expect, it } from 'vitest'
import {
  OZ_PANEL_COMPONENT_BY_KIND,
  OZ_PANEL_KINDS,
  isOzPanelKind,
  resolveOzPanelComponent,
} from './panelRegistry'
import {
  OzDataTablePanel,
  OzUnsupportedPanelKind,
} from './ozPanelKindBodies'

describe('panelRegistry', () => {
  it('lists every kind exactly once in OZ_PANEL_KINDS', () => {
    expect(new Set(OZ_PANEL_KINDS).size).toBe(OZ_PANEL_KINDS.length)
  })

  it('maps each declared kind to a component', () => {
    for (const kind of OZ_PANEL_KINDS) {
      expect(OZ_PANEL_COMPONENT_BY_KIND[kind]).toBeTruthy()
      expect(resolveOzPanelComponent(kind)).toBe(OZ_PANEL_COMPONENT_BY_KIND[kind])
    }
  })

  it('isOzPanelKind recognizes registry strings only', () => {
    expect(isOzPanelKind('table')).toBe(true)
    expect(isOzPanelKind('invoice_preview')).toBe(true)
    expect(isOzPanelKind('not_registered')).toBe(false)
  })

  it('falls back to OzUnsupportedPanelKind for unknown kinds', () => {
    expect(resolveOzPanelComponent('totally_unknown')).toBe(OzUnsupportedPanelKind)
    expect(resolveOzPanelComponent('table')).toBe(OzDataTablePanel)
  })
})
