/**
 * One-off SMTP test: sends the same product-specs email the Field App voice
 * flow would send, using the SMTP_* values from /Users/.../Oz-Demo/.env.
 *
 * Usage:
 *   node frontend/scripts/test-send-product-specs-email.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '..', '.env')

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`.env not found at ${file}`)
  }
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

const env = loadEnv(envPath)
const host = env.SMTP_HOST
const port = Number.parseInt(env.SMTP_PORT || '465', 10)
const secure = (env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')).toLowerCase() === 'true'
const user = env.SMTP_USER
const pass = env.SMTP_PASS
const from = env.SMTP_FROM || user
const to = env.SMTP_TO_DEFAULT || user

if (!host || !user || !pass) {
  console.error(
    'Missing SMTP creds. Need SMTP_HOST, SMTP_USER, SMTP_PASS in',
    envPath,
  )
  process.exit(2)
}

console.log('SMTP target:', { host, port, secure, user, from, to, passLen: pass.length })

const subject = 'Product specs — capped composite + hidden fasteners + fascia (Kenny Hills follow-up)'
const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #18181b; max-width: 720px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; color: #52525b; margin: 0 0 8px;">Triggered from the Oz Field App voice flow (test send).</p>
    <h1 style="font-size: 20px; margin: 0 0 4px;">Product specs — Kenny Hills follow-up</h1>
    <p style="font-size: 14px; color: #52525b; margin: 0 0 16px;">Three product spec packets, one per item Oz recommended in the cross-sell turn.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 14px;">
      <thead>
        <tr>
          <th align="left" style="padding: 8px 12px; border-bottom: 2px solid #18181b; background: #fafafa;">Item</th>
          <th align="left" style="padding: 8px 12px; border-bottom: 2px solid #18181b; background: #fafafa;">Spec link(s)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td valign="top" style="padding: 12px; border-bottom: 1px solid #e4e4e7;"><strong>TimberTech AZEK Vintage capped composite — Mahogany</strong><br/><span style="color: #71717a; font-size: 13px;">The "quoted capped composite line" Oz tells you to lead with.</span></td>
          <td valign="top" style="padding: 12px; border-bottom: 1px solid #e4e4e7;">
            <a href="https://www.timbertech.com/product/azek-vintage-collection/" style="color: #0284c7;">Vintage Collection product page</a><br/>
            <a href="https://www.timbertech.com/resources/technical-resources/" style="color: #0284c7;">TimberTech Technical Resources (Vintage Tech Sheet)</a>
          </td>
        </tr>
        <tr>
          <td valign="top" style="padding: 12px; border-bottom: 1px solid #e4e4e7;"><strong>Apex Hidden Fasteners — clip system</strong><br/><span style="color: #71717a; font-size: 13px;">Hidden fastener clip system for a clean deck face.</span></td>
          <td valign="top" style="padding: 12px; border-bottom: 1px solid #e4e4e7;">
            <a href="https://www.deckwise.com/ipe-clip-extreme-hidden-deck-fastener.html" style="color: #0284c7;">DeckWise Ipe Clip Extreme</a><br/>
            <a href="https://www.moistureshield.com/products/hidden-deck-fasteners/aegis-clip/" style="color: #0284c7;">MoistureShield Aegis</a><br/>
            <a href="https://www.wolfhomeproducts.com/wp-content/uploads/2023/04/ESR-5016.pdf" style="color: #0284c7;">ICC-ES ESR-5016 (Wolf Phantom hidden-fastener evaluation report PDF)</a>
          </td>
        </tr>
        <tr>
          <td valign="top" style="padding: 12px; border-bottom: 1px solid #e4e4e7;"><strong>Color-matched fascia / riser bundle (long runs)</strong><br/><span style="color: #71717a; font-size: 13px;">The typical third add when buyers take deck + fasteners.</span></td>
          <td valign="top" style="padding: 12px; border-bottom: 1px solid #e4e4e7;">
            <a href="https://buy.advantagelumber.com/products/timbertech-azek-vintage-riser-fascia" style="color: #0284c7;">TimberTech AZEK Vintage Riser/Fascia (Advantage Lumber)</a><br/>
            <a href="https://deckstore.com/products/timbertech-azek-vintage-collection-advanced-pvc-fascia-board" style="color: #0284c7;">TimberTech Vintage Fascia &amp; Riser (Deck Store)</a><br/>
            <a href="https://www.timbertech.com/resources/technical-resources/" style="color: #0284c7;">TimberTech Technical Resources (Vintage Rim Joist / Fascia spec)</a>
          </td>
        </tr>
      </tbody>
    </table>
    <p style="font-size: 12px; color: #a1a1aa; margin: 24px 0 0;">Sent automatically by the Oz Field App voice flow (test send via the SMTP proxy script).</p>
  </body>
</html>`

const text = `Product specs — Kenny Hills follow-up

Three product spec packets, one per item Oz recommended in the cross-sell turn.

1. TimberTech AZEK Vintage capped composite — Mahogany
   - https://www.timbertech.com/product/azek-vintage-collection/
   - https://www.timbertech.com/resources/technical-resources/

2. Apex Hidden Fasteners — clip system
   - DeckWise Ipe Clip Extreme: https://www.deckwise.com/ipe-clip-extreme-hidden-deck-fastener.html
   - MoistureShield Aegis: https://www.moistureshield.com/products/hidden-deck-fasteners/aegis-clip/
   - ICC-ES ESR-5016 PDF: https://www.wolfhomeproducts.com/wp-content/uploads/2023/04/ESR-5016.pdf

3. Color-matched fascia / riser bundle (long runs)
   - TimberTech AZEK Vintage Riser/Fascia (Advantage Lumber): https://buy.advantagelumber.com/products/timbertech-azek-vintage-riser-fascia
   - TimberTech Vintage Fascia & Riser (Deck Store): https://deckstore.com/products/timbertech-azek-vintage-collection-advanced-pvc-fascia-board
   - TimberTech Technical Resources: https://www.timbertech.com/resources/technical-resources/

Sent automatically by the Oz Field App voice flow (test send via the SMTP proxy script).`

const t = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
})

try {
  console.log('Verifying SMTP connection…')
  await t.verify()
  console.log('SMTP verified. Sending…')
  const info = await t.sendMail({ from, to, subject, html, text })
  console.log('Sent.')
  console.log('  messageId:', info.messageId)
  console.log('  accepted: ', info.accepted)
  console.log('  rejected: ', info.rejected)
  console.log('  response: ', info.response)
} catch (e) {
  console.error('SMTP send failed:', e?.message ?? e)
  if (e?.code) console.error('  code:', e.code)
  if (e?.response) console.error('  response:', e.response)
  process.exit(1)
}
