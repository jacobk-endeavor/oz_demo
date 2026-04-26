import type { FieldMobileNavId } from '../../shared/ui/OzWorkflowShell.contract'
import { FIELD_MOBILE_WORKFLOWS, type FieldMobileWorkflowId } from './fieldMobileWorkflows'

export interface FieldAppSidebarNavItem {
  id: FieldMobileNavId
  label: string
  workflowId: FieldMobileWorkflowId
}

/**
 * Prototype: each entry is a real route in the left nav. Remove when you ship
 * integrated routing. Labels stay in sync with `fieldMobileWorkflows.ts` short
 * titles by construction.
 */
export const fieldMobileNavItems: readonly FieldAppSidebarNavItem[] = FIELD_MOBILE_WORKFLOWS.map(
  (w) => ({
    id: `field-mw--${w.id}` as FieldMobileNavId,
    label: w.shortTitle,
    workflowId: w.id,
  }),
)

export function isFieldMobileNavId(id: string): id is FieldMobileNavId {
  return fieldMobileNavItems.some((e) => e.id === id)
}

export function fieldWorkflowIdForPage(id: FieldMobileNavId): FieldMobileWorkflowId {
  return fieldMobileNavItems.find((e) => e.id === id)!.workflowId
}
