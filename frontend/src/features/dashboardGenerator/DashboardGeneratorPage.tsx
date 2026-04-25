import { useEffect, useMemo, useState } from 'react'
import { Button, Panel, Tag, joinClasses } from '../../shared/ui'
import { excelDashboardMapping, featureAddOns, webAppTemplates } from './dashboardData'
import { generateDashboardFromPrompt } from './dashboardGenerator'
import type {
  DashboardChartCard,
  DashboardGenerationResult,
  GeneratedFeatureId,
  GeneratedWebAppTemplate,
} from './types'

const defaultPrompt =
  'Generate a dashboard with top product requests, complaints, competitor pressure, and next best actions.'

const initialDashboard = generateDashboardFromPrompt(defaultPrompt)

const ozAnswers: Record<string, string> = {
  opportunity:
    'Russin Lumber is the biggest opportunity. int_001 pairs a composite decking request with a TimberTech comparison and a clear callback path for a bundle quote.',
  accounts:
    'Call Russin Lumber and Hudson Valley Supply first because both records combine product demand, complaints, and competitor pressure. North Ridge Builders is the clean upsell follow-up for hidden fasteners.',
  changed:
    'The April source set shifted from a phone call to an in-person note and then a Zoom recap email — one of each medium.',
  promote:
    'Promote composite decking, hidden fasteners, and exterior trim. Those are the exact product requests in int_001, int_002, and int_003.',
}

function buildExcelPreview(fileName: string) {
  return {
    fileName,
    parsedSheets: excelDashboardMapping.sheets.map((sheet) => sheet.sheetName),
    mappedColumnCount: excelDashboardMapping.sheets.reduce(
      (total, sheet) => total + Object.keys(sheet.columnMappings).length,
      0,
    ),
    generatedModuleCount: excelDashboardMapping.generatedModules.length,
  }
}

