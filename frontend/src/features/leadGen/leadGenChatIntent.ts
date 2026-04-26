/** Demo intent: user asked for lead-gen results in chat (e.g. distributors in a city). */
export function isDistributorsInMilwaukeeRequest(text: string): boolean {
  const t = text.toLowerCase()
  if (!t.includes('milwaukee')) return false
  return (
    t.includes('distributor') ||
    t.includes('distributors') ||
    t.includes('distribution') ||
    t.includes('dealer') ||
    t.includes('dealers')
  )
}
