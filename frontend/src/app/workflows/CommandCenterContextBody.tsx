import type { ReactNode } from 'react'
import { LeadGenDistributorsTable } from '../../features/leadGen/LeadGenDistributorsTable'
import { CustomerDemandAndProfitContextPanel } from '../../features/dashboardGenerator/CustomerDemandAndProfitContextPanel'
import { LumberyardCallsTable } from '../../features/lumberyard/LumberyardCallsTable'
import { CompetitorSearchInterstitial } from '../../features/lumberyard/CompetitorSearchInterstitial'
import { CompetitorOffersTable } from '../../features/lumberyard/CompetitorOffersTable'
import type { CompetitorOfferRow } from '../../features/lumberyard/competitorOffersTypes'
import type { LumberyardCallRow } from '../../features/lumberyard/lumberyardTypes'
import type { TableRowContextAttachment } from '../../shared/tableRowContext'
import type { DistributorRow } from '../../features/leadGen/demoDistributorRows'
import type { SortColumn, LeadTableViewState } from '../../features/leadGen/leadGenTableModel'

type Props = {
  showLumberYard: boolean
  showLeadForWorkspace: boolean
  page: 'oz' | 'tables' | 'lead-generation'
  lumberyardKbHidingContext: boolean
  competitorOffersOpen: boolean
  competitorOffersSearching: boolean
  competitorOfferRows: CompetitorOfferRow[]
  competitorPhaseKey: string
  lumberyardCalls: LumberyardCallRow[]
  lumberyardPhaseKey: string
  tableView: LeadTableViewState
  displayRows: DistributorRow[]
  tablePhaseKey: string
  leadDistributorRowStaggerMs: number
  likelyBuyersLeadRowStaggerMs: number
  leadGenContextOpen: boolean
  ozCustomerDemandProfitOpen: boolean
  ozCustomerPanelIncludePnl: boolean
  chatExportNotices: { id: string; label: string }[]
  tableChatAttachments: TableRowContextAttachment[]
  onTableSort: (col: SortColumn) => void
  onContextPanelClose: () => void
  onToggleLeadRowContext: (row: DistributorRow, displayIndex: number) => void
  onToggleLumberyardRowContext: (row: LumberyardCallRow, displayIndex: number) => void
  onToggleCompetitorRowContext: (row: CompetitorOfferRow, displayIndex: number) => void
  onRecordChatExportNotice: (label: string) => void
  onBackToActivity: () => void
}

export function CommandCenterContextBody({
  showLumberYard,
  showLeadForWorkspace,
  page,
  lumberyardKbHidingContext,
  competitorOffersOpen,
  competitorOffersSearching,
  competitorOfferRows,
  competitorPhaseKey,
  lumberyardCalls,
  lumberyardPhaseKey,
  tableView,
  displayRows,
  tablePhaseKey,
  leadDistributorRowStaggerMs,
  likelyBuyersLeadRowStaggerMs,
  leadGenContextOpen,
  ozCustomerDemandProfitOpen,
  ozCustomerPanelIncludePnl,
  chatExportNotices,
  tableChatAttachments,
  onTableSort,
  onContextPanelClose,
  onToggleLeadRowContext,
  onToggleLumberyardRowContext,
  onToggleCompetitorRowContext,
  onRecordChatExportNotice,
  onBackToActivity,
}: Props): ReactNode {
  if (showLumberYard) {
    const searchInterstitialRowHints = lumberyardCalls
      .slice(0, 5)
      .map((c) => c.title)
      .filter((t) => t.trim().length > 0)
    return (
      <div
        className={[
          'h-full min-h-0 min-w-0 overflow-hidden p-0 transition-opacity duration-[390ms]',
          lumberyardKbHidingContext ? 'pointer-events-none opacity-0' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {competitorOffersOpen && competitorOffersSearching ? (
          <CompetitorSearchInterstitial
            rowLineHints={searchInterstitialRowHints}
            onBackToActivity={onBackToActivity}
            onClose={onContextPanelClose}
          />
        ) : competitorOffersOpen && competitorOfferRows.length > 0 ? (
          <CompetitorOffersTable
            rows={competitorOfferRows}
            phaseKey={competitorPhaseKey}
            tableTitle="Competitor × product board"
            selectedRowIds={tableChatAttachments.filter((a) => a.scope === 'competitor').map((a) => a.rowId)}
            onRowToggleContext={onToggleCompetitorRowContext}
          />
        ) : (
          <LumberyardCallsTable
            calls={lumberyardCalls}
            onClose={onContextPanelClose}
            phaseKey={lumberyardPhaseKey}
            selectedRowIds={tableChatAttachments.filter((a) => a.scope === 'lumberyard').map((a) => a.rowId)}
            onRowToggleContext={onToggleLumberyardRowContext}
          />
        )}
      </div>
    )
  }

  if (!showLeadForWorkspace) return null

  const renderLeadTable = (enableRowChatContext: boolean) => (
    <LeadGenDistributorsTable
      rows={displayRows}
      view={tableView}
      onSort={onTableSort}
      onClose={page === 'oz' && leadGenContextOpen ? onContextPanelClose : undefined}
      phaseKey={tablePhaseKey}
      rowStaggerMs={leadDistributorRowStaggerMs}
      deferredDataPaint={leadDistributorRowStaggerMs === likelyBuyersLeadRowStaggerMs}
      selectedRowIds={
        enableRowChatContext
          ? tableChatAttachments.filter((a) => a.scope === 'lead').map((a) => a.rowId)
          : []
      }
      onRowToggleContext={enableRowChatContext ? onToggleLeadRowContext : undefined}
    />
  )

  if (page === 'oz') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0">
        {ozCustomerDemandProfitOpen ? (
          <>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <CustomerDemandAndProfitContextPanel
                includePnl={ozCustomerPanelIncludePnl}
                onExported={({ groupLabel }) => onRecordChatExportNotice(groupLabel)}
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
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{renderLeadTable(true)}</div>
        )}
      </div>
    )
  }

  return (
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
                onExported={({ groupLabel }) => onRecordChatExportNotice(groupLabel)}
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
          <div className="h-full min-h-0 w-full">{renderLeadTable(false)}</div>
        )}
      </div>
    </div>
  )
}
