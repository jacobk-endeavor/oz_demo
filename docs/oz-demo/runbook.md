# Oz demo runbook (Q&A only)

## Chat — `#/oz`

1. **You type:** *give me Milwaukee distributors*
   **Oz says:** *Pulling the Milwaukee distributor grid — I'm phasing it in on the right. Ask to narrow, sort, or sub-sort (e.g. by source, then by industry or location).*

2. **You type:** *what have my customers been requesting*
   **Oz says:** *The call log is open on the right. Set `OPENAI_API_KEY` in your `.env` to ask about products, revenue mix (synthetic), and competitor listings on the web (when a search key is set).*

3. **You type:** *who else sells these products — search the web for the top 5*
   **Oz says:** *Here's a competitor × product board from the top five activity rows. Click any row to open links. Next: ask who is likely to buy if you stock those lines.*

4. **You type:** *if I stock up on those, who is likely to buy?*
   **Oz says:** *Opened likely buyers on the right: engaged accounts whose company blurbs match [product needle], using product lines from your last competitor run. This is a buyer lens—tighten with sort, the source column, or clear filters in chat.*

5. **You type:** *build a dashboard of the products customers are requesting*
   **Oz says:** *Opened Customer demand beside the chat: Products requested (demand index).*

6. **You type:** *add a chart for profit by product*
   **Oz says:** *Opened Customer demand and P&L beside the chat: Products requested (demand index) plus a synthetic P&L table and realized profit bars.*

7. **You type:** *create a background agent to email me a weekly summary of new competitor offers every Monday at 9am*
   **Oz says:** *[Task title] is saved. Schedule: weekly, Mondays 9 am. Outcome: emailed competitor-offer summary. Open Workflows → Background agents to see the full card, Connections logos, and schedule details.*

## Voice — `#/field-app`

1. **You say:** *I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?*
   **Oz says:** *I've got you, Sami. I'm opening Kenny Hills now—you'll get recent orders, value bands, and the field and service notes so you're not walking in cold.*

2. **You say:** *Read me the audio summary.*
   **Oz says:** *Kenny Hills Contracting is a reliable customer that is currently focusing on selling pool deck lines. In November, they bought a heavy lift cap composite resurfacing option, and it's the biggest dollar item on the account. From there, they've bought Westbury Rail to match their pool deck collection and have been looking for hidden fasteners of different types to make their orders pop for their customers. They are really pushing for clean surfaces with no screws showing.*

3. **You say:** *What products should I recommend?*
   **Oz says:** *Last time at Kenny Hills they had to call back a day later to add Apex Hidden Fasteners. Lead with your quoted capped composite line, then place Apex hidden fasteners in the conversation now so they do not leave without them. If they are stepping up, the deck drainage pitch still plays well on wet sites.*

4. **You say:** *What are some use cases for it?*
   **Oz says:** *Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter inch gapping for drainage in wet climates.*

5. **You say:** *For Kenny Hills, what do accounts usually add when they buy what I am recommending, plus the fasteners?*
   **Oz says:** *For accounts like Kenny Hills, when buyers take your primary deck recommendation together with Apex hidden fasteners, history shows a third add: color-matched fascia or a riser bundle on long runs. Position that third line as the typical completion package.*

6. **You say:** *Ok send me the product specs to my email.*
   **Oz says:** *Ok, sending.*

7. **You say:** *Hey, I want to record a field memo.* — then dictate your memo after Oz says *Ok, recording.* (saved to Field Notes via transcription).
   **Oz says:** *Ok, recording.*

   After a successful save, **Oz says:** *Ok, I saved your field note — thanks!* (no rep line). In Field Notes, the memo’s last **System** line is *Memo saved to Field Notes. — general*.

8. **You say:** *Let's quote Summit Ridge's lumber package — multi-family framing, SPF and engineered, three-drop delivery.*
   **Oz says:** *Got it, Sami. The lumber P-O will auto-generate on the sheet — you can edit it if they email you a real purchase order number. First, who is the customer and what's the deal we're quoting?*

9. **You say:** *Customer is Summit Ridge Framing. The deal is a full framing-and-sheathing package for their Marshall Court job — twelve units, wood frame, lifts tied to their crane schedule.*
   **Oz says:** *Locked. Next — give me a one-line job description and the order total on the cover.*

10. **You say:** *SPF dimensional and engineered floor system, OSB wall and roof sheathing, hardware bundle, three flatbed drops to the Marshall Court site. Order value two hundred eighty-five thousand.*
    **Oz says:** *Got it. Material buckets — dimensional lumber and studs, engineered lumber, then treated or specialty stock if any.*

11. **You say:** *Thirty-eight thousand five hundred dimensional and stud packs, sixty-two thousand LVL and I-joists, no treated specialty on this phase.*
    **Oz says:** *Labor next. Takeoff and yard time — layout and lift plan first, then crew staging and delivery alignment. We'll keep our standard rates: sixty-eight an hour for design, sixty-one for assembly.*

12. **You say:** *One twenty on takeoff and lift plan, eighty on engineered-lumber coordination, two forty yard crew and staging hours, one sixty delivery-alignment hours.*
    **Oz says:** *Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it.*

13. **You say:** *Sixty-five hundred indirect, forty-two hundred travel, twenty-eight hundred shipping, no commission. Payment schedule: half on lumber P-O acceptance, half Net thirty after final delivery.*
    **Oz says:** *Locked in. Summit Ridge's Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice.*

14. *(No rep line.)* After the Script 4 close, Oz automatically says: *Okay, generating the quote.* — then the Field home voice run ends. (Use **Workspace → Field App → Background quote** if you still want the separate drive-time workflow panel.)
