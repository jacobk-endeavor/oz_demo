import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  fieldMobileNavItems,
  fieldWorkflowIdForPage,
  isFieldMobileNavId,
} from './features/fieldApp/fieldAppSidebarNav'
import { FieldAppView } from './features/fieldApp/FieldAppView'
import { getFieldMobileWorkflow } from './features/fieldApp/fieldMobileWorkflows'
import {
  applyLeadTableView,
  defaultLeadTableViewState,
  matchMilwaukeeLeadGridIntent,
  processLeadTableChat,
} from './features/leadGen/leadGenTableModel'
import {
  matchStockUpLikelyBuyersIntent,
  pickDescriptionFilterNeedle,
} from './features/leadGen/stockUpBuyerIntents'
import { interpretLeadTableWithLlm } from './features/leadGen/interpretLeadTableWithLlm'
import { buildLeadTableLlmContext } from './features/leadGen/leadTableLlmContext'
import type { SortColumn } from './features/leadGen/leadGenTableModel'
import { buildMilwaukeeDistributorRows } from './features/leadGen/milwaukeeDistributorsMock'
import { LeadGenDistributorsTable } from './features/leadGen/LeadGenDistributorsTable'
import { CompetitorOffersTable } from './features/lumberyard/CompetitorOffersTable'
import { CompetitorSearchInterstitial } from './features/lumberyard/CompetitorSearchInterstitial'
import {
  COMPETITOR_SEARCH_MIN_DISPLAY_MS,
  withMinDuration,
} from './features/lumberyard/competitorSearchTiming'
import { postCompetitorOffers } from './features/lumberyard/competitorOffersClient'
import type { CompetitorOfferRow } from './features/lumberyard/competitorOffersTypes'
import { matchCompetitorProductSearchIntent } from './features/lumberyard/competitorProductIntents'
import { LumberyardCallsTable } from './features/lumberyard/LumberyardCallsTable'
import { makeLeadTableAttachment } from './features/leadGen/leadTableComposerContext'
import { makeCompetitorOfferAttachment } from './features/lumberyard/competitorComposerContext'
import { makeLumberyardAttachment } from './features/lumberyard/lumberyardComposerContext'
import { fetchLumberyardLibrary, postLumberyardIntel } from './features/lumberyard/lumberyardClient'
import {
  matchLumberyardAnalyticsOrResearchIntent,
  matchLumberyardTableIntent,
} from './features/lumberyard/lumberyardIntents'
import type { DistributorRow } from './features/leadGen/milwaukeeDistributorsMock'
import type { LumberyardCallRow } from './features/lumberyard/lumberyardTypes'
import {
  buildOzGptSystemPrompt,
  fetchOpenAiChatCompletion,
  isOpenAiConfigured,
  type OzOpenAiMessage,
} from './services/ozOpenAi'
import { evaluateBackgroundAgentWithLlm } from './features/backgroundAgents/backgroundAgentAi'
import { connectionsForAgentRecord } from './features/backgroundAgents/backgroundAgentConnections'
import { BackgroundAgentConnectingToast } from './features/backgroundAgents/BackgroundAgentConnectingToast'
import {
  appendBackgroundAgent,
  backgroundAgentDisplayName,
  deleteBackgroundAgent,
  matchBackgroundAgentIntent,
  readBackgroundAgents,
  tryCompleteBackgroundRequest,
  type BackgroundAgentFlowState,
} from './features/backgroundAgents/backgroundAgentModel'
import { BackgroundAgentsPage } from './features/backgroundAgents/BackgroundAgentsPage'
import { KnowledgeBasePage } from './features/oz/KnowledgeBasePage'
import { DashboardGeneratorPage } from './features/dashboardGenerator/DashboardGeneratorPage'
import { FieldNotesPage } from './features/fieldNotes/FieldNotesPage'
import { QuotesReadyForReviewPage } from './features/quotesReady/QuotesReadyForReviewPage'
import { QuoteAutomationWorkspace } from './features/quoteAutomation/QuoteAutomationWorkspace'
import { CustomerDemandAndProfitContextPanel } from './features/dashboardGenerator/CustomerDemandAndProfitContextPanel'
import { matchProductRequestCustomerDashboardIntent } from './features/dashboardGenerator/productRequestDashboardIntent'
import {
  matchProfitByProductGraphIntent,
  matchWarehouseBackfillPnlIntent,
} from './features/dashboardGenerator/profitGraphIntent'
import {
  joinClasses,
  OzAssistantPanel,
  OzWorkflowShell,
  PlaceholderSubtabPage,
  type OzAssistantMessage,
  type OzChatTurnContext,
} from './shared/ui'
import { augmentUserMessageWithTableContext, type TableRowContextAttachment } from './shared/tableRowContext'
import type { FieldMobileNavId, OzWorkflowNavId } from './shared/ui'

const OZ_ASSISTANT_NO_SEED: OzAssistantMessage[] = []

export type Page = OzWorkflowNavId

const allPages = new Set<Page>([
  'oz',
  'search',
  'field-app',
  ...fieldMobileNavItems.map((e) => e.id),
  'tables',
  'files',
  'knowledge-base',
  'nebula',
  'field-notes',
  'quotes-ready',
  'dashboards',
  'quote-automation',
  'lead-generation',
  'background-agents',
  'help',
  'settings',
])

interface PageMeta {
  title: string
  subtitle?: string
  eyebrow?: string
}

