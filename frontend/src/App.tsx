import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fieldMobileNavItems, fieldWorkflowIdForPage, isFieldMobileNavId } from './features/fieldApp/fieldAppSidebarNav'
import { FieldAppView } from './features/fieldApp/FieldAppView'
import {
  applyLeadTableView,
  defaultLeadTableViewState,
  processLeadTableChat,
} from './features/leadGen/leadGenTableModel'
import {
  matchStockUpLikelyBuyersIntent,
  pickDescriptionFilterNeedle,
} from './features/leadGen/stockUpBuyerIntents'
import { interpretLeadTableWithLlm } from './features/leadGen/interpretLeadTableWithLlm'
import { buildLeadTableLlmContext } from './features/leadGen/leadTableLlmContext'
import type { SortColumn } from './features/leadGen/leadGenTableModel'
import { buildDemoDistributorRows } from './features/leadGen/demoDistributorRows'
import { postCompetitorOffers } from './features/lumberyard/competitorOffersClient'
import {
  COMPETITOR_SEARCH_MIN_DISPLAY_MS,
  withMinDuration,
} from './features/lumberyard/competitorSearchTiming'
import type { CompetitorOfferRow } from './features/lumberyard/competitorOffersTypes'
import { matchCompetitorProductSearchIntent } from './features/lumberyard/competitorProductIntents'
import { makeLeadTableAttachment } from './features/leadGen/leadTableComposerContext'
import { makeCompetitorOfferAttachment } from './features/lumberyard/competitorComposerContext'
import { makeLumberyardAttachment } from './features/lumberyard/lumberyardComposerContext'
import { fetchLumberyardLibrary, postLumberyardIntel } from './features/lumberyard/lumberyardClient'
import {
  matchLumberyardAnalyticsOrResearchIntent,
  matchLumberyardTableIntent,
} from './features/lumberyard/lumberyardIntents'
import {
  postRagCallsQuery,
  RAG_CALLS_DEFAULT_TOP_K,
  RAG_CALLS_SCOPE_TRANSITION_MS,
  type RagCallsScope,
} from './features/ragCalls/ragCallsClient'
import { SettingsPerspectiveTab } from './features/settings/SettingsPerspectiveTab'
import type { DistributorRow } from './features/leadGen/demoDistributorRows'
import type { LumberyardCallRow } from './features/lumberyard/lumberyardTypes'
import {
  buildOzGptSystemPrompt,
  fetchOpenAIChatCompletion,
  isOpenAIConfigured,
  type OzOpenAIMessage,
} from './services/ozOpenAi'
import { useFieldTtsMuteHotkey } from './services/fieldElevenTts'
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
import { NebulaHubPage } from './features/oz/NebulaHubPage'
import { useOzChatStream } from './features/oz/useOzChatStream'
import { DashboardGeneratorPage } from './features/dashboardGenerator/DashboardGeneratorPage'
import { FieldNotesPage } from './features/fieldNotes/FieldNotesPage'
import { QuotesReadyForReviewPage } from './features/quotesReady/QuotesReadyForReviewPage'
import { QuoteAutomationWorkspace } from './features/quoteAutomation/QuoteAutomationWorkspace'
import { matchProductRequestCustomerDashboardIntent } from './features/dashboardGenerator/productRequestDashboardIntent'
import {
  matchProfitByProductGraphIntent,
  matchWarehouseBackfillPnlIntent,
} from './features/dashboardGenerator/profitGraphIntent'
import { OzWorkflowShell, PlaceholderSubtabPage, type OzAssistantMessage, type OzChatTurnContext } from './shared/ui'
import { augmentUserMessageWithTableContext, type TableRowContextAttachment } from './shared/tableRowContext'
import {
  getPageMeta,
  isCommandCenterFirstPage,
  isFieldAppCommandCenter,
  isLeadTableChatPage,
  useHashRoute,
  type Page,
} from './app/workflows/workflowRouting'
import { getPendingKnowledgeUiKind } from './app/chat/pendingKnowledgeUi'
import { CommandCenterContextBody } from './app/workflows/CommandCenterContextBody'

