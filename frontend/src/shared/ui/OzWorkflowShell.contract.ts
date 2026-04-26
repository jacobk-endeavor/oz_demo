import type { ComponentType, SVGProps } from 'react'
import {
  ClockIcon,
  FieldAppIcon,
  FileStackIcon,
  HomeIcon,
  KnowledgeBaseIcon,
  LogLinesIcon,
  SearchIcon,
  TableIcon,
} from './icons'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export type OzWorkspaceNavId =
  | 'field-app'
  | 'tables'
  | 'files'
  | 'knowledge-base'
  | 'scheduled-tasks'
  | 'logs'

/** Prototype: deep-link a Field App mobile voice workflow; remove when product nav changes. */
export type FieldMobileNavId =
  | 'field-mw--customer-interactions'
  | 'field-mw--product-recommend'
  | 'field-mw--upsell-cross-sell'
  | 'field-mw--background-quote'
  | 'field-mw--prospect-notes'

export type OzWorkflowNavId =
  | 'oz'
  | 'search'
  | OzWorkspaceNavId
  | FieldMobileNavId
  | 'nebula'
  | 'field-notes'
  | 'dashboards'
  | 'quotes-ready'
  | 'quote-automation'
  | 'lead-generation'
  | 'background-agents'
  | 'help'
  | 'settings'

/** Small square in the Workflows list — matches sim.ai / “superark” style swatches. */
export type WorkflowAccent = 'zinc' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'cyan'

export const workflowAccentClass: Record<WorkflowAccent, string> = {
  zinc: 'bg-zinc-400',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
}

export interface OzWorkflowNavItem {
  id: Exclude<
    OzWorkflowNavId,
    'oz' | 'search' | OzWorkspaceNavId | FieldMobileNavId | 'help' | 'settings'
  >
  label: string
  accent: WorkflowAccent
  /** Shown in collapsed sidebar; defaults from accent. */
  accentClass?: string
}

/**
 * Nebula / CRM-style workflows. Each entry is a routable surface; the sidebar
 * shows a color swatch (like sim.ai’s workflow list and the Superark reference).
 */
export const workflowNavItems: readonly OzWorkflowNavItem[] = [
  { id: 'nebula', label: 'Overview', accent: 'zinc' },
  { id: 'field-notes', label: 'Field notes', accent: 'emerald' },
  { id: 'quotes-ready', label: 'Quotes Ready for Review', accent: 'rose' },
  { id: 'dashboards', label: 'Dashboards', accent: 'sky' },
  { id: 'background-agents', label: 'Background agents', accent: 'violet' },
] as const

export interface OzWorkspaceNavItem {
  id: OzWorkspaceNavId
  label: string
  icon: IconComponent
}

export const workspaceNavItems: readonly OzWorkspaceNavItem[] = [
  { id: 'field-app', label: 'Field App', icon: FieldAppIcon },
  { id: 'tables', label: 'Tables', icon: TableIcon },
  { id: 'files', label: 'Files', icon: FileStackIcon },
  { id: 'knowledge-base', label: 'Knowledge Base', icon: KnowledgeBaseIcon },
  { id: 'scheduled-tasks', label: 'Scheduled Tasks', icon: ClockIcon },
  { id: 'logs', label: 'Logs', icon: LogLinesIcon },
] as const

export const topNavItems: ReadonlyArray<{ id: 'oz' | 'search'; label: string; icon: IconComponent }> =
  [
    { id: 'oz', label: 'Home', icon: HomeIcon },
    { id: 'search', label: 'Search', icon: SearchIcon },
  ]

/** @deprecated List kept for any external references; prefer workflowNavItems + workspaceNavItems. */
export const ozWorkflowNavItems: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'oz', label: 'Oz' },
  ...workflowNavItems.map((w) => ({ id: w.id, label: w.label })),
  ...workspaceNavItems.map((w) => ({ id: w.id, label: w.label })),
] as const

/**
 * @deprecated Accordion groups removed in favor of Workspace + Workflows sections.
 * Exported so older imports do not break; `navGroups` is empty.
 */
export interface OzNavGroup {
  id: string
  label?: string
  icon?: IconComponent
  hubPageId: string
  items: { id: string; label: string; icon?: IconComponent }[]
}

export const navGroups: OzNavGroup[] = []

/** Kept for compatibility; the new shell does not use accordion groups. */
export function navGroupIdForPage(_activePage: string): string | null {
  return null
}

const workflowIdSet = new Set(workflowNavItems.map((w) => w.id))

export function isWorkflowPage(page: string): boolean {
  return workflowIdSet.has(page as (typeof workflowNavItems)[number]['id'])
}

export function workflowItemForPage(page: string): OzWorkflowNavItem | undefined {
  return workflowNavItems.find((w) => w.id === page)
}

export type OzNavItem = {
  id: string
  label: string
  icon?: IconComponent
}
