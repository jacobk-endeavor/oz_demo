# Oz demo runbook (Q&A only)

## Chat — `#/oz`

1. **You type:** *give me Milwaukee distributors*
   **Oz says:** *Pulling the Milwaukee distributor grid — I'm phasing it in on the right. Ask to narrow, sort, or sub-sort (e.g. by source, then by industry or location).*

2. **You type:** *what have my customers been requesting*
   **Oz says:** *The call log is open on the right. Set `OPENAI_API_KEY` in your `.env` to ask about products, revenue mix (synthetic), and competitor listings on the web (when a search key is set).*

3. **You type:** *who else sells these products — search the web for the top 5*
   **Oz says:** *Here's a competitor × product board from the top five activity rows. Click any row to open links. Next: ask who is likely to buy if you stock those lines.*

4. **You type:** *if I stock up on those, who is likely to buy?*
   **Oz says:** *Opened likely buyers on the right: engaged accounts whose company blurbs match [product needle], using product lines from your last competitor run. This is a buyer lens — not "Milwaukee distributors only."*

5. **You type:** *build a dashboard of the products customers are requesting*
   **Oz says:** *Opened Customer demand beside the chat: Products requested (demand index).*

6. **You type:** *add a chart for profit by product*
   **Oz says:** *Opened Customer demand and P&L beside the chat: Products requested (demand index) plus a synthetic P&L table and realized profit bars.*

7. **You type:** *create a background agent to email me a weekly summary of new competitor offers every Monday at 9am*
   **Oz says:** *[Task title] is saved. Schedule: weekly, Mondays 9 am. Outcome: emailed competitor-offer summary. Open Workflows → Background agents to see the full card, Connections logos, and schedule details.*

## Voice — `#/field-app`

1. **You say:** *I'm about to visit contractor Kenny Hills — what have we sold them, and what notes are on the account?*
   **Oz says:** *I've got you, Alex. I'm opening Kenny Hills now—you'll get recent orders, value bands, and the field and service notes so you're not walking in cold.*

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

7. **You say:** *Just left Sammy Carter's fab shop. Walked the floor with Sammy and his maintenance lead Mike. Sammy wants to upgrade the second packaging line — manual case packing is the bottleneck, about an hour a day on changeover. Robotic pick cell with vision and P-L-C, install before Q3, open to leasing if cap-ex is tight. Action items: pull the Q twenty-five dash eleven oh two spec, get the floor envelope from Mike, walk back with the cost recap.*
   **Oz says:** *Cool, recording.*

8. **You say:** *Let's spec out Sammy Carter's quote — the automation cell upgrade at his fab shop.*
   **Oz says:** *Got it, Alex. First — give me the project basics for Sammy Carter's automation cell upgrade: what project number, which existing quote we're tying to, and which P-M leads on our side? I'll auto-generate the P-O on the sheet — you can edit it after if Sammy supplies a real one.*

9. **You say:** *Project Q twenty-six dash zero zero zero two dash zero four, ref quote Q twenty-five dash eleven oh two, James leads on our side.*
   **Oz says:** *Locked. Next — give me a one-line job description and the order value Sammy sees on the cover.*

10. **You say:** *Robotic cell — conveyor integration, P-L-C controls, safety guarding, vision pick verification, on-site commissioning at Sammy's shop. Order value two hundred eighty-five thousand.*
    **Oz says:** *Got it. Component costs — break it down: electrical, commercial mechanical, manufactured mechanical.*

11. **You say:** *Thirty-eight thousand five hundred electrical, sixty-two thousand commercial mechanical, no manufactured mechanical.*
    **Oz says:** *Labor next. Design hours and assembly hours — mechanical first, then electrical. We'll keep our standard rates: sixty-eight an hour for design, sixty-one for assembly.*

12. **You say:** *One twenty mechanical design, eighty electrical design, two forty mechanical assembly, one sixty electrical assembly.*
    **Oz says:** *Last block — indirect labor, travel, shipping, any sales commission, and the payment schedule. Walk me through it.*

13. **You say:** *Sixty-five hundred indirect, forty-two hundred travel, twenty-eight hundred shipping, no commission. Payment schedule: half on P-O acceptance, half Net thirty after F-A-T.*
    **Oz says:** *Locked in. Sammy's Job Cost Recap is staged — total cost about one hundred fifty-six thousand, profit one hundred twenty-eight thousand, around forty-five percent margin. Open the sheet to review and queue the invoice.*

14. **You say:** *Queue a background quote for me while I drive.*
    **Oz says:** *Sounds good. I'm queuing a background quote to the web team—you'll get a handoff, not the full five-question visit note.*