const pageMeta: Record<Exclude<Page, FieldMobileNavId>, PageMeta> = {
  oz: {
    eyebrow: 'Command center',
    title: 'Oz',
    subtitle:
      'Chat is front and center. After a competitor product search on activity, ask who is likely to buy if you stock those lines—the lead grid opens with a demo filter (not a Milwaukee-only look-up).',
  },
  search: {
    eyebrow: 'Workspace',
    title: 'Search',
    subtitle: 'Search across tables, files, and logs — wire to your index when you are ready.',
  },
  'field-app': {
    eyebrow: 'Workspace',
    title: 'Field App',
    subtitle: 'Voice-only. Home is the orb.',
  },
  tables: {
    eyebrow: 'Workspace',
    title: 'Tables',
    subtitle:
      'The Milwaukee distributor lead grid stays open here. Chat to sort, sub-sort, filter by source, or say “find more leads”.',
  },
  files: {
    eyebrow: 'Workspace',
    title: 'Files',
    subtitle: 'Uploads and exports tied to this workspace.',
  },
  'knowledge-base': {
    eyebrow: 'Workspace',
    title: 'Knowledge Base',
    subtitle: 'Add files from your machine; each one is ingested and shown as a table.',
  },
  nebula: {
    eyebrow: 'Workflow',
    title: 'Overview',
    subtitle: 'Nebula hub — pick a workflow below in the sidebar or ask Oz to route you.',
  },
  'field-notes': {
    eyebrow: 'Workflow',
    title: 'Field Notes',
    subtitle: 'Turn messy visit context into sharper next questions and product recommendations.',
  },
  'quotes-ready': {
    eyebrow: 'Workflow',
    title: 'Quotes Ready for Review',
    subtitle: 'Order-background PDFs from the Field App with a review code — open and proof before quote automation.',
  },
  dashboards: {
    eyebrow: 'Workflow',
    title: 'Dashboards',
    subtitle: 'Describe charts in natural language, then publish individual charts to a mock link.',
  },
  'quote-automation': {
    eyebrow: 'Workflow',
    title: 'Quote Automation',
    subtitle: 'Review specs, assumptions, and pricing evidence before sending an 80%-complete quote.',
  },
  'lead-generation': {
    eyebrow: 'Workflow',
    title: 'Lead Generation',
    subtitle: 'Find lookalike accounts near tomorrow’s route and convert them into concrete visits.',
  },
  'background-agents': {
    eyebrow: 'Workflow',
    title: 'Background agents',
    subtitle: 'Automations you define in chat: each agent shows what it does and when it runs.',
  },
  help: {
    title: 'Help',
    subtitle: 'Documentation and support — replace with your help center when you are ready.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Workspace and profile preferences (shell only in this demo).',
  },
}

function isPage(value: string): value is Page {
  return allPages.has(value as Page)
}

function getPageMeta(p: Page): PageMeta {
  if (isFieldMobileNavId(p)) {
    const w = getFieldMobileWorkflow(fieldWorkflowIdForPage(p))!
    return {
      eyebrow: 'Field (mobile workflow)',
      title: w.shortTitle,
      subtitle: w.summary,
    }
  }
  return pageMeta[p as keyof typeof pageMeta]
}

function isFieldAppCommandCenter(p: Page): boolean {
  return p === 'field-app' || isFieldMobileNavId(p)
}

