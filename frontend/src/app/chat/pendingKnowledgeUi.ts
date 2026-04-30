import { matchStockUpLikelyBuyersIntent } from '../../features/leadGen/stockUpBuyerIntents'
import { matchCompetitorProductSearchIntent } from '../../features/lumberyard/competitorProductIntents'
import {
  matchLumberyardAnalyticsOrResearchIntent,
  matchLumberyardTableIntent,
} from '../../features/lumberyard/lumberyardIntents'
import {
  matchProductRequestCustomerDashboardIntent,
} from '../../features/dashboardGenerator/productRequestDashboardIntent'
import {
  matchProfitByProductGraphIntent,
  matchWarehouseBackfillPnlIntent,
} from '../../features/dashboardGenerator/profitGraphIntent'
import { isCommandCenterFirstPage, isLeadTableChatPage, type Page } from '../workflows/workflowRouting'

export type PendingKnowledgeUiKind =
  | 'thinking'
  | 'knowledge_base'
  | 'knowledge_web'
  | 'knowledge_crm'
  | 'knowledge_crm_likely_buyers'
  | 'knowledge_customer_demand'

type PendingKnowledgeUiParams = {
  page: Page
  userText: string
  openAiConfigured: boolean
  lumberyardOpen: boolean
  hasCompetitorQueries: boolean
}

export function getPendingKnowledgeUiKind({
  page,
  userText,
  openAiConfigured,
  lumberyardOpen,
  hasCompetitorQueries,
}: PendingKnowledgeUiParams): PendingKnowledgeUiKind {
  if (!isLeadTableChatPage(page)) return 'thinking'
  if (isCommandCenterFirstPage(page) && page !== 'oz') return 'thinking'
  if (
    page === 'oz' &&
    (matchProductRequestCustomerDashboardIntent(userText) ||
      matchProfitByProductGraphIntent(userText) ||
      matchWarehouseBackfillPnlIntent(userText))
  ) {
    return 'knowledge_customer_demand'
  }
  if (!openAiConfigured) return 'thinking'
  if (page === 'oz' && matchStockUpLikelyBuyersIntent(userText)) {
    if (hasCompetitorQueries) return 'knowledge_crm_likely_buyers'
    return 'thinking'
  }
  if (page === 'oz' && matchCompetitorProductSearchIntent(userText)) return 'knowledge_web'
  const wantLumber =
    matchLumberyardTableIntent(userText) ||
    matchLumberyardAnalyticsOrResearchIntent(userText) ||
    lumberyardOpen
  return wantLumber ? 'knowledge_base' : 'thinking'
}
