/**
 * Natural-language path to the pre-generated **Customer product request** demand dashboard.
 */
export function matchProductRequestCustomerDashboardIntent(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  if (t.length < 10) return false

  const mentionsDashboard =
    /\bdashboard\b/.test(t) || /\b(?:generate|build|create|show|open)\b.*\b(?:report|view|board)\b/.test(t) ||
    /\b(?:report|view|board)\b.*\b(?:from|on|for)\b/.test(t)

  const productRequestFraming =
    /\bproduct\s+requests?\b/.test(t) ||
    /\bproducts?\s+requested\b/.test(t) ||
    /\brequested\s+products?\b/.test(t) ||
    /\brequests?\s+from\s+(my\s+)?customers?\b/.test(t) ||
    /\bwhat\s+.*\b(?:request|order|stock|line)\b.*\bcustomer/.test(t) ||
    (/\bcustomer\b/.test(t) && /\b(request|demand|pull|sku|line|product)\b/.test(t))

  const compact =
    /\b(?:show|open|build|generate|create)\b.*\bcustomer\s+(?:product\s+)?request/.test(t) ||
    /\bcustomer\s+product\s+request.*\bdashboard\b/.test(t) ||
    /\bproduct\s+request.*\bdashboard\b/.test(t)

  /** Bar chart of what customers asked for (opens same inline panel as dashboard). */
  const hasChartNoun = /\b(?:bar\s+)?chart|graph|breakdown|histogram|visuali[sz]e\b/.test(t)
  const hasChartRequestVerb =
    /\b(?:generate|build|create|show|give|make|add|open|plot|draw|visuali[sz]e)\b/.test(t) ||
    /\bchart\s+of\b/.test(t) ||
    /\bchart\s+for\b/.test(t) ||
    /\bbar\s+chart\b/.test(t)
  const chartOfRequestDemand =
    hasChartNoun &&
    hasChartRequestVerb &&
    (/\b(?:customer|consumer)\s+requests?\b/.test(t) ||
      /\brequests?\s+from\s+(?:my\s+)?customers?\b/.test(t) ||
      /\bproduct\s+requests?\b/.test(t) ||
      /\bproducts?\s+requested\b/.test(t) ||
      /\b(?:my\s+)?customers?\b.*\brequested\b/.test(t) ||
      (/\b(?:my\s+)?customers?\b/.test(t) && /\brequesting\b/.test(t)))

  if (compact) return true
  if (chartOfRequestDemand) return true
  if (mentionsDashboard && productRequestFraming) return true
  if (
    /\bgenerate\s+a\s+dashboard\s+based\s+on\s+product\s+requests?\s+from\s+(my\s+)?customers?\b/.test(t)
  ) {
    return true
  }
  return false
}