function MiniBar({ card }: { card: DashboardChartCard }) {
  const max = Math.max(...card.data.map((item) => item.value), 1)
  return (
    <ul className="mt-3 space-y-2">
      {card.data.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-600">
            <span className="truncate text-zinc-800">{item.label}</span>
            <span className="font-mono text-zinc-500">{item.trend ?? item.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function MetricStrip({ dashboard }: { dashboard: DashboardGenerationResult }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {dashboard.template.previewMetrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {metric.label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{metric.value}</p>
          <p className="text-xs text-zinc-600">{metric.note}</p>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ card }: { card: DashboardChartCard }) {
  return (
    <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
            {card.type}
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-zinc-900">{card.title}</h3>
        </div>
        <Tag tone="zinc">{card.freshness}</Tag>
      </div>
      <MiniBar card={card} />
      <p className="mt-3 text-sm text-zinc-700">{card.insight}</p>
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
          Sales action
        </p>
        <p className="mt-0.5 text-sm text-blue-900">{card.salesAction}</p>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Source: {card.source}</p>
    </article>
  )
}

export function DashboardGeneratorPage() {
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [dashboard, setDashboard] = useState<DashboardGenerationResult>(initialDashboard)
  const [isBuilding, setIsBuilding] = useState(false)
  const [enabledFeatures, setEnabledFeatures] = useState<GeneratedFeatureId[]>(
    initialDashboard.template.defaultFeatures,
  )
  const [ozAnswer, setOzAnswer] = useState(ozAnswers.opportunity)
  const [excelPreview, setExcelPreview] = useState(() =>
    buildExcelPreview(excelDashboardMapping.sourceFile),
  )

  const activeFeatures = useMemo(() => new Set(enabledFeatures), [enabledFeatures])

  useEffect(() => {
    if (!isBuilding) return
    const timeout = window.setTimeout(() => setIsBuilding(false), 450)
    return () => window.clearTimeout(timeout)
  }, [isBuilding])

  function generate(nextPrompt = prompt) {
    const next = generateDashboardFromPrompt(nextPrompt)
    setPrompt(nextPrompt)
    setDashboard(next)
    setEnabledFeatures((current) => [
      ...new Set([...current, ...next.template.defaultFeatures]),
    ])
    setIsBuilding(true)
  }

  function selectTemplate(template: GeneratedWebAppTemplate) {
    const nextPrompt = `Generate ${template.name}: ${template.description}`
    generate(nextPrompt)
  }

  function toggleFeature(featureId: GeneratedFeatureId) {
    setEnabledFeatures((current) =>
      current.includes(featureId)
        ? current.filter((id) => id !== featureId)
        : [...current, featureId],
    )
  }

  function handleExcelUpload(fileList: FileList | null) {
    const fileName = fileList?.[0]?.name ?? excelDashboardMapping.sourceFile
    setExcelPreview(buildExcelPreview(fileName))
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          eyebrow="Prompt"
          title="Generate a dashboard"
          description="Describe the dashboard you want or pick a template. Oz keeps every card cited to demo records."
          action={isBuilding ? <Tag tone="blue" dot>Building</Tag> : <Tag tone="emerald" dot>Ready</Tag>}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="dashboard-prompt" className="sr-only">
              Dashboard prompt
            </label>
            <input
              id="dashboard-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <Button onClick={() => generate()}>Generate dashboard</Button>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Template
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {webAppTemplates.map((template) => {
                const active = template.id === dashboard.template.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-label={`Generate ${template.name}`}
                    aria-pressed={active}
                    onClick={() => selectTemplate(template)}
                    className={joinClasses(
                      'rounded-xl border p-3 text-left transition-colors',
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-zinc-200 bg-white hover:border-blue-200 hover:bg-blue-50/40',
                    )}
                  >
                    <p className="text-sm font-semibold text-zinc-900">{template.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{template.modules.length} modules</p>
                  </button>
                )
              })}
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Generated"
          title={dashboard.generatedTitle}
          description={dashboard.template.description}
          action={<Tag tone="zinc">Audience: {dashboard.audience}</Tag>}
        >
          <MetricStrip dashboard={dashboard} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          {dashboard.modules.map((card) => (
            <ChartCard key={card.id} card={card} />
          ))}
        </div>

        <Panel
          eyebrow="Confidence"
          title="Sources, recommendations, and freshness"
          description={dashboard.sourceSummary}
          action={<Tag tone="zinc">Generated {dashboard.generatedAt}</Tag>}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {dashboard.recommendedActions.map((action) => (
              <div
                key={`${action.owner}-${action.due}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <p className="text-sm font-semibold text-zinc-900">{action.owner}</p>
                <p className="mt-1 text-sm text-zinc-700">{action.action}</p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Due {action.due} · {action.sourceCue}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4">
        <Panel eyebrow="Oz Q&A" title="Ask about this dashboard">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm text-zinc-800">{ozAnswer}</p>
          </div>
          <div className="mt-3 grid gap-2">
            {[
              ['What is the biggest opportunity?', 'opportunity'],
              ['Which accounts should we call first?', 'accounts'],
              ['What changed this month?', 'changed'],
              ['What products should we promote?', 'promote'],
            ].map(([label, key]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOzAnswer(ozAnswers[key])}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                {label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Add-ons" title="Attach features">
          <div className="grid gap-2">
            {featureAddOns.map((addOn) => {
              const active = activeFeatures.has(addOn.id)
              return (
                <button
                  key={addOn.id}
                  type="button"
                  onClick={() => toggleFeature(addOn.id)}
                  className={joinClasses(
                    'flex flex-col rounded-xl border p-3 text-left transition-colors',
                    active
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-zinc-200 bg-white hover:border-blue-200 hover:bg-blue-50/40',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{addOn.name}</span>
                    <Tag tone={active ? 'emerald' : 'zinc'} dot={active}>
                      {active ? 'Active' : 'Add'}
                    </Tag>
                  </span>
                  <span className="mt-1 text-xs text-zinc-600">{addOn.description}</span>
                </button>
              )
            })}
          </div>

          {activeFeatures.has('ai_chat') && (
            <FeatureCallout title="AI chat feature active">
              Oz now offers contextual answers and suggested follow-up prompts beside the dashboard.
            </FeatureCallout>
          )}

          {activeFeatures.has('dynamic_graph_generation') && (
            <FeatureCallout title="Dynamic graph generation active">
              <ul className="space-y-1 text-sm text-blue-900/85">
                <li>Generate demand trend chart</li>
                <li>Generate complaint-by-region chart</li>
                <li>Generate competitor-pressure chart</li>
              </ul>
            </FeatureCallout>
          )}

          {activeFeatures.has('excel_to_dashboard') && (
            <FeatureCallout title="Excel import active">
              <label
                htmlFor="excel-dashboard-upload"
                className="mt-2 block cursor-pointer rounded-lg border border-dashed border-blue-300 bg-white p-3 text-center text-sm text-blue-800 transition hover:border-blue-400 hover:bg-blue-50"
              >
                Drop {excelDashboardMapping.sourceFile} here or choose an Excel file
                <span className="mt-0.5 block text-xs text-zinc-500">
                  Parsing is mocked for the demo.
                </span>
              </label>
              <input
                id="excel-dashboard-upload"
                type="file"
                accept=".xls,.xlsx,.xlsm"
                className="sr-only"
                aria-label="Upload Excel source file"
                onChange={(event) => handleExcelUpload(event.currentTarget.files)}
              />
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Mock parsed preview
                </p>
                <p className="mt-1 text-zinc-900">{excelPreview.fileName}</p>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {excelPreview.parsedSheets.join(', ')} · {excelPreview.mappedColumnCount} mapped
                  columns · {excelPreview.generatedModuleCount} generated modules
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {excelDashboardMapping.sheets.map((sheet) => (
                  <li key={sheet.sheetName}>
                    {sheet.sheetName}: mapped {Object.keys(sheet.columnMappings).length} columns
                  </li>
                ))}
              </ul>
            </FeatureCallout>
          )}
        </Panel>
      </aside>
    </div>
  )
}

function FeatureCallout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <p className="text-sm font-semibold text-blue-900">{title}</p>
      <div className="mt-2 text-sm text-blue-900/85">{children}</div>
    </div>
  )
}
