import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { excelDashboardMapping, featureAddOns, webAppTemplates } from './dashboardData'
import {
  detectRequestedFeature,
  generateDashboardFromPrompt,
  selectTemplateForPrompt,
} from './dashboardGenerator'
import type {
  DashboardChartCard,
  DashboardGenerationResult,
  GeneratedFeatureId,
  GeneratedWebAppTemplate,
} from './types'

const defaultPrompt =
  'Generate a dashboard with top product requests, complaints, competitor pressure, and next best actions.'

const initialDashboard = generateDashboardFromPrompt(defaultPrompt)

const featureRequestPrompts: Record<GeneratedFeatureId, string> = {
  ai_chat: 'Add an AI chat feature to this dashboard.',
  dynamic_graph_generation: 'Add dynamic graph generation.',
  excel_to_dashboard: 'Turn this Excel file into a dashboard.',
}

const ozAnswers: Record<string, string> = {
  opportunity:
    'The biggest opportunity is Russin Lumber. Record int_001 has a composite decking request, a TimberTech comparison, and a clear callback path for a bundle quote.',
  accounts:
    'Call Russin Lumber and Hudson Valley Supply first because both records combine product demand, complaints, and competitor pressure. North Ridge Builders is the clean upsell follow-up for hidden fasteners.',
  changed:
    'The April source set shifted from a phone call to an in-person note and then a Zoom recap email, giving the dashboard one record each across calls, notes, and emails.',
  promote:
    'Promote composite decking, hidden fasteners, and exterior trim. Those are the exact product requests in int_001, int_002, and int_003.',
}

