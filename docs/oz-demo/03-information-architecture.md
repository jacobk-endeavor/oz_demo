# Information Architecture

## Primary Navigation

The left sidebar should contain:


- **Oz**: assistant home and voice command surface.
- **Nebula**: workflow hub.
- **Field Notes**: voice note capture and meeting prep.
- **Call Mining**: interaction table and transcript insights.
- **Dashboards**: generated analytics views.
- **Quote Automation**: spec review and pricing drafts.
- **Lead Generation**: similar customer discovery and route planning.
- **Reports**: recurring report creation and delivery status.

## Opinionated Decision

Use `Oz` for the assistant and `Nebula` for workflows. Do not invent additional product names for each module.

## Defense

The demo already has several workflows. More names would increase cognitive load. Oz is the intelligence layer; Nebula is the place where point solutions live. Everything else should be labeled plainly by job-to-be-done.

## Global Screen Pattern

Every screen should follow this structure:

- Header: current workflow title, source data context, and primary action.
- Main content: table, dashboard, quote preview, route, or voice panel.
- Evidence rail: source snippets, top records, or background tasks.
- Right Oz panel: contextual chat with suggested prompts.

## Persistent Oz Panel

The right panel should include:

- Current context summary.
- Chat transcript.
- Suggested questions.
- “Run script” demo control.
- Source citations or record references when available.
- Action buttons such as “Generate dashboard,” “Draft quote,” or “Send report.”

## Nebula Workflow Hub

The Nebula page should show point solutions as cards:

- Mine calls for product demand.
- Generate dashboard.
- Build pricing quote.
- Find similar customers.
- Prepare weekly sales report.

Each card should show:

- Business question it answers.
- Inputs required.
- Output generated.
- Confidence/source count.
- Time saved estimate.

## Page-Level Success Criteria

### Oz Home

The user understands that Oz can be spoken to and can drive the rest of the app.

### Field Notes

The user sees that Oz captures messy sales context and converts it into better next questions.

### Call Mining

The user sees that Oz can extract demand, complaints, and competitor intelligence from scattered interactions.

### Dashboards

The user sees that Oz can generate analytical views from natural language.

### Quote Automation

The user sees that Oz can turn specs and pricing templates into an 80%-complete quote.

### Lead Generation

The user sees that Oz can find lookalike customers and produce an actionable route.

### Reports

The user sees that Oz can turn an insight into a recurring operational process.

## Demo Controls

Each workflow should include a scripted path:

- Start state.
- User prompt.
- Oz thinking state.
- Background task steps.
- Final output.
- Follow-up prompt.

This is essential for live demos. The presenter should be able to advance the story even if AI calls are disabled.
