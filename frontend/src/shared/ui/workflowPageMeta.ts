import type { FieldMobileNavId, OzWorkflowNavId } from './OzWorkflowShell.contract'

/**
 * Single source of truth for Oz workflow context headers (eyebrow, title, subtitle).
 * Adjust copy here to roll changes across every route that uses `getPageMeta` in App.
 */
export type WorkflowPageId = Exclude<OzWorkflowNavId, FieldMobileNavId>

export type WorkflowPageMeta = {
  /** Small caps line above the title (e.g. “Workflow”). */
  eyebrow?: string
  title: string
  /** One line under the title; omit for a title-only header. */
  subtitle?: string
}

export const WORKFLOW_PAGE_META: Record<WorkflowPageId, WorkflowPageMeta> = {
  oz: {
    eyebrow: 'Command center',
    title: 'Oz',
    subtitle:
      'Chat is front and center. After a competitor product search on activity, ask who is likely to buy if you stock those lines—the lead grid opens with a demo filter (not a Milwaukee-only look-up).',
  },
  search: {
    eyebrow: 'Workspace',
    title: 'Search',
    subtitle: 'Search across tables, files, and logs — wire to your index when you are ready.',
  },
  'field-app': {
    eyebrow: 'Workspace',
    title: 'Field App',
    subtitle: 'Voice-only. Oz is the orb.',
  },
  tables: {
    eyebrow: 'Workspace',
    title: 'Tables',
    subtitle:
      'The Milwaukee distributor lead grid stays open here. Chat to sort, sub-sort, filter by source, or say “find more leads”.',
  },
  'knowledge-base': {
    eyebrow: 'Workspace',
    title: 'Knowledge Base',
    subtitle: 'Add files from your machine; each one is ingested and shown as a table.',
  },
  nebula: {
    eyebrow: 'Workflow',
    title: 'Overview',
  },
  'field-notes': {
    eyebrow: 'Workflow',
    title: 'Field notes',
    subtitle: 'Voice memos from the yard, team briefs, and weekly themes.',
  },
  'quotes-ready': {
    eyebrow: 'Workflow',
    title: 'Voice Quote Automation',
    subtitle: 'Open order-background PDFs from the Field App and proof them before quote automation.',
  },
  dashboards: {
    eyebrow: 'Workflow',
    title: 'Dashboards',
    subtitle: 'Describe charts in plain language, then publish to a mock link.',
  },
  'quote-automation': {
    eyebrow: 'Workflow',
    title: 'Quote automation',
    subtitle: 'Review specs, assumptions, and pricing evidence before sending an 80%-complete quote.',
  },
  'lead-generation': {
    eyebrow: 'Workflow',
    title: 'Lead generation',
    subtitle: 'Find lookalike accounts near tomorrow’s route and turn them into visits.',
  },
  'background-agents': {
    eyebrow: 'Workflow',
    title: 'Background agents',
    subtitle: 'Automations you define in chat: each agent shows what it does and when it runs.',
  },
  help: {
    title: 'Help',
    subtitle: 'Documentation and support — replace with your help center when you are ready.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Workspace and profile preferences (shell only in this demo).',
  },
}