function buildMockExcelPreview(fileName: string) {
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

function MiniBarChart({ card }: { card: DashboardChartCard }) {
  const maxValue = Math.max(...card.data.map((item) => item.value), 1)

  return (
    <div className="mt-4 space-y-3">
      {card.data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-zinc-200">{item.label}</span>
            <span className="font-mono text-zinc-400">{item.trend ?? item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#23B8FF] to-[#E10600]"
              style={{ width: `${Math.max(12, (item.value / maxValue) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricStrip({ dashboard }: { dashboard: DashboardGenerationResult }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {dashboard.template.previewMetrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-blue-950/20"
        >
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{metric.value}</p>
          <p className="mt-1 text-sm text-zinc-400">{metric.note}</p>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ card }: { card: DashboardChartCard }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-[#080A12]/90 p-5 shadow-2xl shadow-black/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#23B8FF]">{card.type}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{card.title}</h3>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400">
          {card.freshness}
        </span>
      </div>
      <MiniBarChart card={card} />
      <p className="mt-4 text-sm leading-6 text-zinc-300">{card.insight}</p>
      <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
          Sales action
        </p>
        <p className="mt-1 text-sm text-white">{card.salesAction}</p>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Source: {card.source}</p>
    </article>
  )
}

function BuildRail({ template }: { template: GeneratedWebAppTemplate }) {
  return (
    <div className="rounded-3xl border border-blue-400/20 bg-blue-500/10 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-blue-200">Oz is building</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {template.buildSteps.map((step) => (
          <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[#23B8FF]" />
            </div>
            <p className="text-sm text-zinc-100">{step}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardGeneratorPage() {
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [dashboard, setDashboard] = useState<DashboardGenerationResult>(initialDashboard)
  const [isBuilding, setIsBuilding] = useState(false)
  const [enabledFeatures, setEnabledFeatures] = useState<GeneratedFeatureId[]>(
    initialDashboard.template.defaultFeatures,
  )
  const [appPrompt, setAppPrompt] = useState('Generate a web app from this dashboard.')
  const [chatMessages, setChatMessages] = useState<string[]>([
    'Oz: Tell me the app you want, or ask me to add AI chat, dynamic graphs, or Excel import.',
  ])
  const [ozAnswer, setOzAnswer] = useState(ozAnswers.opportunity)
  const [excelPreview, setExcelPreview] = useState(() =>
    buildMockExcelPreview(excelDashboardMapping.sourceFile),
  )

  const activeFeatureSet = useMemo(() => new Set(enabledFeatures), [enabledFeatures])

  useEffect(() => {
    if (!isBuilding) return

    const timeout = window.setTimeout(() => {
      setIsBuilding(false)
    }, 450)

    return () => window.clearTimeout(timeout)
  }, [isBuilding])

  function runDashboardGeneration(nextPrompt = prompt) {
    const nextDashboard = generateDashboardFromPrompt(nextPrompt)
    setPrompt(nextPrompt)
    setDashboard(nextDashboard)
    setEnabledFeatures((current) => [
      ...new Set([...current, ...nextDashboard.template.defaultFeatures]),
    ])
    setIsBuilding(true)
  }

  function enableFeature(featureId: GeneratedFeatureId) {
    setEnabledFeatures((current) =>
      current.includes(featureId) ? current : [...current, featureId],
    )
  }

  function handleAddOnRequest(featureId: GeneratedFeatureId) {
    enableFeature(featureId)
    const feature = featureAddOns.find((addOn) => addOn.id === featureId)
    setChatMessages((current) => [
      ...current,
      `User: ${featureRequestPrompts[featureId]}`,
      `Oz: ${feature?.enabledStateLabel ?? 'Feature enabled.'}`,
    ])
  }

  function handleAppRequest() {
    const requestedFeature = detectRequestedFeature(appPrompt)

    if (requestedFeature) {
      handleAddOnRequest(requestedFeature)
      return
    }

    const selectedTemplate = selectTemplateForPrompt(appPrompt)
    const nextPrompt = `Generate ${selectedTemplate.name} from this dashboard. ${appPrompt}`
    runDashboardGeneration(nextPrompt)
    setChatMessages((current) => [
      ...current,
      `User: ${appPrompt}`,
      `Oz: Generated ${selectedTemplate.name} with fixed demo modules and seed data.`,
    ])
  }

  function handleTemplateSelect(template: GeneratedWebAppTemplate) {
    const nextPrompt = `Generate ${template.name} for ${template.description}`
    runDashboardGeneration(nextPrompt)
    setChatMessages((current) => [
      ...current,
      `User: Generate ${template.name}.`,
      `Oz: ${template.name} is ready as a hard-coded web app template.`,
    ])
  }

  function handleExcelPreview(fileList: FileList | null) {
    const fileName = fileList?.[0]?.name ?? excelDashboardMapping.sourceFile

    setExcelPreview(buildMockExcelPreview(fileName))
    setChatMessages((current) => [
      ...current,
      `User: Uploaded ${fileName}`,
      `Oz: Mock parsed ${fileName} into ${excelDashboardMapping.sheets.length} sheets and ${excelDashboardMapping.generatedModules.length} dashboard modules.`,
    ])
  }

  return (
    <div className="min-h-full bg-[#030407] p-6 text-zinc-100">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#07172F]/70 p-6 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#23B8FF]">
                Dashboard generation
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">
                Prompt-driven sales command center
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Oz turns calls, field notes, emails, and quote signals into an executive-ready
                dashboard with visible source confidence and concrete sales actions.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-300">
              {dashboard.sourceSummary}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/30 p-3 md:flex-row">
            <label className="sr-only" htmlFor="dashboard-prompt">
              Dashboard prompt
            </label>
            <input
              id="dashboard-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-[#080A12] px-4 text-sm text-white outline-none ring-[#23B8FF]/40 placeholder:text-zinc-600 focus:ring-2"
            />
            <Button
              type="button"
              onClick={() => runDashboardGeneration()}
              className="rounded-2xl bg-[#E10600] px-6 hover:bg-[#FF3B00]"
            >
              Generate dashboard
            </Button>
          </div>
        </section>

        {isBuilding && <BuildRail template={dashboard.template} />}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <main className="flex min-w-0 flex-col gap-6">
            <section className="rounded-[2rem] border border-white/10 bg-[#080A12] p-5">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                    Generated web app
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {dashboard.generatedTitle}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                    {dashboard.template.description}
                  </p>
                </div>
                <div className={`rounded-2xl bg-gradient-to-r ${dashboard.template.accent} p-px`}>
                  <div className="rounded-2xl bg-black/80 px-4 py-3 text-sm">
                    <p className="text-zinc-400">Audience</p>
                    <p className="font-semibold text-white">{dashboard.audience}</p>
                  </div>
                </div>
              </div>
              <MetricStrip dashboard={dashboard} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {dashboard.modules.map((card) => (
                <ChartCard key={card.id} card={card} />
              ))}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-[#07172F]/70 p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#23B8FF]">
                    Data confidence
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    Source and freshness cues
                  </h2>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-zinc-300">
                  Generated {dashboard.generatedAt}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {dashboard.recommendedActions.map((action) => (
                  <div key={`${action.owner}-${action.due}`} className="rounded-2xl bg-black/30 p-4">
                    <p className="text-sm font-semibold text-white">{action.owner}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{action.action}</p>
                    <p className="mt-3 text-xs text-zinc-500">
                      Due {action.due} · {action.sourceCue}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside className="flex flex-col gap-6">
            <section className="rounded-[2rem] border border-white/10 bg-[#080A12] p-5 shadow-2xl shadow-black/30">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[radial-gradient(circle_at_30%_30%,#F5F7FF,#23B8FF_35%,#07172F_70%)] shadow-lg shadow-blue-500/40" />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#23B8FF]">Oz Q&A</p>
                  <h2 className="text-lg font-semibold text-white">Ask about this dashboard</h2>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm leading-6 text-zinc-200">{ozAnswer}</p>
              </div>
              <div className="mt-4 grid gap-2">
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
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm text-zinc-300 transition hover:border-blue-400/50 hover:text-white"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-[#080A12] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-red-200">
                Lovable-style app builder
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Generate a web app</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {webAppTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-[#23B8FF]/60"
                    aria-label={`Generate ${template.name}`}
                  >
                    <span className="block text-sm font-semibold text-white">{template.name}</span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {template.modules.length} modules
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                <label className="sr-only" htmlFor="app-builder-prompt">
                  App builder prompt
                </label>
                <textarea
                  id="app-builder-prompt"
                  value={appPrompt}
                  onChange={(event) => setAppPrompt(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none ring-[#23B8FF]/40 focus:ring-2"
                />
                <Button
                  type="button"
                  onClick={handleAppRequest}
                  className="mt-3 w-full rounded-xl bg-[#E10600] hover:bg-[#FF3B00]"
                >
                  Send to app builder
                </Button>
              </div>
              <div className="mt-4 space-y-2" aria-label="App builder transcript">
                {chatMessages.slice(-4).map((message, index) => (
                  <p key={`${message}-${index}`} className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
                    {message}
                  </p>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-[#080A12] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#23B8FF]">
                Simulated add-ons
              </p>
              <div className="mt-4 grid gap-3">
                {featureAddOns.map((addOn) => (
                  <button
                    key={addOn.id}
                    type="button"
                    onClick={() => handleAddOnRequest(addOn.id)}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-blue-400/50"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{addOn.name}</span>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-zinc-300">
                        {activeFeatureSet.has(addOn.id) ? 'Active' : 'Add'}
                      </span>
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-zinc-400">
                      {addOn.description}
                    </span>
                  </button>
                ))}
              </div>

              {activeFeatureSet.has('ai_chat') && (
                <div className="mt-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4">
                  <p className="font-semibold text-white">AI chat feature active</p>
                  <p className="mt-2 text-sm text-zinc-300">
                    Oz now offers contextual answers and suggested follow-up prompts beside the app.
                  </p>
                </div>
              )}

              {activeFeatureSet.has('dynamic_graph_generation') && (
                <div className="mt-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4">
                  <p className="font-semibold text-white">Dynamic graph generation active</p>
                  <div className="mt-3 grid gap-2 text-sm text-zinc-300">
                    <span>Generate demand trend chart</span>
                    <span>Generate complaint-by-region chart</span>
                    <span>Generate competitor-pressure chart</span>
                  </div>
                </div>
              )}

              {activeFeatureSet.has('excel_to_dashboard') && (
                <div className="mt-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4">
                  <p className="font-semibold text-white">Excel import active</p>
                  <label
                    htmlFor="excel-dashboard-upload"
                    className="mt-3 block cursor-pointer rounded-xl border border-dashed border-white/20 bg-black/30 p-4 text-center text-sm text-zinc-300 transition hover:border-blue-300/70 hover:text-white"
                  >
                    Drop {excelDashboardMapping.sourceFile} here or choose an Excel file
                    <span className="mt-1 block text-xs text-zinc-500">
                      Parsing is mocked for demo; selecting a file refreshes the preview below.
                    </span>
                  </label>
                  <input
                    id="excel-dashboard-upload"
                    type="file"
                    accept=".xls,.xlsx,.xlsm"
                    className="sr-only"
                    aria-label="Upload Excel source file"
                    onChange={(event) => handleExcelPreview(event.currentTarget.files)}
                  />
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-blue-200">
                      Mock parsed preview
                    </p>
                    <p className="mt-2 text-sm text-white">{excelPreview.fileName}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {excelPreview.parsedSheets.join(', ')} · {excelPreview.mappedColumnCount}{' '}
                      mapped columns · {excelPreview.generatedModuleCount} generated modules
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {excelDashboardMapping.sheets.map((sheet) => (
                      <p key={sheet.sheetName} className="text-sm text-zinc-300">
                        {sheet.sheetName}: mapped {Object.keys(sheet.columnMappings).length} columns
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
