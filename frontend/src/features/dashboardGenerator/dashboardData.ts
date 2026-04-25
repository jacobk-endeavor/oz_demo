import type {
  DashboardChartCard,
  ExcelDashboardMapping,
  FeatureAddOn,
  GeneratedWebAppTemplate,
  SalesAction,
} from './types'

export const webAppTemplates: GeneratedWebAppTemplate[] = [
  {
    id: 'sales_demand_command_center',
    name: 'Sales Demand Command Center',
    promptTriggers: [
      'generate a dashboard',
      'top product requests',
      'customer complaints',
      'competitor pressure',
      'demand',
      'complaints',
    ],
    description:
      'A sales intelligence dashboard for requested products, complaints, competitor pressure, and next best actions.',
    modules: [
      'product_request_leaderboard',
      'complaint_categories',
      'competitor_mentions',
      'recommended_rep_actions',
    ],
    defaultFeatures: ['ai_chat', 'dynamic_graph_generation'],
    accent: 'from-blue-500 to-red-500',
    buildSteps: ['Reading calls', 'Grouping requests', 'Cross-referencing competitors'],
    previewMetrics: [
      { label: 'Requested SKUs', value: '42', note: '+18% in 90 days' },
      { label: 'Complaint clusters', value: '8', note: '3 require manager follow-up' },
      { label: 'Competitor mentions', value: '31', note: 'Atlas pressure rising' },
    ],
  },
  {
    id: 'quote_pipeline_studio',
    name: 'Quote Pipeline Studio',
    promptTriggers: ['pricing', 'quote', 'spec review', 'approval queue', 'pipeline'],
    description:
      'A workflow dashboard for reviewing specs, pricing assumptions, draft quotes, and approval status.',
    modules: ['quote_queue', 'spec_review_status', 'pricing_assumptions', 'approval_queue'],
    defaultFeatures: ['ai_chat'],
    accent: 'from-red-500 to-orange-500',
    buildSteps: ['Scanning quote requests', 'Flagging missing specs', 'Preparing approvals'],
    previewMetrics: [
      { label: 'Open quotes', value: '18', note: '$1.4M potential' },
      { label: 'Spec gaps', value: '6', note: 'Need engineering review' },
      { label: 'Expedites', value: '4', note: 'Customer deadlines this week' },
    ],
  },
  {
    id: 'lead_route_planner',
    name: 'Lead Route Planner',
    promptTriggers: [
      'nearest customers',
      'similar customers',
      'generate a route',
      'prospects',
      'lead',
    ],
    description:
      'A lead generation app that ranks lookalike customers and creates a sales route.',
    modules: ['prospect_table', 'route_preview', 'contact_list', 'visit_talking_points'],
    defaultFeatures: ['ai_chat', 'dynamic_graph_generation'],
    accent: 'from-cyan-400 to-blue-600',
    buildSteps: ['Finding lookalikes', 'Ranking route stops', 'Preparing talking points'],
    previewMetrics: [
      { label: 'Lookalike leads', value: '24', note: '11 match current winners' },
      { label: 'Route stops', value: '7', note: '48-mile field loop' },
      { label: 'Warm intros', value: '9', note: 'Rep-owned relationships' },
    ],
  },
  {
    id: 'weekly_revenue_brief',
    name: 'Weekly Revenue Brief',
    promptTriggers: ['weekly report', 'send report', 'sales team', 'executive digest', 'brief'],
    description:
      'A recurring report dashboard for sales leadership and field reps.',
    modules: ['executive_summary', 'top_requested_products', 'at_risk_accounts', 'sales_team_actions'],
    defaultFeatures: ['ai_chat'],
    accent: 'from-white to-blue-400',
    buildSteps: ['Summarizing demand', 'Ranking at-risk accounts', 'Drafting field actions'],
    previewMetrics: [
      { label: 'Brief sections', value: '5', note: 'Ready for Monday send' },
      { label: 'At-risk accounts', value: '12', note: '$860K renewal exposure' },
      { label: 'Rep actions', value: '16', note: 'Assigned by territory' },
    ],
  },
]

