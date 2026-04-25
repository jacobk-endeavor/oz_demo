# Oz Demo Hardcoded Assets

This folder stores demo assets that should be easy to replace without changing the product specs.

## Visual References

- `take-sales-to-space-reference.png`: brand mood reference.
- `oz-speaking-orb-reference.png`: Oz speaking orb reference.
- `template-investor-command-reference.png`: terminal-style "Investor Command" dashboard template reference.
- `template-company-finder-reference.png`: filter + table + chat "Company Finder" template reference.
- `lead-generation-table-reference.png`: Sculptor-style clean table reference for the Lead Generation page.

## Source Documents

- `fake-automation-source-document.pdf`: placeholder PDF for the quote/code automation document review flow. Replace this with the real source document later and keep the same file name if possible.

## Editable Demo Data

- `hardcoded-demo-data.template.json`: customer, call mining, quote, lead, and report seed data.
- `generated-web-apps.template.json`: hard-coded web app templates used by the Lovable-style dashboard chatbot.
- `excel-dashboard-mapping.template.json`: editable mapping between Excel sheets/columns and dashboard modules.
- `Productivity Report - New Active 2026 03 31.xlsm`: current Excel workbook placeholder for dashboard generation experiments.

## Editing Rule

Prefer editing these JSON files over burying demo data inside components. The future app should import these files or convert them into TypeScript modules so the team can adjust names, products, routes, and scripted outputs together.
