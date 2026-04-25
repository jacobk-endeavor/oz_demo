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
      { label: 'Source records', value: '3', note: 'int_001-int_003 from call mining' },
      { label: 'Complaint clusters', value: '2', note: 'Lead times and backorder reporting' },
      { label: 'Competitor mentions', value: '2', note: 'TimberTech and Boral' },
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
    insight:
      'Composite decking, hidden fasteners, and exterior trim are the active requests in the demo source records.',
    salesAction:
      'Draft a Russin Lumber decking bundle, then attach hidden fasteners for North Ridge Builders and trim pricing for Hudson Valley Supply.',
    source: 'Source records: int_001 Russin Lumber, int_002 North Ridge Builders, int_003 Hudson Valley Supply',
    freshness: 'Updated 18 minutes ago',
    data: [
      { label: 'Composite decking', value: 1, trend: 'int_001' },
      { label: 'Hidden fasteners', value: 1, trend: 'int_002' },
      { label: 'Exterior trim', value: 1, trend: 'int_003' },
    ],
  },
  {
    id: 'product_demand_trend',
    title: 'Demand Trend',
    type: 'line',
    insight: 'The April demo timeline shows one demand signal per source medium: phone call, in-person note, and Zoom recap email.',
    salesAction:
      'Use the three April records as the source-backed executive view before expanding to the 60-record demo set.',
    source: 'Timeline from int_001 on Apr 18, int_002 on Apr 19, and int_003 on Apr 21',
    freshness: 'Synced with CRM snapshot today at 8:10 AM',
    data: [
      { label: 'Apr 18 phone', value: 1, trend: 'Russin' },
      { label: 'Apr 19 in person', value: 1, trend: 'North Ridge' },
      { label: 'Apr 21 Zoom', value: 1, trend: 'Hudson Valley' },
    ],
  },
  {
    id: 'complaint_categories',
    title: 'Complaints By Region',
    type: 'ranked-list',
    insight:
      'Russin Lumber flagged unclear lead times, while Hudson Valley Supply needs cleaner reporting on backorders.',
    salesAction:
      'Have Sami call Russin Lumber with delivery assumptions and prepare a backorder reporting view for Hudson Valley Supply.',
    source: 'Complaint records: int_001 lead times; int_003 backorder reporting',
    freshness: 'Updated 18 minutes ago',
    data: [
      { label: 'Montgomery, NY lead times', value: 1, trend: 'int_001' },
      { label: 'Hudson Valley backorders', value: 1, trend: 'int_003' },
      { label: 'Albany complaint-free upsell', value: 0, trend: 'int_002' },
    ],
  },
  {
    id: 'competitor_mentions',
    title: 'Competitor Pressure',
    type: 'bar',
    insight:
      'TimberTech appears against Russin Lumber decking delivery windows, and Boral appears in Hudson Valley exterior trim pricing.',
    salesAction:
      'Send TimberTech delivery comparisons to Russin Lumber and Boral trim pricing options to Hudson Valley Supply.',
    source: 'Competitor records: int_001 TimberTech; int_003 Boral',
    freshness: 'Verified by Oz against source snippets today',
    data: [
      { label: 'TimberTech', value: 1, trend: 'int_001' },
      { label: 'Boral', value: 1, trend: 'int_003' },
    ],
  },
  {
    id: 'lost_deal_risk',
    title: 'Lost Deal Risk',
    type: 'heatmap',
    insight:
      'Russin Lumber and Hudson Valley Supply have the clearest risk because each combines a competitor mention with a complaint.',
    salesAction:
      'Treat Russin Lumber and Hudson Valley Supply as save-plan accounts before the competitor comparisons harden.',
    source: 'Risk sources: int_001 combines TimberTech and lead-time complaint; int_003 combines Boral and backorder reporting complaint',
    freshness: 'CRM and interaction data joined today',
    data: [
      { label: 'Russin Lumber', value: 92, trend: 'high' },
      { label: 'Hudson Valley Supply', value: 84, trend: 'high' },
      { label: 'North Ridge Builders', value: 42, trend: 'upsell' },
    ],
  },
  {
    id: 'rep_activity',
    title: 'Rep Activity',
    type: 'table',
    insight: 'Sami owns Russin Lumber in the customer file, while Ava and Mia appear on the newest interaction records.',
    salesAction: 'Route decking follow-up to Sami, fastener upsell to Ava, and exterior trim pricing to Mia.',
    source: 'Rep sources: customers cust_001-cust_002 plus interactions int_001-int_003',
    freshness: 'Updated after morning call sync',
    data: [
      { label: 'Sami', value: 1, trend: 'Russin owner' },
      { label: 'Ava', value: 1, trend: 'North Ridge note' },
      { label: 'Mia', value: 1, trend: 'Hudson email' },
    ],
  },
  {
    id: 'open_quote_opportunities',
    title: 'Open Quote Opportunities',
    type: 'table',
    insight:
      'Russin Lumber has the quote-ready composite decking package, with hidden fasteners as the clean accessory upsell.',
    salesAction:
      'Create the Russin Lumber composite decking quote and include hidden fastener recommendations before the callback.',
    source: 'Quote automation source plus int_001 decking request and int_002 hidden fastener upsell',
    freshness: '6 new quote signals since yesterday',
    data: [
      { label: 'Russin decking package', value: 1, trend: 'int_001' },
      { label: 'Hidden fastener accessory', value: 1, trend: 'int_002' },
      { label: 'Exterior trim pricing', value: 1, trend: 'int_003' },
    ],
  },
  {
    id: 'recommended_rep_actions',
    title: 'Recommended Rep Actions',
    type: 'ranked-list',
    insight: 'The next best moves are specific, account-owned, and source-backed.',
    salesAction: 'Dispatch this action list to reps and review completion in tomorrow standup.',
    source: 'Recommended actions from suggestedAction fields on int_001-int_003',
    freshness: 'Generated from the current dashboard state',
    data: [
      { label: 'Draft Russin decking bundle quote', value: 1, trend: 'int_001' },
      { label: 'Suggest North Ridge fastener bundle', value: 2, trend: 'int_002' },
      { label: 'Prepare Hudson trim pricing options', value: 3, trend: 'int_003' },
    ],
  },
]

export const recommendedActions: SalesAction[] = [
  {
    owner: 'Sami',
    action: 'Call Russin Lumber with composite decking delivery assumptions and a bundle quote.',
    due: 'Today, 4:00 PM',
    sourceCue: 'int_001 complaint plus TimberTech mention',
  },
  {
    owner: 'Ava',
    action: 'Suggest a hidden fastener bundle during the next North Ridge Builders site visit.',
    due: 'Tomorrow morning',
    sourceCue: 'int_002 in-person note',
  },
  {
    owner: 'Mia',
    action: 'Prepare exterior trim pricing options and a Boral comparison for Hudson Valley Supply.',
    due: 'Friday',
    sourceCue: 'int_003 Zoom recap email',
  },
]

export const excelDashboardMapping: ExcelDashboardMapping = {
  sourceFile: 'customer-interactions.xlsx',
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
