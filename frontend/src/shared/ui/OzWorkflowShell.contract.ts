import type { ComponentType, SVGProps } from 'react'
import {
  CallsIcon,
  DashboardIcon,
  LeadIcon,
  NebulaIcon,
  NotebookIcon,
  QuoteIcon,
  ReportIcon,
  SparkleIcon,
} from './icons'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

/**
 * Sidebar groups follow the Ramp pattern:
 * - When a group has no `label` and a single item, it renders as a flat
 *   top-level entry (like `Oz` or `Nebula` in this app, or `Vendors` in Ramp).
 * - When a group has a `label`, it renders as a labeled section. The header
 *   shows the icon + label. Sub-items render below. When the active page is
 *   inside the group, the entire group gets a soft zinc-100 wrapper card and
 *   the active sub-item gets a white card with a subtle shadow.
 */
export interface OzNavGroup {
  id: string
  label?: string
  /** Group-level icon shown next to the label header. */
  icon?: IconComponent
  items: OzNavItem[]
}

export interface OzNavItem {
  id: string
  label: string
  icon: IconComponent
}

export const ozWorkflowNavItems: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'oz', label: 'Oz' },
  { id: 'nebula', label: 'Nebula' },
  { id: 'field-notes', label: 'Field Notes' },
  { id: 'call-mining', label: 'Call Mining' },
  { id: 'dashboards', label: 'Dashboards' },
  { id: 'quote-automation', label: 'Quote Automation' },
  { id: 'lead-generation', label: 'Lead Generation' },
  { id: 'reports', label: 'Reports' },
] as const

export type OzWorkflowNavId =
  | 'oz'
  | 'nebula'
  | 'field-notes'
  | 'call-mining'
  | 'dashboards'
  | 'quote-automation'
  | 'lead-generation'
  | 'reports'

export const navGroups: OzNavGroup[] = [
  {
    id: 'oz',
    items: [{ id: 'oz', label: 'Oz', icon: SparkleIcon }],
  },
  {
    id: 'nebula',
    items: [{ id: 'nebula', label: 'Nebula', icon: NebulaIcon }],
  },
  {
    id: 'workflows',
    label: 'Workflows',
    icon: DashboardIcon,
    items: [
      { id: 'field-notes', label: 'Field Notes', icon: NotebookIcon },
      { id: 'call-mining', label: 'Call Mining', icon: CallsIcon },
      { id: 'dashboards', label: 'Dashboards', icon: DashboardIcon },
      { id: 'quote-automation', label: 'Quote Automation', icon: QuoteIcon },
      { id: 'lead-generation', label: 'Lead Generation', icon: LeadIcon },
      { id: 'reports', label: 'Reports', icon: ReportIcon },
    ],
  },
]
