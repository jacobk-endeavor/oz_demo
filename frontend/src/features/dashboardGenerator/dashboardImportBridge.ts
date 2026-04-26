import type { DashboardChartSpec } from './dashboardChartFromPrompt'

const QUEUE_KEY = 'oz-demo-dashboards-chart-import-queue'

/** One export action from chat (or elsewhere); Dashboards appends a **Your charts** group per item. */
export type QueuedDashboardChartGroup = {
  label: string
  charts: DashboardChartSpec[]
  lastBuildLine?: string
  dashboardTitle?: string
}

function readQueue(): QueuedDashboardChartGroup[] {
  try {
    if (typeof sessionStorage === 'undefined') return []
    const raw = sessionStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const q = JSON.parse(raw) as QueuedDashboardChartGroup[]
    return Array.isArray(q) ? q : []
  } catch {
    return []
  }
}

function writeQueue(q: QueuedDashboardChartGroup[]) {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    // ignore
  }
}

/** Queue a group; opening **Dashboards** will append it as a new **Your charts** card/section. */
export function enqueueDashboardChartGroup(group: QueuedDashboardChartGroup): void {
  const q = readQueue()
  q.push(group)
  writeQueue(q)
}

/**
 * Next Dashboards mount: consume the full queue (one or more groups from one or more exports).
 */
export function takeQueuedDashboardChartGroups(): QueuedDashboardChartGroup[] {
  const q = readQueue()
  writeQueue([])
  return q
}
