# Workflow: Dashboard Generation

## Goal

Let the user ask for a dashboard in natural language and receive a polished, interactive sales intelligence dashboard with Oz available for follow-up questions.

## User Story

“Generate a dashboard for me that shows the products customers are requesting, complaints by region, competitor pressure, and next best actions.”

## Opinionated Decision

Generate from a small set of high-quality dashboard templates instead of a free-form dashboard builder.

## Defense

For a demo, polish beats infinite flexibility. A template-driven generator makes the result look intentional, fast, and executive-ready. The user still feels like they generated it because the prompt determines which modules appear, but the implementation remains reliable.

## Secondary Decision

Attach a Lovable-style app generation chatbot to this page, but hard-code the generated app outcomes.

## Defense

The demo needs the magic of “type a request and a web app appears” without the risk of arbitrary code generation during a live presentation. The chatbot should feel creative and flexible, while the system routes to three or four prepared web app templates.

## Primary UI

- Prompt bar at top: “Generate dashboard that has...”
- Main dashboard grid with chart cards.
- Right Oz panel for Q&A.
- Lovable-style app generation chatbot attached to the dashboard workspace.
- Small source/data freshness strip.
- Background shimmer while Oz “builds” the dashboard.

## Dashboard Modules

Use modular cards:

- Product request leaderboard.
- Product demand trend line.
- Complaint categories.
- Competitor mentions.
- Lost deal risk.
- Rep activity.
- Regional demand heatmap or mocked map.
- Recommended actions.
- Open quote opportunities.

## Hard-Coded Web Apps

The dashboard generation chatbot should support these prepared app outcomes:

- **Sales Demand Command Center**: product requests, complaints, competitor pressure, and recommended rep actions.
- **Quote Pipeline Studio**: quote requests, spec review status, pricing assumptions, and approval queue.
- **Lead Route Planner**: lookalike leads, route stops, contact list, and visit plan.
- **Weekly Revenue Brief**: executive report dashboard with product demand, at-risk accounts, and sales team actions.

Each generated web app should have a fixed route/template, fixed seed data, and a convincing build animation. The user prompt selects and configures the template; it does not generate arbitrary code in the first demo.

## Hard-Coded Feature Additions

The app generation chatbot should also recognize and simulate adding these features:

- **AI chat feature**: adds a right-side assistant panel with suggested prompts and contextual answers.
- **Dynamic graph generation feature**: adds a prompt-to-chart module with two or three chart options.
- **Excel-to-dashboard import**: accepts a provided Excel file later and maps sheets/columns into dashboard modules.

For the first demo, Excel upload can be represented by a file drop zone and a mocked parsed result. The real parser can be added later with SheetJS or a backend import service.

## Prompt Examples

- “Generate a dashboard of top product requests and complaints.”
- “Build a dashboard for competitor risk over the last several months.”
- “Show me what sales should focus on next week.”
- “Create a usage-style dashboard for call mining insights.”
- “Generate a web app from this dashboard.”
- “Add an AI chat feature to this dashboard.”
- “Add dynamic graph generation.”
- “Turn this Excel file into a dashboard.”

## Oz Follow-Up Questions

- “What is the biggest opportunity?”
- “Which accounts should we call first?”
- “What changed this month?”
- “What products should we stock or promote?”
- “Which reps need this insight?”

## Demo Script

1. Open Dashboards.
2. User types or selects: “Generate a dashboard with top product requests, complaints, and competitor mentions.”
3. Oz enters thinking state.
4. Shimmer cards appear with labels: “Reading calls,” “Grouping requests,” “Cross-referencing competitors.”
5. Dashboard resolves into charts.
6. User asks Oz: “What is the key insight?”
7. Oz highlights one chart and recommends an action.

## Dashboard Generation Contract

```json
{
  "prompt": "Generate a dashboard with top product requests and competitor pressure.",
  "modules": ["product_requests", "competitor_mentions", "recommended_actions"],
  "timeRange": "last_90_days",
  "audience": "sales_leadership",
  "generatedTitle": "Product Demand And Competitor Pressure",
  "primaryInsight": "...",
  "recommendedActions": ["...", "..."],
  "generatedWebAppTemplate": "sales_demand_command_center",
  "enabledFeatures": ["ai_chat", "dynamic_graph_generation"]
}
```

## Excel-To-Dashboard Contract

```json
{
  "source": "excel_upload",
  "fileName": "customer-interactions.xlsx",
  "parsedSheets": ["Interactions", "Products", "Complaints"],
  "mappedColumns": {
    "Company": "customerName",
    "Date": "interactionDate",
    "Product Requested": "productRequested"
  },
  "generatedModules": ["product_requests", "complaints", "recommended_actions"]
}
```

## Acceptance Criteria

- A user can create a strong-looking dashboard with one prompt.
- Oz can answer questions about visible charts.
- Dashboard cards cite the same underlying demo data as Call Mining.
- Loading feels active and intentional.
- The Lovable-style chatbot can hard-code generation of three or four web apps.
- The chatbot can hard-code adding AI chat, dynamic graph generation, and Excel-to-dashboard behavior.

## What To Avoid

- Do not implement drag-and-drop dashboard editing first.
- Do not overload with too many chart types.
- Do not show decorative charts that lack a sales decision.
- Do not attempt real arbitrary code generation in the first demo.
