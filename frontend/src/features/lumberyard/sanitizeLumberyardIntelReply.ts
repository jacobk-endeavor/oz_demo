/**
 * Strip spurious model self-instruction lines that sometimes appear in lumberyard intel
 * (e.g. "Remove statements like this from the response" and standalone `(call id: …)` annotations).
 */
export function sanitizeLumberyardIntelReply(reply: string): string {
  let s = reply
  s = s.replace(
    /\n?\s*Remove statements like this from the response\.?\s*(\(call id:\s*`[^`]+`\)\.?)?\s*/gi,
    '\n',
  )
  s = s.replace(/^\s*\(call id:\s*`lumber-[a-z0-9-]+`\)\.?\s*$/gim, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}
