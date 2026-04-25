export type GeneratedFeatureId =
  | 'ai_chat'
  | 'dynamic_graph_generation'
  | 'excel_to_dashboard'

export type GeneratedWebAppTemplateId =
  | 'sales_demand_command_center'
  | 'quote_pipeline_studio'
  | 'lead_route_planner'
  | 'weekly_revenue_brief'
  | 'investor_command'
  | 'company_finder'

export type CustomLayoutId = 'investor_command' | 'company_finder'

export type DashboardModuleId =
  | 'product_request_leaderboard'
  | 'product_demand_trend'
  | 'complaint_categories'
  | 'competitor_mentions'
  | 'lost_deal_risk'
  | 'rep_activity'
  | 'regional_demand_heatmap'
  | 'recommended_rep_actions'
  | 'open_quote_opportunities'
  | 'quote_queue'
  | 'spec_review_status'
  | 'pricing_assumptions'
  | 'approval_queue'
  | 'prospect_table'
  | 'route_preview'
  | 'contact_list'
  | 'visit_talking_points'
  | 'executive_summary'
  | 'top_requested_products'
  | 'at_risk_accounts'
  | 'sales_team_actions'

export interface GeneratedWebAppTemplate {
  id: GeneratedWebAppTemplateId
  name: string
  promptTriggers: string[]
  description: string
  modules: DashboardModuleId[]
  defaultFeatures: GeneratedFeatureId[]
  accent: string
  buildSteps: string[]
  previewMetrics: Array<{
    label: string
    value: string
    note: string
  }>
  /** When set, the dashboard generator renders the dedicated layout
      component instead of the generic chart-card grid. */
  customLayoutId?: CustomLayoutId
}

export interface FeatureAddOn {
  id: GeneratedFeatureId
  name: string
  description: string
  enabledStateLabel: string
}

export interface DashboardChartCard {
  id: DashboardModuleId
  title: string
  type: 'bar' | 'line' | 'ranked-list' | 'heatmap' | 'table'
  insight: string
  salesAction: string
  source: string
  freshness: string
  data: Array<{
    label: string
    value: number
    trend?: string
  }>
}

export interface SalesAction {
  owner: string
  action: string
  due: string
  sourceCue: string
}

export interface ExcelSheetMapping {
  sheetName: string
  purpose: string
  columnMappings: Record<string, string>
}

export interface ExcelDashboardMapping {
  sourceFile: string
  dashboardTemplate: GeneratedWebAppTemplateId
  uploadBehavior: string
  sheets: ExcelSheetMapping[]
  generatedModules: DashboardModuleId[]
}

export interface DashboardGenerationResult {
  prompt: string
  generatedTitle: string
  audience: string
  timeRange: string
  template: GeneratedWebAppTemplate
  modules: DashboardChartCard[]
  primaryInsight: string
  recommendedActions: SalesAction[]
  sourceSummary: string
  generatedAt: string
}
