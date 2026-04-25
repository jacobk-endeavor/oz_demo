export const ozWorkflowNavItems = [
  { id: 'oz', label: 'Oz' },
  { id: 'nebula', label: 'Nebula' },
  { id: 'field-notes', label: 'Field Notes' },
  { id: 'call-mining', label: 'Call Mining' },
  { id: 'dashboards', label: 'Dashboards' },
  { id: 'quote-automation', label: 'Quote Automation' },
  { id: 'lead-generation', label: 'Lead Generation' },
  { id: 'reports', label: 'Reports' },
] as const

export type OzWorkflowNavId = (typeof ozWorkflowNavItems)[number]['id']
