/**
 * Subject + HTML body for the product-specs email Oz "sends" after the rep
 * says *"Ok send me the product specs to my email"* in Script 2 (turn 4).
 *
 * The body is a 3-row table of the products Oz recommended (capped composite,
 * hidden fastener clip system, fascia/riser bundle) with links pulled from
 * the spec sheets I had pulled with web search. The "Apex" hidden fastener is
 * demo name — the row points at the closest real-world equivalents (DeckWise, Wolf,
 * MoistureShield) plus the ICC-ESR PDF that came back from search.
 */
import { sendOzEmail, type SendOzEmailResult } from '../../services/ozEmail'

const PRODUCT_SPECS_SUBJECT =
  'Product specs — capped composite + hidden fasteners + fascia (Kenny Hills follow-up)'

const PRODUCT_SPECS_HTML = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #18181b; max-width: 720px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; color: #52525b; margin: 0 0 8px;">Triggered from the Oz Field App voice flow.</p>
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
    <p style="font-size: 12px; color: #a1a1aa; margin: 24px 0 0;">Sent automatically by the Oz Field App voice flow after the "Ok, sending" turn. Edit the template in <code>fieldDemoProductSpecsEmail.ts</code>.</p>
  </body>
</html>`

const PRODUCT_SPECS_TEXT = `Product specs — Kenny Hills follow-up

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

Sent automatically by the Oz Field App voice flow after the "Ok, sending" turn.`

/**
 * Send the canned product-specs email through the dev-server SMTP proxy.
 * Called from `FieldAppView` when the orb queue advances past Script 2 turn 4
 * (the "Ok, sending" reply). `to` defaults to the SMTP_TO_DEFAULT env value
 * picked up server-side; pass an explicit address here to override.
 */
export function sendProductSpecsEmail(opts: { to?: string | string[] } = {}): Promise<SendOzEmailResult> {
  return sendOzEmail({
    to: opts.to,
    subject: PRODUCT_SPECS_SUBJECT,
    html: PRODUCT_SPECS_HTML,
    text: PRODUCT_SPECS_TEXT,
  })
}
