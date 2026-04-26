import type { FieldMobileNavId } from '../../shared/ui/OzWorkflowShell.contract'
import type { FieldMobileWorkflowId } from './fieldMobileWorkflows'

export interface FieldAppSidebarNavItem {
  id: FieldMobileNavId
  label: string
  workflowId: FieldMobileWorkflowId
}

/** Intentionally empty: mobile workflow routes are not shown in the sidebar. */
export const fieldMobileNavItems: readonly FieldAppSidebarNavItem[] = []

export function isFieldMobileNavId(id: string): id is FieldMobileNavId {
  return fieldMobileNavItems.some((e) => e.id === id)
}

export function fieldWorkflowIdForPage(id: FieldMobileNavId): FieldMobileWorkflowId {
  const found = fieldMobileNavItems.find((e) => e.id === id)
  if (!found) {
    throw new Error(`fieldWorkflowIdForPage: no sidebar entry for ${id}`)
  }
  return found.workflowId
}