export const featureAddOns: FeatureAddOn[] = [
  {
    id: 'ai_chat',
    name: 'AI Chat Feature',
    description:
      'Adds a right-side assistant panel with contextual prompts, answers, and suggested actions.',
    enabledStateLabel: 'Oz assistant panel active with follow-up prompts',
  },
  {
    id: 'dynamic_graph_generation',
    name: 'Dynamic Graph Generation',
    description:
      'Adds a prompt-to-chart module with hard-coded chart options for demand, complaints, and competitor mentions.',
    enabledStateLabel: 'Prompt-to-chart module added with 3 chart options',
  },
  {
    id: 'excel_to_dashboard',
    name: 'Excel To Dashboard',
    description:
      'Adds an Excel upload/drop zone and maps parsed columns into dashboard modules.',
    enabledStateLabel: 'Excel parser mock mapped 3 sheets into dashboard cards',
  },
]

export const chartCards: DashboardChartCard[] = [
  {
    id: 'product_request_leaderboard',
    title: 'Product Request Leaderboard',
    type: 'bar',
    insight: 'EcoShield Sealant and FlexRail Kits are the fastest-rising requests.',
    salesAction: 'Ask supply to reserve 120 EcoShield units and arm reps with the FlexRail spec sheet.',
    source: '32 call transcripts, 11 field notes, 7 inbound emails',
    freshness: 'Updated 18 minutes ago',
    data: [
      { label: 'EcoShield Sealant', value: 86, trend: '+24%' },
      { label: 'FlexRail Kit', value: 72, trend: '+18%' },
      { label: 'NovaPump 300', value: 58, trend: '+9%' },
      { label: 'ColdBox XL', value: 41, trend: '+6%' },
    ],
  },
  {
    id: 'product_demand_trend',
    title: 'Demand Trend',
    type: 'line',
    insight: 'Requests accelerated after Midwest field visits and distributor webinars.',
    salesAction: 'Schedule a 20-minute webinar replay for accounts that asked about bulk pricing.',
    source: 'Rolling 90-day interaction timeline',
    freshness: 'Synced with CRM snapshot today at 8:10 AM',
    data: [
      { label: 'Jan', value: 28 },
      { label: 'Feb', value: 34 },
      { label: 'Mar', value: 49 },
      { label: 'Apr', value: 63 },
    ],
  },
  {
    id: 'complaint_categories',
    title: 'Complaints By Region',
    type: 'ranked-list',
    insight: 'Delivery delays dominate the West, while install complexity clusters in the Northeast.',
    salesAction: 'Have regional managers call the 9 accounts with active delivery complaints before Friday.',
    source: 'Complaint tags extracted from calls, notes, and emails',
    freshness: 'Updated 18 minutes ago',
    data: [
      { label: 'West delivery delays', value: 19, trend: '+7' },
      { label: 'Northeast install complexity', value: 14, trend: '+4' },
      { label: 'South pricing confusion', value: 11, trend: '-2' },
      { label: 'Midwest packaging damage', value: 8, trend: '+1' },
    ],
  },
  {
    id: 'competitor_mentions',
    title: 'Competitor Pressure',
    type: 'bar',
    insight: 'Atlas Industrial is winning attention with bundles, not price.',
    salesAction: 'Send bundle comparison sheets to reps covering Drake HVAC, Holt Supply, and Summit Controls.',
    source: '31 competitor mentions with transcript excerpts',
    freshness: 'Verified by Oz against source snippets today',
    data: [
      { label: 'Atlas Industrial', value: 31, trend: '+13%' },
      { label: 'Northstar Supply', value: 18, trend: '+4%' },
      { label: 'HelioWorks', value: 12, trend: '-3%' },
      { label: 'PrimeLine', value: 9, trend: '+2%' },
    ],
  },
  {
    id: 'lost_deal_risk',
    title: 'Lost Deal Risk',
    type: 'heatmap',
    insight: 'Four expansion accounts show high competitor intent and unresolved service complaints.',
    salesAction: 'Escalate Benton Foods and Apex Plastics to sales leadership for save plans.',
    source: 'Pipeline stage changes plus call-mining risk phrases',
    freshness: 'CRM and interaction data joined today',
    data: [
      { label: 'Benton Foods', value: 92, trend: 'high' },
      { label: 'Apex Plastics', value: 84, trend: 'high' },
      { label: 'Drake HVAC', value: 69, trend: 'medium' },
      { label: 'Summit Controls', value: 61, trend: 'medium' },
    ],
  },
  {
    id: 'rep_activity',
    title: 'Rep Activity',
    type: 'table',
    insight: 'The busiest reps are not always assigned to the highest-opportunity accounts.',
    salesAction: 'Move two follow-ups from overloaded reps to Mia Chen and Rafael Ortiz.',
    source: 'Rep call logs and generated action assignments',
    freshness: 'Updated after morning call sync',
    data: [
      { label: 'Avery Stone', value: 28, trend: '7 overdue' },
      { label: 'Mia Chen', value: 15, trend: 'capacity' },
      { label: 'Rafael Ortiz', value: 12, trend: 'capacity' },
      { label: 'Nora Patel', value: 25, trend: '3 overdue' },
    ],
  },
  {
    id: 'open_quote_opportunities',
    title: 'Open Quote Opportunities',
    type: 'table',
    insight: 'Open requests are concentrated around two product lines with repeat objections.',
    salesAction: 'Create quote drafts for FlexRail bundles before competitors reset pricing.',
    source: 'Quote requests found in notes and call transcripts',
    freshness: '6 new quote signals since yesterday',
    data: [
      { label: 'FlexRail bundle', value: 9, trend: '$410K' },
      { label: 'EcoShield replenishment', value: 7, trend: '$260K' },
      { label: 'NovaPump retrofit', value: 4, trend: '$190K' },
    ],
  },
  {
    id: 'recommended_rep_actions',
    title: 'Recommended Rep Actions',
    type: 'ranked-list',
    insight: 'The next best moves are specific, account-owned, and source-backed.',
    salesAction: 'Dispatch this action list to reps and review completion in tomorrow standup.',
    source: 'Oz recommendations tied to source snippets',
    freshness: 'Generated from the current dashboard state',
    data: [
      { label: 'Call Benton Foods with save plan', value: 1, trend: 'today' },
      { label: 'Send FlexRail comparison to Drake HVAC', value: 2, trend: '24h' },
      { label: 'Invite Summit Controls to webinar replay', value: 3, trend: '48h' },
    ],
  },
]

