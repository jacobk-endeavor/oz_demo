import type { ComponentType, SVGProps } from 'react'
import {
  CallsIcon,
  ChatIcon,
  DashboardIcon,
  GraphIcon,
  LeadIcon,
  NebulaIcon,
  NotebookIcon,
  QuoteIcon,
  ReportIcon,
  SparkleIcon,
  UploadIcon,
} from './icons'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export interface OzNavGroup {
  id: string
  label: string
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
    id: 'assistant',
    label: 'Assistant',
    items: [
      { id: 'oz', label: 'Oz', icon: SparkleIcon },
      { id: 'nebula', label: 'Nebula', icon: NebulaIcon },
    ],
  },
  {
    id: 'workflows',
    label: 'Workflows',
    items: [
      { id: 'field-notes', label: 'Field Notes', icon: NotebookIcon },
      { id: 'call-mining', label: 'Call Mining', icon: CallsIcon },
      { id: 'dashboards', label: 'Dashboards', icon: DashboardIcon },
      { id: 'quote-automation', label: 'Quote Automation', icon: QuoteIcon },
      { id: 'lead-generation', label: 'Lead Generation', icon: LeadIcon },
      { id: 'reports', label: 'Reports', icon: ReportIcon },
    ],
  },
  {
    id: 'legacy',
    label: 'Legacy',
    items: [
      { id: 'chat', label: 'Chat', icon: ChatIcon },
      { id: 'graph', label: 'Graph', icon: GraphIcon },
      { id: 'ingest', label: 'Ingest', icon: UploadIcon },
    ],
  },
]
