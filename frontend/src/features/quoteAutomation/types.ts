export type TaskStatus = 'queued' | 'running' | 'complete' | 'blocked'

export interface QuoteAutomationTask {
  id: string
  label: string
  detail: string
}

export interface QuoteRequestInput {
  id: string
  label: string
  type: 'voice_memo' | 'spec_document' | 'customer_context' | 'pricing_template'
  status: string
  summary: string
}

export interface SourceReference {
  fileName: string
  assetPath: string
  documentType: string
  customer: string
  preparedFor: string
  extractedFields: string[]
}

export interface QuoteLineItem {
  sku: string
  description: string
  quantity: string
  priceRange: string
  assumption: string
}

export interface PricingAssumption {
  label: string
  value: string
}

export interface QuoteSuggestion {
  title: string
  rationale: string
  estimatedImpact: string
}

export interface DraftQuote {
  title: string
  customerSummary: string
  completion: number
  status: 'needs_rep_review'
  estimateRange: string
  lineItems: QuoteLineItem[]
  assumptions: PricingAssumption[]
  missingInfo: string[]
  suggestions: QuoteSuggestion[]
}

export interface QuoteAutomationDemoData {
  customerName: string
  repName: string
  requestedProduct: string
  constraints: string[]
  inputs: QuoteRequestInput[]
  sourceReference: SourceReference
  tasks: QuoteAutomationTask[]
  draftQuote: DraftQuote
}