export const recommendedActions: SalesAction[] = [
  {
    owner: 'Avery Stone',
    action: 'Call Benton Foods with a bundle-save plan and delivery recovery date.',
    due: 'Today, 4:00 PM',
    sourceCue: '3 complaint calls and 2 Atlas mentions',
  },
  {
    owner: 'Mia Chen',
    action: 'Send FlexRail comparison sheet to Drake HVAC and ask for install timeline.',
    due: 'Tomorrow morning',
    sourceCue: 'Spec review email plus competitor note',
  },
  {
    owner: 'Rafael Ortiz',
    action: 'Package EcoShield replenishment quote for Holt Supply.',
    due: 'Friday',
    sourceCue: 'Repeat product request in 5 interactions',
  },
]

export const excelDashboardMapping: ExcelDashboardMapping = {
  sourceFile: 'Productivity Report - New Active 2026 03 31.xlsm',
  dashboardTemplate: 'sales_demand_command_center',
  uploadBehavior: 'mocked_parse_first_real_parser_later',
  sheets: [
    {
      sheetName: 'Interactions',
      purpose: 'Customer calls, notes, emails, and meeting records',
      columnMappings: {
        Company: 'company',
        Representative: 'representative',
        Date: 'date',
        Medium: 'medium',
        Location: 'locationTag',
        'Product Requested': 'productRequested',
        Complaint: 'complaint',
        Competitor: 'competitorMentioned',
      },
    },
    {
      sheetName: 'Products',
      purpose: 'Product request counts and trend data',
      columnMappings: {
        Product: 'productName',
        Requests: 'requestCount',
        Trend: 'trend',
        'Recommended Action': 'recommendedAction',
      },
    },
    {
      sheetName: 'Leads',
      purpose: 'Prospects and route planning',
      columnMappings: {
        Company: 'company',
        Contact: 'contact',
        Phone: 'phone',
        Location: 'location',
        'Similarity Reason': 'similarityReason',
      },
    },
  ],
  generatedModules: [
    'product_request_leaderboard',
    'complaint_categories',
    'competitor_mentions',
    'recommended_rep_actions',
  ],
}