const OZ_ASSISTANT_NO_SEED: OzAssistantMessage[] = []

export type { Page } from './app/workflows/workflowRouting'

/** Lets the right-hand call table panel mount and paint before the library fetch fills rows. */
const LUMBERYARD_PANEL_SETTLE_BEFORE_ROWS_MS = 400
const DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS = 200
/** Longer row cascade when opening the lead grid for “likely buyers if we stock” (competitor run). */
const LIKELY_BUYERS_LEAD_ROW_STAGGER_MS = 440

const RAG_CALLS_SCOPE_STORAGE_KEY = 'oz-demo-rag-calls-scope'

function readInitialRagCallsScope(): RagCallsScope {
  try {
    const v = localStorage.getItem(RAG_CALLS_SCOPE_STORAGE_KEY)
    if (v === 'admin') return 'admin'
    if (v === 'Jacob' || v === 'Sami' || v === 'Ryan' || v === 'Joanna') return v
  } catch {
    /* ignore */
  }
  return 'Jacob'
}

function delayMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export default function App() {
  useFieldTtsMuteHotkey()
  const [page, navigateBase] = useHashRoute()
  const [settingsTabOpen, setSettingsTabOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.location.hash.replace(/^#\/?/, '').split('?')[0] === 'settings'
  })

  const navigate = useCallback(
    (p: Page) => {
      setSettingsTabOpen(false)
      navigateBase(p)
    },
    [navigateBase],
  )

  useEffect(() => {
    const p = window.location.hash.replace(/^#\/?/, '').split('?')[0]
    if (p !== 'settings') return
    const base = `${window.location.pathname}${window.location.search}`
    window.history.replaceState(null, '', `${base}#/oz`)
  }, [])
  const [leadGenContextOpen, setLeadGenContextOpen] = useState(false)
  const [leadDistributorRowStaggerMs, setLeadDistributorRowStaggerMs] = useState(
    DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS,
  )
  /** Single column: units requested, optional P&L when the user asked for profit in chat. */
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
  const [quotesContextHeaderDetailRow, setQuotesContextHeaderDetailRow] = useState<ReactNode>(null)
  const [tableChatAttachments, setTableChatAttachments] = useState<TableRowContextAttachment[]>([])
  const [tableView, setTableView] = useState(() => defaultLeadTableViewState())
  const [ragCallsScope, setRagCallsScope] = useState<RagCallsScope>(() => readInitialRagCallsScope())
  const [ragCallsScopeSelect, setRagCallsScopeSelect] = useState<RagCallsScope>(() =>
    readInitialRagCallsScope(),
  )
  const [ragCallsScopeBusy, setRagCallsScopeBusy] = useState(false)
  const ragScopePendingRef = useRef<RagCallsScope | null>(null)
  const ragScopeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewRef = useRef(tableView)
  const lumberyardOpenRef = useRef(false)
  /** `fetchLumberyardLibrary` is deferred until the in-chat knowledge pill sequence completes. */
  const knowledgePreambleWaitRef = useRef<(() => void) | null>(null)
  /** On Oz, customer-demand charts open only after the Excel + Endeavor in-chat pill finishes. */
  const customerDemandOpenAfterPillRef = useRef<{ includePnl: boolean } | null>(null)

  useEffect(() => {
    return () => {
      if (ragScopeCommitTimerRef.current != null) {
        clearTimeout(ragScopeCommitTimerRef.current)
        ragScopeCommitTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (page !== 'quotes-ready') setQuotesContextHeaderDetailRow(null)
  }, [page])

  const onRagCallsScopeChange = useCallback((next: RagCallsScope) => {
    setSettingsTabOpen(false)
    if (next === ragCallsScopeSelect) return
    setRagCallsScopeSelect(next)
    ragScopePendingRef.current = next
    setRagCallsScopeBusy(true)
    if (ragScopeCommitTimerRef.current != null) clearTimeout(ragScopeCommitTimerRef.current)
    ragScopeCommitTimerRef.current = setTimeout(() => {
      ragScopeCommitTimerRef.current = null
      const commit = ragScopePendingRef.current ?? next
      setRagCallsScope(commit)
      try {
        localStorage.setItem(RAG_CALLS_SCOPE_STORAGE_KEY, commit)
      } catch {
        /* ignore */
      }
      setRagCallsScopeBusy(false)
    }, RAG_CALLS_SCOPE_TRANSITION_MS)
  }, [ragCallsScopeSelect])

  useEffect(() => {
    setTableChatAttachments([])
  }, [ragCallsScopeSelect])

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
    () => buildDemoDistributorRows(tableView.dataset),
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

  const recordChatExportNotice = useCallback((label: string) => {
    setChatExportNotices((prev) => [...prev.slice(-5), { id: `exp-${Date.now()}`, label }])
  }, [])

  const pendingLumberyardKnowledgeUi = useCallback(
    (userText: string) =>
      getPendingKnowledgeUiKind({
        page,
        userText,
        openAiConfigured: isOpenAIConfigured(),
        lumberyardOpen: lumberyardOpenRef.current,
        hasCompetitorQueries: lastCompetitorProductQueriesRef.current.length > 0,
      }),
    [page],
  )
  const { sendNonHardcodedTurn } = useOzChatStream({
    fallbackReply: async ({ text, ragScope }) => {
      const rag = await postRagCallsQuery({
        query: text,
        scope: ragScope as RagCallsScope,
        topK: RAG_CALLS_DEFAULT_TOP_K,
      })
      if (rag.ok) {
        return { reply: rag.reply, delayMs: 0 }
      }
      const detail = rag.detail ? `\n\n${rag.detail}` : ''
      return {
        reply: [
          'Transcript search (**RAG**) is not available for this question.',
          rag.error ? `\n**Reason:** ${rag.error}` : '',
          detail,
          '',
          'Set **DATABASE_URL** or **PGHOST** / **PGUSER** / **PGPASSWORD** / **PGDATABASE**, run **`calls/sauron/scripts/ingest_calls_pgvector.py`**, then try again.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        delayMs: 0,
      }
    },
  })

  const onUserMessage = useCallback(
    async (text: string, context: OzChatTurnContext) => {
      if (isFieldAppCommandCenter(page)) return
      if (!isLeadTableChatPage(page)) return

      const waitForKnowledgePreambleIfLoadingTable = () => {
        const kind = pendingLumberyardKnowledgeUi(text)
        if (kind === 'thinking') return Promise.resolve()
        return new Promise<void>((resolve) => {
          knowledgePreambleWaitRef.current = resolve
        })
      }

      const flow = backgroundAgentFlowRef.current
      const inCollecting = flow.kind === 'collecting'
      if (inCollecting || matchBackgroundAgentIntent(text)) {
        const prior = inCollecting ? { what: flow.partialWhat, when: flow.partialWhen } : null
        const r = tryCompleteBackgroundRequest(prior, text)

        if (isOpenAIConfigured()) {
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
                delayMs: 0
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
              reply: `**${e.taskTitle}** is saved. **Schedule:** ${e.scheduleDisplay}. **Outcome:** ${e.deliverable}\n\nOpen **Workflows → Background Agents** to see the full card, **Connections** logos, and schedule details.`,
              delayMs: 100
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
                reply: `**Background agent saved** (using your wording only — the AI check was skipped). It will: **${r.what}** on **${r.when}**. Open **Workflows → Background Agents** to review.`,
                delayMs: 100
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
            delayMs: 0
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
            ? `**Background agent saved.** It will: **${r.what}** — **${r.when}**. Open **Workflows → Background Agents** to review.`
            : `**Background agent is being created** — I will **${r.what}** on **${r.when}**. The agent is listed under **Workflows → Background Agents**.`,
          delayMs: 100
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
        if (page === 'oz') {
          customerDemandOpenAfterPillRef.current = { includePnl }
        } else {
          setOzCustomerPanelIncludePnl(includePnl)
          setOzCustomerDemandProfitOpen(true)
        }
        setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
        return {
          reply: includePnl
            ? 'Opened **Customer demand and P&L** beside the chat: **Products requested** (units requested) plus a synthetic P&L table and **realized profit** view. **Export this group to Dashboards** sends the full set as one **Your charts** group.'
            : 'Opened **Customer demand** beside the chat: **Products requested** (units requested). Ask for **profit** or **P&L by product** if you also want the synthetic P&L table and realized chart; **Export to Dashboards** includes whatever is shown.',
          delayMs: 125
        }
      }
      if (matchCompetitorProductSearchIntent(text) && page === 'oz') {
        customerDemandOpenAfterPillRef.current = null
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLeadGenContextOpen(false)
        setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
        await waitForKnowledgePreambleIfLoadingTable()
        setLumberyardOpen(true)
        lumberyardOpenRef.current = true
        if (lumberyardCallsRef.current.length === 0) {
          await delayMs(LUMBERYARD_PANEL_SETTLE_BEFORE_ROWS_MS)
          try {
            const lib = await fetchLumberyardLibrary()
            if (lib.ok) setLumberyardCalls(lib.calls)
          } catch (e) {
            return {
              reply: `I could not load customer activity: ${e instanceof Error ? e.message : String(e)}`,
              delayMs: 0
            }
          }
        }
        if (lumberyardCallsRef.current.length === 0) {
          return {
            reply:
              'There is no **customer activity** in the list yet. Open the activity grid with a product question, then try the competitor search again.',
            delayMs: 0
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
              delayMs: 0
            }
          }
          setCompetitorOfferRows(res.rows)
          setCompetitorOffersMeta({
            usedWebSearch: res.usedWebSearch,
            productQueries: res.productQueries,
          })
          lastCompetitorProductQueriesRef.current = res.productQueries
          setCompetitorOffersSearching(false)
          const productLine = res.productQueries.length
            ? res.productQueries.join(' · ')
            : 'titles from the first rows where tags were empty'
          const webNote = res.usedWebSearch
            ? '\n\nLive web hints were blended in where search is enabled.'
            : ''
          return {
            reply: [
              '### Competitor × product board',
              '',
              'Sourced from the top five customer-activity rows.',
              '',
              res.productQueries.length
                ? `- **Products:** ${productLine}`
                : `- **Products:** ${productLine}.`,
              '',
              '**Table**',
              '',
              '- **Competitor** is a link to that store’s listing (new tab).',
              '- Click **Product** or **Price** to attach the row to chat; **double-click** the row for listing, Google Images, and web shortcuts.',
              '',
              '**Next**',
              '',
              'Ask who is likely to **buy** if you stock those lines—I’ll open the lead grid on **engaged** accounts that match this product set (not a generic “all distributors” search).',
              webNote,
            ].join('\n'),
            delayMs: 40
          }
        } catch (e) {
          setCompetitorOffersSearching(false)
          setCompetitorOffersOpen(false)
          lastCompetitorProductQueriesRef.current = []
          return {
            reply: `Competitor search failed. ${e instanceof Error ? e.message : String(e)}`,
            delayMs: 0
          }
        }
      }
      if (page === 'oz' && matchStockUpLikelyBuyersIntent(text)) {
        const queries = lastCompetitorProductQueriesRef.current
        if (queries.length === 0) {
          return {
            reply:
              'First run a **competitor product search** on your customer activity (which competitors list those product lines). After that, ask who is likely to **buy** if you stock those products—the lead table will use that product list to surface engaged, likely accounts.',
            delayMs: 0
          }
        }
        await waitForKnowledgePreambleIfLoadingTable()
        setLumberyardOpen(false)
        lumberyardOpenRef.current = false
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        customerDemandOpenAfterPillRef.current = null
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLeadDistributorRowStaggerMs(LIKELY_BUYERS_LEAD_ROW_STAGGER_MS)
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
          reply: `Opened likely buyers on the right: engaged accounts whose company blurbs match ${needle}, using product lines from your last competitor run (${qShort}). This is a buyer lens—tighten with sort, the source column, or clear filters in chat.`,
          delayMs: 450
        }
      }
      const wantLumberyard =
        !matchStockUpLikelyBuyersIntent(text) &&
        (matchLumberyardTableIntent(text) || matchLumberyardAnalyticsOrResearchIntent(text))
      if (wantLumberyard) {
        customerDemandOpenAfterPillRef.current = null
        setOzCustomerDemandProfitOpen(false)
        setOzCustomerPanelIncludePnl(false)
        setLeadGenContextOpen(false)
        setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
        setCompetitorOffersOpen(false)
        setCompetitorOffersSearching(false)
        setCompetitorOfferRows([])
        setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        lastCompetitorProductQueriesRef.current = []
        // Kick the LLM call off in parallel with the knowledge-pill animation so the reply
        // is ready (or close to it) the instant the icons finish — instead of starting the
        // network call only after the ~960ms pill sequence completes.
        const intelPromise = isOpenAIConfigured()
          ? (async () => {
              const intelText = augmentUserMessageWithTableContext(text, context.tableContextAttachments, {
                scopes: ['lumberyard', 'competitor'],
              })
              return postLumberyardIntel(intelText, context.priorExchanges)
            })()
          : null
        await waitForKnowledgePreambleIfLoadingTable()
        setLumberyardOpen(true)
        lumberyardOpenRef.current = true
        if (lumberyardCallsRef.current.length === 0) {
          await delayMs(LUMBERYARD_PANEL_SETTLE_BEFORE_ROWS_MS)
          try {
            const lib = await fetchLumberyardLibrary()
            if (lib.ok) setLumberyardCalls(lib.calls)
          } catch (e) {
            return {
              reply: `I could not load customer activity: ${e instanceof Error ? e.message : String(e)}`,
              delayMs: 0
            }
          }
        }
        if (intelPromise) {
          try {
            const { reply, usedWebSearch } = await intelPromise
            const foot = usedWebSearch
              ? '\n\n_Synthetic: **Brave web search** was used for the competitor / website portion where applicable._'
              : ''
            return { reply: reply + foot, delayMs: 0 }
          } catch (e) {
            return {
              reply: `Call mining failed. ${e instanceof Error ? e.message : String(e)}`,
              delayMs: 0
            }
          }
        }
        return {
          reply:
            'The **call log** is open on the right. Set **OPENAI_API_KEY** in your `.env` to ask about products, **revenue mix** (synthetic), and **competitor** listings on the web (when a search key is set).',
          delayMs: 0
        }
      }
      type TableOut = ReturnType<typeof processLeadTableChat>
      let out: TableOut | null = null
      if (isOpenAIConfigured()) {
        try {
          const llm = await interpretLeadTableWithLlm(text, viewRef.current, context.priorUserMessages)
          if (llm.handled) {
            viewRef.current = llm.state
            setTableView(llm.state)
            if (llm.openLeadContext && page === 'oz') {
              setLumberyardOpen(false)
              customerDemandOpenAfterPillRef.current = null
        setOzCustomerDemandProfitOpen(false)
              setOzCustomerPanelIncludePnl(false)
              setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
              setLeadGenContextOpen(true)
            }
            out = {
              state: llm.state,
              reply: llm.reply,
              rephase: llm.rephase,
              openLeadContext: llm.openLeadContext,
              delayMs: llm.delayMs,
              usedConversationalFallback: false,
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
          customerDemandOpenAfterPillRef.current = null
        setOzCustomerDemandProfitOpen(false)
          setOzCustomerPanelIncludePnl(false)
          setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
          setLeadGenContextOpen(true)
        }
      }

      if (page === 'oz' && isOpenAIConfigured() && out.usedConversationalFallback) {
        try {
          return await sendNonHardcodedTurn({ text, context, ragScope: ragCallsScope })
        } catch (e) {
          return {
            reply: `Transcript search failed: ${e instanceof Error ? e.message : String(e)}`,
            delayMs: 0,
          }
        }
      }

      if (!isOpenAIConfigured()) {
        return { reply: out.reply, delayMs: out.delayMs }
      }

      const baseForLlm = buildDemoDistributorRows(out.state.dataset)
      const rowsForLlm = applyLeadTableView(baseForLlm, out.state)
      const tableContext = buildLeadTableLlmContext(out.state, rowsForLlm)

      const priorForModel: OzOpenAIMessage[] = []
      for (const ex of context.priorExchanges) {
        if (ex.role === 'user') priorForModel.push({ role: 'user', content: ex.text })
        else if (ex.role === 'oz') priorForModel.push({ role: 'assistant', content: ex.text })
        else priorForModel.push({ role: 'user', content: `[Context] ${ex.text}` })
      }

      const appStateLines: string[] = [
        '## What the app just did (you must not contradict; weave into a natural reply)',
        out.openLeadContext
          ? '- **The distributor/lead table is now open** beside the chat. Point the user to that table and what to skim first (e.g. source, size, industry, sort).'
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

      const messages: OzOpenAIMessage[] = [
        { role: 'system', content: systemContent },
        ...priorForModel,
        { role: 'user', content: leadUserContent },
      ]

      try {
        const reply = await fetchOpenAIChatCompletion(messages, { maxTokens: 3_200 })
        return { reply, delayMs: 140 }
      } catch {
        return { reply: out.reply, delayMs: out.delayMs }
      }
    },
    [page, pendingLumberyardKnowledgeUi, ragCallsScope, sendNonHardcodedTurn],
  )

  const onBackgroundAgentConnectingComplete = useCallback(() => {
    setBackgroundAgentConnecting(null)
  }, [])

  const onContextPanelClose = useCallback(() => {
    setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
    setLeadGenContextOpen(false)
    customerDemandOpenAfterPillRef.current = null
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
    setLeadDistributorRowStaggerMs(DEFAULT_LEAD_DISTRIBUTOR_ROW_STAGGER_MS)
    setLeadGenContextOpen(false)
    customerDemandOpenAfterPillRef.current = null
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

  const showLeadForWorkspace =
    page === 'tables' ||
    page === 'lead-generation' ||
    (page === 'oz' && (leadGenContextOpen || ozCustomerDemandProfitOpen))

  const commandCenterBody =
    showLumberYard || showLeadForWorkspace ? (
      <CommandCenterContextBody
        showLumberYard={showLumberYard}
        showLeadForWorkspace={showLeadForWorkspace}
        page={page as 'oz' | 'tables' | 'lead-generation'}
        lumberyardKbHidingContext={lumberyardKbHidingContext}
        competitorOffersOpen={competitorOffersOpen}
        competitorOffersSearching={competitorOffersSearching}
        competitorOfferRows={competitorOfferRows}
        competitorPhaseKey={competitorPhaseKey}
        lumberyardCalls={lumberyardCalls}
        lumberyardPhaseKey={lumberyardPhaseKey}
        tableView={tableView}
        displayRows={displayRows}
        tablePhaseKey={tablePhaseKey}
        leadDistributorRowStaggerMs={leadDistributorRowStaggerMs}
        likelyBuyersLeadRowStaggerMs={LIKELY_BUYERS_LEAD_ROW_STAGGER_MS}
        leadGenContextOpen={leadGenContextOpen}
        ozCustomerDemandProfitOpen={ozCustomerDemandProfitOpen}
        ozCustomerPanelIncludePnl={ozCustomerPanelIncludePnl}
        chatExportNotices={chatExportNotices}
        tableChatAttachments={tableChatAttachments}
        onTableSort={handleTableSort}
        onContextPanelClose={onContextPanelClose}
        onToggleLeadRowContext={toggleLeadRowContext}
        onToggleLumberyardRowContext={toggleLumberyardRowContext}
        onToggleCompetitorRowContext={toggleCompetitorRowContext}
        onRecordChatExportNotice={recordChatExportNotice}
        onBackToActivity={() => {
          setCompetitorOffersOpen(false)
          setCompetitorOffersSearching(false)
          setCompetitorOfferRows([])
          setCompetitorOffersMeta({ usedWebSearch: false, productQueries: [] })
        }}
      />
    ) : null

  const body: ReactNode = commandCenterBody ?? (!isCommandCenterFirstPage(page)
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
                    <QuotesReadyForReviewPage onContextHeaderDetailRowChange={setQuotesContextHeaderDetailRow} />
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
            : page === 'nebula'
              ? (
                  <div className="h-full min-h-0 min-w-0 overflow-auto">
                    <NebulaHubPage onNavigate={(id) => navigate(id as Page)} />
                  </div>
                )
              : (
                  <PlaceholderSubtabPage name={meta.title} pageId={page} />
                )
        : null)

  const fieldAssistant =
    isFieldAppCommandCenter(page) ? (
      <FieldAppView
        key={page}
        mode={isFieldMobileNavId(page) ? 'mobile-workflow' : 'home'}
        workflowId={isFieldMobileNavId(page) ? fieldWorkflowIdForPage(page) : undefined}
      />
    ) : undefined

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
    <>
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
      settingsTabOpen={settingsTabOpen}
      settingsTab={
        <SettingsPerspectiveTab
          ragCallsScope={ragCallsScopeSelect}
          ragCallsScopeBusy={ragCallsScopeBusy}
          onRagCallsScopeChange={onRagCallsScopeChange}
        />
      }
      onSettingsTabClose={() => setSettingsTabOpen(false)}
      onSettingsFooterClick={() => setSettingsTabOpen((o) => !o)}
      fieldMobileNavItems={fieldMobileNavItems}
      hidePrimaryNav={isFieldAppCommandCenter(page)}
      commandCenterMode={commandCenterMode}
      showCommandBar={false}
      contextPanelOpen={showContextPanel}
      onContextPanelClose={
        showContextPanel && !(showLeadForWorkspace && page !== 'oz') ? onContextPanelClose : undefined
      }
      assistant={fieldAssistant}
      contextHeaderDetailRow={page === 'quotes-ready' ? quotesContextHeaderDetailRow : undefined}
      assistantProps={
        isFieldAppCommandCenter(page) || !isOzTextChat
          ? undefined
          : {
              contextSummary: meta.subtitle ?? '',
              messages: OZ_ASSISTANT_NO_SEED,
              transcriptResetKey: ragCallsScopeSelect,
              onUserMessage,
              pendingAssistantPlaceholder: pendingLumberyardKnowledgeUi,
              composerContextAttachments: tableChatAttachments,
              onRemoveComposerContextAttachment: (key: string) =>
                setTableChatAttachments((p) => p.filter((a) => a.key !== key)),
              onAfterUserMessage: () => setTableChatAttachments([]),
              onKnowledgePreambleStart: (kind) => {
                // Only dim the activity / competitor table while a **KB** or **web** pill runs.
                // CRM / likely-buyer pills are chat-only; hiding here was blanking the right column
                // for the whole sequence before the hand-off to the lead table.
                if (kind === 'knowledge_base' || kind === 'knowledge_web') {
                  setLumberyardKbHidingContext(true)
                }
              },
              onKnowledgePreambleComplete: () => {
                const customerDemand = customerDemandOpenAfterPillRef.current
                if (customerDemand) {
                  customerDemandOpenAfterPillRef.current = null
                  setOzCustomerPanelIncludePnl(customerDemand.includePnl)
                  setOzCustomerDemandProfitOpen(true)
                }
                const finish = knowledgePreambleWaitRef.current
                knowledgePreambleWaitRef.current = null
                finish?.()
                setLumberyardKbHidingContext(false)
              },
            }
      }
    >
      {body}
    </OzWorkflowShell>
      {ragCallsScopeBusy ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-100/90 backdrop-blur-md motion-reduce:backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-busy="true"
          aria-labelledby="oz-rag-scope-loading-title"
          aria-describedby="oz-rag-scope-loading-desc"
        >
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-zinc-200/90 bg-white px-12 py-10 shadow-2xl">
            <span
              className="h-14 w-14 shrink-0 animate-spin rounded-full border-[4px] border-zinc-200 border-t-zinc-800 motion-reduce:animate-none motion-reduce:border-t-zinc-500"
              aria-hidden
            />
            <div className="text-center">
              <p id="oz-rag-scope-loading-title" className="text-base font-semibold text-zinc-900">
                Switching transcript scope
              </p>
              <p id="oz-rag-scope-loading-desc" className="mt-1 text-sm text-zinc-500">
                Please wait…
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
