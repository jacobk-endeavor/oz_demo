import { chartCards, recommendedActions, webAppTemplates } from './dashboardData'
import type {
  DashboardChartCard,
  DashboardGenerationResult,
  DashboardModuleId,
  GeneratedFeatureId,
  GeneratedWebAppTemplate,
} from './types'

const moduleAliases: Record<DashboardModuleId, DashboardModuleId[]> = {
  product_request_leaderboard: ['product_request_leaderboard', 'product_demand_trend'],
  product_demand_trend: ['product_demand_trend'],
  complaint_categories: ['complaint_categories'],
  competitor_mentions: ['competitor_mentions', 'lost_deal_risk'],
  lost_deal_risk: ['lost_deal_risk'],
  rep_activity: ['rep_activity'],
  regional_demand_heatmap: ['complaint_categories'],
  recommended_rep_actions: ['recommended_rep_actions'],
  open_quote_opportunities: ['open_quote_opportunities'],
  quote_queue: ['open_quote_opportunities'],
  spec_review_status: ['open_quote_opportunities'],
  pricing_assumptions: ['open_quote_opportunities'],
  approval_queue: ['recommended_rep_actions'],
  prospect_table: ['recommended_rep_actions'],
  route_preview: ['recommended_rep_actions'],
  contact_list: ['recommended_rep_actions'],
  visit_talking_points: ['recommended_rep_actions'],
  executive_summary: ['product_demand_trend', 'lost_deal_risk'],
  top_requested_products: ['product_request_leaderboard'],
  at_risk_accounts: ['lost_deal_risk'],
  sales_team_actions: ['rep_activity', 'recommended_rep_actions'],
}

export function selectTemplateForPrompt(prompt: string): GeneratedWebAppTemplate {
  const normalizedPrompt = prompt.toLowerCase()

  const [bestTemplate] = webAppTemplates
    .map((template) => ({
      template,
      score: template.promptTriggers.reduce(
        (total, trigger) => total + (normalizedPrompt.includes(trigger) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)

  return bestTemplate.score > 0 ? bestTemplate.template : webAppTemplates[0]
}

export function detectRequestedFeature(prompt: string): GeneratedFeatureId | null {
  const normalizedPrompt = prompt.toLowerCase()

  if (normalizedPrompt.includes('excel') || normalizedPrompt.includes('spreadsheet')) {
    return 'excel_to_dashboard'
  }

  if (normalizedPrompt.includes('graph') || normalizedPrompt.includes('chart')) {
    return 'dynamic_graph_generation'
  }

  if (
    normalizedPrompt.includes('ai chat') ||
    normalizedPrompt.includes('assistant') ||
    normalizedPrompt.includes('oz')
  ) {
    return 'ai_chat'
  }

  return null
}

export function getCardsForTemplate(template: GeneratedWebAppTemplate): DashboardChartCard[] {
  const preferredIds = template.modules.flatMap((moduleId) => moduleAliases[moduleId])
  const uniquePreferredIds = [...new Set(preferredIds)]
  const preferredCards = uniquePreferredIds
    .map((moduleId) => chartCards.find((card) => card.id === moduleId))
    .filter((card): card is DashboardChartCard => card !== undefined)

  const fallbackCards = chartCards.filter(
    (card) => !preferredCards.some((preferredCard) => preferredCard.id === card.id),
  )

  return [...preferredCards, ...fallbackCards].slice(0, 6)
}

export function generateDashboardFromPrompt(prompt: string): DashboardGenerationResult {
  const template = selectTemplateForPrompt(prompt)

  return {
    prompt,
    template,
    generatedTitle: template.name,
    audience: template.id === 'weekly_revenue_brief' ? 'sales leadership' : 'field sales teams',
    timeRange: 'last 90 days',
    modules: getCardsForTemplate(template),
    primaryInsight:
      'Russin Lumber and Hudson Valley Supply need the most attention because their product requests are paired with complaints and competitor mentions.',
    recommendedActions,
    sourceSummary:
      'Built from 60 demo interactions across phone calls, Zoom meetings, field notes, emails, and quote signals.',
    generatedAt: 'Today at 8:42 AM',
  }
}
