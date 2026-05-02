import type { ComponentType } from 'react'
import {
  OzChartPanel,
  OzDataTablePanel,
  OzDocxOutlinePanel,
  OzInvoicePreviewPanel,
  OzJobCostRecapPanel,
  OzThreadDirectionPanel,
  OzUnsupportedPanelKind,
  type OzPanelRendererProps,
} from './ozPanelKindBodies'

/** Matches `<panel kind="…"/>` / `display_panel` registry — docs/code-sandbox-and-artifact-generation.md §6.1. */
export const OZ_PANEL_KINDS = [
  'table',
  'invoice_preview',
  'job_cost_recap',
  'chart',
  'docx_outline',
  'thread_direction',
] as const

export type OzPanelKind = (typeof OZ_PANEL_KINDS)[number]

export type { OzDisplayTableColumn, OzDisplayTableRow, OzPanelRendererProps } from './ozPanelKindBodies'

export const OZ_PANEL_COMPONENT_BY_KIND: Record<OzPanelKind, ComponentType<OzPanelRendererProps>> = {
  table: OzDataTablePanel,
  invoice_preview: OzInvoicePreviewPanel,
  job_cost_recap: OzJobCostRecapPanel,
  chart: OzChartPanel,
  docx_outline: OzDocxOutlinePanel,
  thread_direction: OzThreadDirectionPanel,
}

export function isOzPanelKind(kind: string): kind is OzPanelKind {
  return (OZ_PANEL_KINDS as readonly string[]).includes(kind)
}

/** Resolves the React renderer for a slide-out panel; unknown kinds get a safe fallback component (for tests / forward-compat). */
export function resolveOzPanelComponent(kind: string): ComponentType<OzPanelRendererProps> {
  if (isOzPanelKind(kind)) return OZ_PANEL_COMPONENT_BY_KIND[kind]
  return OzUnsupportedPanelKind
}