// eslint-disable-next-line react-refresh/only-export-components
export function getHashPage(): Page {
  const hashPath = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  if (hashPath === '') return 'oz'
  return isPage(hashPath) ? hashPath : 'oz'
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHashRoute(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(getHashPage)

  useEffect(() => {
    function onHashChange() {
      setPage(getHashPage())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(p: Page) {
    setPage(p)
    window.location.hash = `#/${p}`
  }

  return [page, navigate]
}

/** Chat-first with no right-hand column until a chat action opens a context surface (e.g. lead gen on Home). */
function isCommandCenterFirstPage(p: Page): boolean {
  return p === 'oz' || isFieldAppCommandCenter(p)
}

function isLeadTableChatPage(p: Page): boolean {
  return p === 'oz' || p === 'tables' || p === 'lead-generation'
}

export default function App() {
  const [page, navigate] = useHashRoute()
  const [leadGenContextOpen, setLeadGenContextOpen] = useState(false)
  /** Single column: demand index, optional P&L when the user asked for profit in chat. */
  const [ozCustomerDemandProfitOpen, setOzCustomerDemandProfitOpen] = useState(false)
  const [ozCustomerPanelIncludePnl, setOzCustomerPanelIncludePnl] = useState(false)
  /** Shown under the chart strip after **Export** (new **Your charts** group queued for Dashboards). */
  const [chatExportNotices, setChatExportNotices] = useState<{ id: string; label: string }[]>([])
  const [lumberyardOpen, setLumberyardOpen] = useState(false)
  /** While true, the lumberyard data table in context stays hidden (during the KB source icon sequence). */
  const [lumberyardKbHidingContext, setLumberyardKbHidingContext] = useState(false)
  const [competitorOffersOpen, setCompetitorOffersOpen] = useState(false)
  /** “Searching the web” interstitial while `postCompetitorOffers` runs (with a minimum display time). */
  const [competitorOffersSearching, setCompetitorOffersSearching] = useState(false)
  const [competitorOfferRows, setCompetitorOfferRows] = useState<CompetitorOfferRow[]>([])
  const [competitorOffersMeta, setCompetitorOffersMeta] = useState<{
    usedWebSearch: boolean
    productQueries: string[]
  }>({ usedWebSearch: false, productQueries: [] })
  const backgroundAgentFlowRef = useRef<BackgroundAgentFlowState>({ kind: 'idle' })
  const [backgroundAgents, setBackgroundAgents] = useState(() => readBackgroundAgents())
  const [backgroundAgentConnecting, setBackgroundAgentConnecting] = useState<{
    agentName: string
    connections: ReturnType<typeof connectionsForAgentRecord>
  } | null>(null)
  const [lumberyardCalls, setLumberyardCalls] = useState<LumberyardCallRow[]>([])
  const [tableChatAttachments, setTableChatAttachments] = useState<TableRowContextAttachment[]>([])
  const [tableView, setTableView] = useState(() => defaultLeadTableViewState())
  const viewRef = useRef(tableView)
  const lumberyardOpenRef = useRef(false)

  useEffect(() => {
    viewRef.current = tableView
  }, [tableView])
  useEffect(() => {
    lumberyardOpenRef.current = lumberyardOpen
  }, [lumberyardOpen])
  const lumberyardCallsRef = useRef<LumberyardCallRow[]>([])
  /** Product lines from the last successful competitor search; drives “likely buyers if we stock” lead filter. */
  const lastCompetitorProductQueriesRef = useRef<string[]>([])
  useEffect(() => {
    lumberyardCallsRef.current = lumberyardCalls
  }, [lumberyardCalls])

  useEffect(() => {
    const ids = new Set(lumberyardCalls.map((c) => c.id))
    setTableChatAttachments((prev) => prev.filter((a) => a.scope !== 'lumberyard' || ids.has(a.rowId)))
  }, [lumberyardCalls])

  useEffect(() => {
    const ids = new Set(competitorOfferRows.map((r) => r.id))
    setTableChatAttachments((prev) => prev.filter((a) => a.scope !== 'competitor' || ids.has(a.rowId)))
  }, [competitorOfferRows])

  const toggleLumberyardRowContext = useCallback((row: LumberyardCallRow, displayIndex: number) => {
    const k = `lumberyard:${row.id}`
    setTableChatAttachments((prev) => {
      if (prev.some((p) => p.key === k)) return prev.filter((p) => p.key !== k)
      return [...prev, makeLumberyardAttachment(row, displayIndex)]
    })
  }, [])

  const toggleCompetitorRowContext = useCallback((row: CompetitorOfferRow, displayIndex: number) => {
    const k = `competitor:${row.id}`
    setTableChatAttachments((prev) => {
      if (prev.some((p) => p.key === k)) return prev.filter((p) => p.key !== k)
      return [...prev, makeCompetitorOfferAttachment(row, displayIndex)]
    })
  }, [])

  const toggleLeadRowContext = useCallback((row: DistributorRow, displayIndex: number) => {
    const k = `lead:${row.linkedInUrl}`
    setTableChatAttachments((prev) => {
      if (prev.some((p) => p.key === k)) return prev.filter((p) => p.key !== k)
      return [...prev, makeLeadTableAttachment(row, displayIndex)]
    })
  }, [])

  const baseRows = useMemo(
    () => buildMilwaukeeDistributorRows(tableView.dataset),
    [tableView.dataset],
  )
  const displayRows = useMemo(
    () => applyLeadTableView(baseRows, tableView),
    [baseRows, tableView],
  )

  useEffect(() => {
    const urls = new Set(displayRows.map((r) => r.linkedInUrl))
    setTableChatAttachments((prev) => prev.filter((a) => a.scope !== 'lead' || urls.has(a.rowId)))
  }, [displayRows])

  const handleTableSort = useCallback((col: SortColumn) => {
    setTableView((v) => {
      const next = { ...v, phaseToken: v.phaseToken + 1 }
      if (v.sortPrimary === col) {
        next.sortPrimaryDir = v.sortPrimaryDir === 'asc' ? 'desc' : 'asc'
      } else {
        next.sortPrimary = col
        next.sortPrimaryDir = 'asc'
      }
      return next
    })
  }, [])

  const handleTableRefresh = useCallback(() => {
    setTableView((v) => ({ ...v, phaseToken: v.phaseToken + 1 }))
  }, [])

  const recordChatExportNotice = useCallback((label: string) => {
    setChatExportNotices((prev) => [...prev.slice(-5), { id: `exp-${Date.now()}`, label }])
  }, [])

  const pendingLumberyardKnowledgeUi = useCallback(
    (userText: string): 'thinking' | 'knowledge_base' => {
      if (!isOpenAiConfigured()) return 'thinking'
      if (!isLeadTableChatPage(page)) return 'thinking'
      if (isFieldAppCommandCenter(page)) return 'thinking'
      if (matchProfitByProductGraphIntent(userText)) return 'thinking'
      if (matchWarehouseBackfillPnlIntent(userText)) return 'thinking'
      if (matchProductRequestCustomerDashboardIntent(userText)) return 'thinking'
      if (matchMilwaukeeLeadGridIntent(userText)) return 'thinking'
      if (page === 'oz' && matchStockUpLikelyBuyersIntent(userText)) return 'thinking'
      if (page === 'oz' && matchCompetitorProductSearchIntent(userText)) return 'knowledge_base'
      const wantLumber =
        (matchLumberyardTableIntent(userText) ||
          matchLumberyardAnalyticsOrResearchIntent(userText) ||
          lumberyardOpenRef.current)
      return wantLumber ? 'knowledge_base' : 'thinking'
    },
    [page],
  )

  const onUserMessage = useCallback(
    async (text: string, context: OzChatTurnContext) => {
      if (isFieldAppCommandCenter(page)) return
      if (!isLeadTableChatPage(page)) return

      const flow = backgroundAgentFlowRef.current
      const inCollecting = flow.kind === 'collecting'
      if (inCollecting || matchBackgroundAgentIntent(text)) {
        const prior = inCollecting ? { what: flow.partialWhat, when: flow.partialWhen } : null
        const r = tryCompleteBackgroundRequest(prior, text)

        if (isOpenAiConfigured()) {
          try {
            const priorLines = context.priorExchanges
              .slice(-8)
              .map((e) => `${e.role === 'user' ? 'user' : e.role === 'oz' ? 'assistant' : 'context'}: ${e.text}`)
            const recentContext = [...priorLines, `user: ${text}`].join('\n')
            const p = r.ok ? { what: r.what, when: r.when } : r.partial
            const ev = await evaluateBackgroundAgentWithLlm({
              lastUserMessage: text,
              heuristicWhat: p.what,
              heuristicWhen: p.when,
              recentContext,
            })
            if (!ev.sufficient) {
              backgroundAgentFlowRef.current = {
                kind: 'collecting',
                needWhat: r.ok ? false : r.needWhat,
                needWhen: r.ok ? false : r.needWhen,
                partialWhat: p.what,
                partialWhen: p.when,
              }
              const qBlock = ev.questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n\n')
              return {
                reply: `To finish configuring this **background agent**, I need a bit more:\n\n${qBlock}\n\nReply in your next message and I will save the agent.`,
                delayMs: 0,
                stream: false,
              }
            }
            backgroundAgentFlowRef.current = { kind: 'idle' }
            const e = ev.enriched
            const rec = appendBackgroundAgent(e.assignment, e.schedule, {
              taskTitle: e.taskTitle,
              taskDetail: e.taskDetail,
              deliverable: e.deliverable,
              companies: e.companies,
            })
            setBackgroundAgents((prev) => [rec, ...prev])
            setBackgroundAgentConnecting({
              agentName: backgroundAgentDisplayName(rec),
              connections: connectionsForAgentRecord(rec),
            })
            return {
              reply: `**${e.taskTitle}** is saved. **Schedule:** ${e.scheduleDisplay}. **Outcome:** ${e.deliverable}\n\nOpen **Workflows → Background agents** to see the full card, **Connections** logos, and schedule details.`,
              delayMs: 200,
              stream: false,
            }
          } catch {
            if (r.ok) {
              backgroundAgentFlowRef.current = { kind: 'idle' }
              const rec = appendBackgroundAgent(r.what, r.when)
              setBackgroundAgents((prev) => [rec, ...prev])
              setBackgroundAgentConnecting({
                agentName: backgroundAgentDisplayName(rec),
                connections: connectionsForAgentRecord(rec),
              })
              return {
                reply: `**Background agent saved** (using your wording only — the AI check was skipped). It will: **${r.what}** on **${r.when}**. Open **Workflows → Background agents** to review.`,
                delayMs: 200,
                stream: false,
              }
            }
          }
        }

        if (!r.ok) {
          backgroundAgentFlowRef.current = {
            kind: 'collecting',
            needWhat: r.needWhat,
            needWhen: r.needWhen,
            partialWhat: r.partial.what,
            partialWhen: r.partial.when,
          }
          const need: string[] = []
          if (r.needWhat) need.push('**what** it should do (the task, report, or question)')
          if (r.needWhen) need.push('**when** it should run (cadence, day, and time — e.g. *weekly on Monday at 9:00am*)')
          return {
            reply: inCollecting
              ? `I still need ${need.join(' and ')}. Add that in your next message and I will finish the setup.`
              : `I can set up a **background agent**. I still need ${need.join(' and ')}. Tell me in your own words, or in your next line.`,
            delayMs: 0,
            stream: false,
          }
        }
        backgroundAgentFlowRef.current = { kind: 'idle' }
        const rec = appendBackgroundAgent(r.what, r.when)
        setBackgroundAgents((prev) => [rec, ...prev])
        setBackgroundAgentConnecting({
          agentName: backgroundAgentDisplayName(rec),
          connections: connectionsForAgentRecord(rec),
        })
        return {
          reply: inCollecting
            ? `**Background agent saved.** It will: **${r.what}** — **${r.when}**. Open **Workflows → Background agents** to review.`
            : `**Background agent is being created** — I will **${r.what}** on **${r.when}**. The agent is listed under **Workflows → Background agents**.`,
          delayMs: 200,
          stream: false,
        }
      }

      if (matchProfitByProductGraphIntent(text) || matchWarehouseBackfillPnlIntent(text) || matchProductRequestCustomerDashboardIntent(text)) {
        const includePnl =
          matchProfitByProductGraphIntent(text) || matchWarehouseBackfillPnlIntent(text)
        setLumberyardOpen(false)
        lumberyardOpenRef.current = false
        setTableChatAttachments([])
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        lastCompetitorProductQueriesRef.current = []
        setLeadGenContextOpen(false)
        setOzCustomerPanelIncludePnl(includePnl)
        setOzCustomerDemandProfitOpen(true)
        return {
          reply: includePnl
            ? 'Opened **Customer demand and P&L** beside the chat: **Products requested** (demand index) plus a synthetic P&L table and **realized profit** bars. **Export this group to Dashboards** sends the full set as one **Your charts** group.'
            : 'Opened **Customer demand** beside the chat: **Products requested** (demand index). Ask for **profit** or **P&L by product** if you also want the synthetic P&L table and realized chart; **Export to Dashboards** includes whatever is shown.',
          delayMs: 250,
          stream: false,
        }
      }
      if (matchMilwaukeeLeadGridIntent(text)) {
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLumberyardOpen(false)
        lumberyardOpenRef.current = false
        setTableChatAttachments([])
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        lastCompetitorProductQueriesRef.current = []
      }
      if (matchCompetitorProductSearchIntent(text) && page === 'oz') {
        setLumberyardOpen(true)
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLeadGenContextOpen(false)
        lumberyardOpenRef.current = true
        if (lumberyardCallsRef.current.length === 0) {
          try {
            const lib = await fetchLumberyardLibrary()
            if (lib.ok) setLumberyardCalls(lib.calls)
          } catch (e) {
            return {
              reply: `I could not load customer activity: ${e instanceof Error ? e.message : String(e)}`,
              delayMs: 0,
              stream: false,
            }
          }
        }
        if (lumberyardCallsRef.current.length === 0) {
          return {
            reply: 'There is no **customer activity** in the list yet. Open the activity grid with a product question, then try the competitor search again.',
            delayMs: 0,
            stream: false,
          }
        }
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        lastCompetitorProductQueriesRef.current = []
        setCompetitorOffersOpen(true)
        setCompetitorOffersSearching(true)
        try {
          const res = await withMinDuration(
            postCompetitorOffers(lumberyardCallsRef.current),
            COMPETITOR_SEARCH_MIN_DISPLAY_MS,
          )
          if (!res.ok || res.rows.length === 0) {
            setCompetitorOffersSearching(false)
            setCompetitorOffersOpen(false)
            lastCompetitorProductQueriesRef.current = []
            return {
              reply:
                'I could not build a comparison table (no product lines came from the top activity rows). Try after more calls are in the list.',
              delayMs: 0,
              stream: false,
            }
          }
          setCompetitorOfferRows(res.rows)
          setCompetitorOffersMeta({
            usedWebSearch: res.usedWebSearch,
            productQueries: res.productQueries,
          })
          lastCompetitorProductQueriesRef.current = res.productQueries
          setCompetitorOffersSearching(false)
          const pl = res.productQueries.length
            ? `Products considered: **${res.productQueries.join('**, **')}**`
            : 'Used titles from the first rows where tags were empty.'
          const web = res.usedWebSearch
            ? 'Live web hints were used where **Brave** is configured in `.env`.'
            : 'Listing URLs are demo; add **BRAVE_API_KEY** (or `BRAVE_SEARCH_API_KEY`) for search-backed pages.'
          return {
            reply: `Here’s a **competitor × product** board from the **top five** activity rows. ${pl}. ${web} Click any row in the right-hand table to open links (product page, Google Images, and web). **Next:** ask who is likely to **buy** if you stock those lines—I’ll open the lead grid filtered to engaged accounts that match this product set (not a Milwaukee-only distributor search).`,
            delayMs: 200,
            stream: false,
          }
        } catch (e) {
          setCompetitorOffersSearching(false)
          setCompetitorOffersOpen(false)
          lastCompetitorProductQueriesRef.current = []
          return {
            reply: `Competitor search failed. ${e instanceof Error ? e.message : String(e)}`,
            delayMs: 0,
            stream: false,
          }
        }
      }
      if (page === 'oz' && matchStockUpLikelyBuyersIntent(text)) {
        const queries = lastCompetitorProductQueriesRef.current
        if (queries.length === 0) {
          return {
            reply:
              'First run a **competitor product search** on your customer activity (which competitors list those product lines). After that, ask who is likely to **buy** if you stock those products—the lead table will use that product list to surface engaged, likely accounts.',
            delayMs: 0,
            stream: false,
          }
        }
        setLumberyardOpen(false)
        lumberyardOpenRef.current = false
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLeadGenContextOpen(true)
        const needle = pickDescriptionFilterNeedle(queries)
        setTableView((prev) => ({
          ...defaultLeadTableViewState(),
          phaseToken: prev.phaseToken + 1,
          dataset: 'standard',
          engagement: 'engaged',
          columnTextFilters: { description: needle },
          sortPrimary: 'industry',
          sortPrimaryDir: 'asc',
          sortSecondary: 'name',
          sortSecondaryDir: 'asc',
        }))
        const qShort = queries.slice(0, 5).join(' · ')
        return {
          reply: `Opened **likely buyers** on the right: **engaged** accounts whose company blurbs match **${needle}**, using product lines from your last competitor run (**${qShort}**). This is a buyer lens—not “Milwaukee distributors only.” Tighten with sort, source column, or clear filters in chat.`,
          delayMs: 400,
          stream: false,
        }
      }
      const wantLumberyard =
        !matchMilwaukeeLeadGridIntent(text) &&
        !matchStockUpLikelyBuyersIntent(text) &&
        (matchLumberyardTableIntent(text) ||
          matchLumberyardAnalyticsOrResearchIntent(text) ||
          lumberyardOpenRef.current)
      if (wantLumberyard) {
        setLumberyardOpen(true)
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLeadGenContextOpen(false)
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        lastCompetitorProductQueriesRef.current = []
        if (lumberyardCallsRef.current.length === 0) {
          try {
            const lib = await fetchLumberyardLibrary()
            if (lib.ok) setLumberyardCalls(lib.calls)
          } catch (e) {
            return {
              reply: `I could not load customer activity: ${e instanceof Error ? e.message : String(e)}`,
              delayMs: 0,
              stream: false,
            }
          }
        }
        if (isOpenAiConfigured()) {
          try {
            const intelText = augmentUserMessageWithTableContext(text, context.tableContextAttachments, {
              scopes: ['lumberyard', 'competitor'],
            })
            const { reply, usedWebSearch } = await postLumberyardIntel(intelText, context.priorExchanges)
            const foot = usedWebSearch
              ? '\n\n_Synthetic: **Brave web search** was used for the competitor / website portion where applicable._'
              : ''
            return { reply: reply + foot, delayMs: 200, stream: false }
          } catch (e) {
            return {
              reply: `Call mining failed. ${e instanceof Error ? e.message : String(e)}`,
              delayMs: 0,
              stream: false,
            }
          }
        }
        return {
          reply:
            'The **call log** is open on the right. Set **OPENAI_API_KEY** in your `.env` to ask about products, **revenue mix** (synthetic), and **competitor** listings on the web (when a search key is set).',
          delayMs: 300,
          stream: false,
        }
      }
      type TableOut = ReturnType<typeof processLeadTableChat>
      let out: TableOut | null = null
      if (isOpenAiConfigured()) {
        try {
          const llm = await interpretLeadTableWithLlm(text, viewRef.current, context.priorUserMessages)
          if (llm.handled) {
            viewRef.current = llm.state
            setTableView(llm.state)
            if (llm.openLeadContext && page === 'oz') {
              setLumberyardOpen(false)
              setOzCustomerDemandProfitOpen(false)
              setOzCustomerPanelIncludePnl(false)
              setLeadGenContextOpen(true)
            }
            out = {
              state: llm.state,
              reply: llm.reply,
              rephase: llm.rephase,
              openLeadContext: llm.openLeadContext,
              delayMs: llm.delayMs,
            }
          }
        } catch {
          // fall back to rules engine
        }
      }
      if (!out) {
        out = processLeadTableChat(text, viewRef.current, page, {
          priorUserMessages: context.priorUserMessages,
        })
        viewRef.current = out.state
        setTableView(out.state)
        if (out.openLeadContext && page === 'oz') {
          setLumberyardOpen(false)
          setOzCustomerDemandProfitOpen(false)
          setOzCustomerPanelIncludePnl(false)
          setLeadGenContextOpen(true)
        }
      }
      if (!isOpenAiConfigured()) {
        return { reply: out.reply, delayMs: out.delayMs, stream: false }
      }

      const baseForLlm = buildMilwaukeeDistributorRows(out.state.dataset)
      const rowsForLlm = applyLeadTableView(baseForLlm, out.state)
      const tableContext = buildLeadTableLlmContext(out.state, rowsForLlm)

      const priorForModel: OzOpenAiMessage[] = []
      for (const ex of context.priorExchanges) {
        if (ex.role === 'user') priorForModel.push({ role: 'user', content: ex.text })
        else if (ex.role === 'oz') priorForModel.push({ role: 'assistant', content: ex.text })
        else priorForModel.push({ role: 'user', content: `[Context] ${ex.text}` })
      }

      const appStateLines: string[] = [
        '## What the app just did (you must not contradict; weave into a natural reply)',
        out.openLeadContext
          ? '- **The Milwaukee-area distributor/lead table is now open** beside the chat. Point the user to that table and what to skim first (e.g. source, size, industry, sort).'
          : null,
        `- List/table handler: ${out.reply}`,
      ].filter((x): x is string => x != null)

      const systemContent = [
        buildOzGptSystemPrompt(),
        tableContext,
        `## This turn (handler)\n${appStateLines.join('\n')}`,
      ].join('\n\n')

      const leadUserContent = augmentUserMessageWithTableContext(text, context.tableContextAttachments, {
        scopes: ['lead', 'lumberyard', 'competitor'],
      })

      const messages: OzOpenAiMessage[] = [
        { role: 'system', content: systemContent },
        ...priorForModel,
        { role: 'user', content: leadUserContent },
      ]

      try {
        const reply = await fetchOpenAiChatCompletion(messages, { maxTokens: 3_200 })
        return { reply, delayMs: 500, stream: true }
      } catch {
        return { reply: out.reply, delayMs: out.delayMs, stream: false }
      }
    },
    [navigate, page],
  )

  const onBackgroundAgentConnectingComplete = useCallback(() => {
    setBackgroundAgentConnecting(null)
  }, [])

  const onContextPanelClose = useCallback(() => {
    setLeadGenContextOpen(false)
    setOzCustomerDemandProfitOpen(false)
    setOzCustomerPanelIncludePnl(false)
    setChatExportNotices([])
    setLumberyardOpen(false)
    setCompetitorOffersOpen(false)
    setCompetitorOffersSearching(false)
    setCompetitorOfferRows([])
    setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
    lastCompetitorProductQueriesRef.current = []
    setTableChatAttachments([])
    if (page !== 'oz' && !isFieldAppCommandCenter(page)) {
      navigate('oz')
    }
  }, [page, navigate])

  useEffect(() => {
    if (!isLeadTableChatPage(page)) {
      backgroundAgentFlowRef.current = { kind: 'idle' }
    }
  }, [page])

  useEffect(() => {
    if (isCommandCenterFirstPage(page)) return
    setLeadGenContextOpen(false)
    setOzCustomerDemandProfitOpen(false)
    setOzCustomerPanelIncludePnl(false)
    setChatExportNotices([])
    setLumberyardOpen(false)
    setCompetitorOffersOpen(false)
    setCompetitorOffersSearching(false)
    setCompetitorOfferRows([])
    setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
    lastCompetitorProductQueriesRef.current = []
    setTableChatAttachments([])
  }, [page])

  const showContextPanel =
    leadGenContextOpen ||
    !isCommandCenterFirstPage(page) ||
    (page === 'oz' && lumberyardOpen) || (page === 'oz' && ozCustomerDemandProfitOpen)
  const meta = getPageMeta(page)

  const showLumberYard = page === 'oz' && lumberyardOpen

  useEffect(() => {
    if (!showLumberYard) {
      setLumberyardKbHidingContext(false)
      setCompetitorOffersOpen(false)
      setCompetitorOffersSearching(false)
      setCompetitorOfferRows([])
      setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
      lastCompetitorProductQueriesRef.current = []
    }
  }, [showLumberYard])

  const tablePhaseKey = `${tableView.phaseToken}-${tableView.dataset}-${displayRows.length}`
  const lumberyardPhaseKey = `${lumberyardCalls.length}-${lumberyardCalls[0]?.id ?? 'none'}`
  const competitorPhaseKey = `${competitorOfferRows.length}-${competitorOffersMeta.productQueries.join(',')}`

  const leadTableEl = (
    <LeadGenDistributorsTable
      rows={displayRows}
      view={tableView}
      onSort={handleTableSort}
      onRefresh={handleTableRefresh}
      onClose={page === 'oz' && leadGenContextOpen ? onContextPanelClose : undefined}
      phaseKey={tablePhaseKey}
      selectedRowIds={tableChatAttachments.filter((a) => a.scope === 'lead').map((a) => a.rowId)}
      onRowToggleContext={toggleLeadRowContext}
    />
  )

  const lumberyardTableEl = (
    <LumberyardCallsTable
      calls={lumberyardCalls}
      onClose={onContextPanelClose}
      phaseKey={lumberyardPhaseKey}
      selectedRowIds={tableChatAttachments.filter((a) => a.scope === 'lumberyard').map((a) => a.rowId)}
      onRowToggleContext={toggleLumberyardRowContext}
    />
  )

  const searchInterstitialRowHints = lumberyardCalls
    .slice(0, 5)
    .map((c) => c.title)
    .filter((t) => t.trim().length > 0)

  const searchInterstitialEl = (
    <CompetitorSearchInterstitial
      rowLineHints={searchInterstitialRowHints}
      onBackToActivity={() => {
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
      }}
      onClose={onContextPanelClose}
    />
  )

  const competitorTableEl = (
    <CompetitorOffersTable
      rows={competitorOfferRows}
      phaseKey={competitorPhaseKey}
      selectedRowIds={tableChatAttachments.filter((a) => a.scope === 'competitor').map((a) => a.rowId)}
      onRowToggleContext={toggleCompetitorRowContext}
    />
  )

  const showLeadForWorkspace =
    page === 'tables' ||
    page === 'lead-generation' ||
    (page === 'oz' && (leadGenContextOpen || ozCustomerDemandProfitOpen))

  const body: ReactNode = showLumberYard
    ? (
        <div
          className={joinClasses(
            'h-full min-h-0 min-w-0 overflow-hidden p-0 transition-opacity duration-300',
            lumberyardKbHidingContext && 'pointer-events-none opacity-0',
          )}
        >
          {competitorOffersOpen && competitorOffersSearching
            ? searchInterstitialEl
            : competitorOffersOpen && competitorOfferRows.length > 0
              ? competitorTableEl
              : lumberyardTableEl}
        </div>
      )
    : showLeadForWorkspace
      ? page === 'oz'
        ? (
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0">
              {ozCustomerDemandProfitOpen ? (
                <>
                  <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    <CustomerDemandAndProfitContextPanel
                      includePnl={ozCustomerPanelIncludePnl}
                      onExported={({ groupLabel }) => recordChatExportNotice(groupLabel)}
                    />
                  </div>
                  {chatExportNotices.length > 0 && (
                    <div className="shrink-0 border-t border-zinc-200/80 bg-zinc-50/90 px-2 py-1.5">
                      <p className="mb-1 text-[9px] font-semibold tracking-wide text-zinc-400 uppercase">
                        Your charts (queued for Dashboards)
                      </p>
                      <ul className="flex flex-wrap gap-1" role="list">
                        {chatExportNotices.map((n) => (
                          <li
                            key={n.id}
                            className="rounded-lg bg-white px-2 py-0.5 text-[10px] text-zinc-700 shadow-sm ring-1 ring-zinc-200/80"
                          >
                            {n.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{leadTableEl}</div>
              )}
            </div>
          )
        : (
            <div
              className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
              data-testid="lead-docked-workspace"
            >
              <div className="min-h-0 min-w-0 flex-1 overflow-auto px-0 py-0">
                {ozCustomerDemandProfitOpen ? (
                  <div className="flex h-full min-h-0 w-full flex-col">
                    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                      <CustomerDemandAndProfitContextPanel
                        includePnl={ozCustomerPanelIncludePnl}
                        onExported={({ groupLabel }) => recordChatExportNotice(groupLabel)}
                      />
                    </div>
                    {chatExportNotices.length > 0 && (
                      <div className="shrink-0 border-t border-zinc-200/80 bg-zinc-50/90 px-2 py-1.5">
                        <p className="mb-1 text-[9px] font-semibold tracking-wide text-zinc-400 uppercase">
                          Your charts (queued for Dashboards)
                        </p>
                        <ul className="flex flex-wrap gap-1" role="list">
                          {chatExportNotices.map((n) => (
                            <li
                              key={n.id}
                              className="rounded-lg bg-white px-2 py-0.5 text-[10px] text-zinc-700 shadow-sm ring-1 ring-zinc-200/80"
                            >
                              {n.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full min-h-0 w-full">{leadTableEl}</div>
                )}
              </div>
              <OzAssistantPanel
                key={page}
                layout="dock"
                contextSummary={meta.subtitle ?? ''}
                messages={OZ_ASSISTANT_NO_SEED}
                onUserMessage={onUserMessage}
                pendingAssistantPlaceholder={pendingLumberyardKnowledgeUi}
                composerContextAttachments={tableChatAttachments}
                onRemoveComposerContextAttachment={(key) =>
                  setTableChatAttachments((p) => p.filter((a) => a.key !== key))
                }
                onAfterUserMessage={() => setTableChatAttachments([])}
              />
            </div>
          )
      : !isCommandCenterFirstPage(page)
        ? page === 'dashboards'
          ? (
              <div className="h-full min-h-0 min-w-0 overflow-auto">
                <DashboardGeneratorPage />
              </div>
            )
          : page === 'field-notes'
            ? (
                <div className="h-full min-h-0 min-w-0 overflow-auto p-4">
                  <FieldNotesPage />
                </div>
              )
            : page === 'quotes-ready'
              ? (
                  <div className="h-full min-h-0 min-w-0">
                    <QuotesReadyForReviewPage />
                  </div>
                )
            : page === 'quote-automation'
              ? (
                  <div className="h-full min-h-0 min-w-0 overflow-auto">
                    <QuoteAutomationWorkspace />
                  </div>
                )
            : page === 'background-agents'
              ? (
                  <div className="h-full min-h-0 min-w-0 overflow-auto">
                    <BackgroundAgentsPage
                      agents={backgroundAgents}
                      onNewAgent={() => {
                        backgroundAgentFlowRef.current = { kind: 'idle' }
                        navigate('oz')
                      }}
                      onDeleteAgent={(id) => {
                        setBackgroundAgents(deleteBackgroundAgent(id))
                      }}
                    />
                  </div>
                )
            : page === 'knowledge-base'
              ? (
                  <div className="h-full min-h-0 min-w-0 overflow-hidden">
                    <KnowledgeBasePage />
                  </div>
                )
              : (
                  <PlaceholderSubtabPage name={meta.title} pageId={page} />
                )
        : null

  const fieldAssistant =
    isFieldAppCommandCenter(page) ? (
      <FieldAppView
        key={page}
        mode={isFieldMobileNavId(page) ? 'mobile-workflow' : 'home'}
        workflowId={isFieldMobileNavId(page) ? fieldWorkflowIdForPage(page) : undefined}
      />
    ) : undefined

  const commandCenterLabel = (() => {
    if (isFieldMobileNavId(page)) {
      return getFieldMobileWorkflow(fieldWorkflowIdForPage(page))!.shortTitle
    }
    if (page === 'field-app') return 'Field App'
    return 'Oz'
  })()

  const isOzTextChat = page === 'oz' && !isFieldAppCommandCenter(page)
  const commandCenterMode: 'rail' | 'centered' =
    isOzTextChat &&
      !leadGenContextOpen &&
      !ozCustomerDemandProfitOpen &&
      !lumberyardOpen &&
      !competitorOffersOpen &&
      !competitorOffersSearching
      ? 'centered'
      : 'rail'
  return (
    <OzWorkflowShell
      activeNavItem={page}
      onNavItemChange={(id) => navigate(id as Page)}
      eyebrow={meta.eyebrow}
      title={meta.title}
      subtitle={meta.subtitle}
      hideContextHeader={page === 'oz' && (showLumberYard || showLeadForWorkspace)}
      fullBleed={
        page === 'dashboards' ||
        page === 'background-agents' ||
        page === 'knowledge-base' ||
        page === 'quotes-ready' ||
        page === 'quote-automation' ||
        (showLeadForWorkspace && page !== 'oz' && !showLumberYard)
      }
      contextWide={
        page === 'dashboards' ||
        page === 'background-agents' ||
        page === 'knowledge-base' ||
        page === 'quotes-ready' ||
        page === 'quote-automation' ||
        showLumberYard ||
        showLeadForWorkspace
      }
      topRightNotification={
        backgroundAgentConnecting != null
          ? (
              <BackgroundAgentConnectingToast
                agentName={backgroundAgentConnecting.agentName}
                connections={backgroundAgentConnecting.connections}
                onComplete={onBackgroundAgentConnectingComplete}
              />
            )
          : null
      }
      fieldMobileNavItems={fieldMobileNavItems}
      commandCenterLabel={commandCenterLabel}
      commandCenterMode={commandCenterMode}
      showCommandBar={isFieldAppCommandCenter(page)}
      contextPanelOpen={showContextPanel}
      onContextPanelClose={
        showContextPanel && !(showLeadForWorkspace && page !== 'oz') ? onContextPanelClose : undefined
      }
      assistant={fieldAssistant}
      assistantProps={
        isFieldAppCommandCenter(page) || !isOzTextChat
          ? undefined
          : {
              contextSummary: meta.subtitle ?? '',
              messages: OZ_ASSISTANT_NO_SEED,
              onUserMessage,
              pendingAssistantPlaceholder: pendingLumberyardKnowledgeUi,
              composerContextAttachments: tableChatAttachments,
              onRemoveComposerContextAttachment: (key: string) =>
                setTableChatAttachments((p) => p.filter((a) => a.key !== key)),
              onAfterUserMessage: () => setTableChatAttachments([]),
              onKnowledgePreambleStart: showLumberYard ? () => setLumberyardKbHidingContext(true) : undefined,
              onKnowledgePreambleComplete: showLumberYard
                ? () => setLumberyardKbHidingContext(false)
                : undefined,
            }
      }
    >
      {body}
    </OzWorkflowShell>
  )
}
