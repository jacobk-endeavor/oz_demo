/**
 * Writes ../activity-mock.json — 15 email + 15 field-note rows for the lumberyard demo grid.
 * Run from repo root: node lumberyard-calls/tools/generate-activity-mock.mjs
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'activity-mock.json')

const emails = [
  {
    id: 'ly-mail-01-osb-columbus',
    callDate: '2026-04-24',
    title: 'Re: 7/16 OSB truck tomorrow?',
    customerName: 'Harold Singh',
    location: 'Columbus, OH',
    productTags: ['7/16 Edge OSB', '3/8 edge clips', 'boom delivery'],
    repPersona: 'sales@lumberone.net',
    customerPersona: 'h.singh@midwestframing.com',
    tags: ['email', 'inbound', 'order'],
    notable: ['Wants 50 sheets and clips before pour'],
    emailTranscript: `From: sales@lumberone.net
To: h.singh@midwestframing.com
Cc: dispatch@lumberone.net
Subject: Re: 7/16 OSB truck tomorrow?

Hi Harold —

Yes, we can hit your Columbus yard by 6:15 AM. I put 50 sheets 7/16 Weyerhaeuser on hold under PO #M44821 and added 200 Stinger 3/8 edge clips. If you need another bundle of 2x4x92-5/8, say the word; we can still add before load-out at 4.

Thanks,
Avery (Inside sales)`,
  },
  {
    id: 'ly-mail-02-trim-raleigh',
    callDate: '2026-04-23',
    title: 'Finger-joint poplar lead time',
    customerName: 'Morgan Ellis',
    location: 'Raleigh, NC',
    productTags: ['1x4 FJ poplar 16′', 'MDF 7-1/4 base', 'primed jamb ext'],
    repPersona: 'trimdesk@lumberone.net',
    customerPersona: 'morgan@coastalremodel.com',
    tags: ['email', 'interior', 'quote'],
    notable: ['Kitchen reno, paint-grade'],
    emailTranscript: `From: morgan@coastalremodel.com
To: trimdesk@lumberone.net
Subject: Finger-joint poplar lead time

Team,

Do you have 16' finger-joint poplar 1x4 in stock, or a firm date? I need 240 LF, plus 80 LF of 7-1/4 MDF base (primed) and 3 jamb ext kits. Job is off Wake Forest Road.

— Morgan

---

From: trimdesk@lumberone.net
To: morgan@coastalremodel.com
Subject: Re: Finger-joint poplar lead time

Morgan —

We can ship FJ poplar 4/20 from Charlotte DC; MDF base in Greensboro, pull tomorrow. I quoted line items and kept margin at your pro tier.

Best,
Holly (Trim desk)`,
  },
  {
    id: 'ly-mail-03-fence-nashville',
    callDate: '2026-04-22',
    title: 'Cedar 1x6 picket pricing',
    customerName: 'DeShawn Lee',
    location: 'Nashville, TN',
    productTags: ['1x6 WRC picket', '4x4x10 #2 PT', 'Post cap copper'],
    repPersona: 'yardsales@lumberone.net',
    customerPersona: 'd.lee@durablefenceco.com',
    tags: ['email', 'bid'],
    notable: ['Subdivision fence phase 2'],
    emailTranscript: `From: d.lee@durablefenceco.com
To: yardsales@lumberone.net
Subject: Cedar 1x6 picket pricing

Need 1x6x6 WRC and 4x4x10 treated for 240 LF. Your last quote was pre–tariff. Send refresh plus copper caps (Atlantis) if you stock.

Thanks,
DeShawn`,
  },
  {
    id: 'ly-mail-04-lp-siding-boise',
    callDate: '2026-04-21',
    title: 'LP SmartSide vs hardboard lap',
    customerName: 'Ivy Cho',
    location: 'Boise, ID',
    productTags: ['LP SmartSide 12′', 'SmartSide trim', 'Cor-A-Vent SV-5'],
    repPersona: 'exteriors@lumberone.net',
    customerPersona: 'i.cho@highdesertexteriors.com',
    tags: ['email', 'spec', 'warranty'],
    notable: ['Builder request for LP on spec home'],
    emailTranscript: `From: exteriors@lumberone.net
To: i.cho@highdesertexteriors.com
Subject: LP SmartSide vs hardboard lap

Ivy —

Attached: SmartSide 12" lap, trim pack, and Cor-A-battens spec sheet. LP carries 5/50 warranty on prefinish when installed per bulletin; we can get factory match on trim.

Omar
Exteriors desk`,
  },
  {
    id: 'ly-mail-05-dallas-lvl',
    callDate: '2026-04-20',
    title: 'LVL 11-7/8 delivery slot',
    customerName: 'Rafael Cordero',
    location: 'Dallas, TX',
    productTags: ['1.75×11-7/8 LVL 2.0E', 'ABU 6x6Z', 'SDS 5/8×8'],
    repPersona: 'structural@lumberone.net',
    customerPersona: 'r.cordero@beamworks-tx.com',
    tags: ['email', 'heavy', 'truck'],
    notable: ['Second beam add-on to same address'],
    emailTranscript: `From: r.cordero@beamworks-tx.com
To: structural@lumberone.net
Subject: LVL 11-7/8 delivery slot

Can you fold two more 11-7/8 x 20' on the 4/22 flatbed? Need Simpson ABU6 post caps and a bucket of 5/8 SDS screws. Forklift on site 7–2.

Rafael`,
  },
  {
    id: 'ly-mail-06-door-phoenix',
    callDate: '2026-04-19',
    title: 'Hollow metal frame — anchor pack',
    customerName: 'Carmen Ibarra',
    location: 'Phoenix, AZ',
    productTags: ['16 ga HM 3-0x7-0', 'Masonry sleeve kit', 'Tapcon 3/16'],
    repPersona: 'commercial@lumberone.net',
    customerPersona: 'c.ibarra@sunbelt-openings.com',
    tags: ['email', 'commercial'],
    notable: ['Rush: GC pushed pour'],
    emailTranscript: `From: commercial@lumberone.net
To: c.ibarra@sunbelt-openings.com
Subject: Re: Hollow metal frame — anchor pack

Carmen —

Frames pulled from West hub; I added the masonry anchor pack (Tapcon 3/16 x 2-1/2) and shims. Will-call is ready 3 PM today.

Q (Pro desk)`,
  },
  {
    id: 'ly-mail-07-stain-minneapolis',
    callDate: '2026-04-18',
    title: 'Cabot order + brush pack',
    customerName: 'Kari Lindstrom',
    location: 'Minneapolis, MN',
    productTags: ['Cabot ATO', 'Purdy Clearcut', 'cedar restorer'],
    repPersona: 'coatings@lumberone.net',
    customerPersona: 'k.lindstrom@northshorepaint.com',
    tags: ['email', 'order'],
    notable: ['Color match to existing gable'],
    emailTranscript: `From: k.lindstrom@northshorepaint.com
To: coatings@lumberone.net
Subject: Cabot order + brush pack

Please ship 2 gal Cabot ATO, warm tint; add 2 Purdy 3" Clearcut and 1 gal of your cedar restorer. Hold for will-call Eagan.

Kari`,
  },
  {
    id: 'ly-mail-08-gate-okc',
    callDate: '2026-04-17',
    title: 'Tarter gate vs. tube steel',
    customerName: 'Buck Hannigan',
    location: 'Oklahoma City, OK',
    productTags: ['Tarter 6-bar 14ft', '2x4x16 PT', 'Non-climb 2×4 12.5ga'],
    repPersona: 'ag@lumberone.net',
    customerPersona: 'b.hannigan@redclayfarms.com',
    tags: ['email', 'livestock'],
    notable: ['Gates to match existing line posts'],
    emailTranscript: `From: b.hannigan@redclayfarms.com
To: ag@lumberone.net
Subject: Tarter gate vs. tube steel

Gus — I'm comparing the Tarter 6-bar 14' to a tube build. Need roll prices for both plus H-brace wire. T-post count if you can ballpark 400 LF.

Buck`,
  },
  {
    id: 'ly-mail-09-plywood-milwaukee',
    callDate: '2026-04-16',
    title: 'Advantech 23/32 — moisture concern',
    customerName: 'Evan Price',
    location: 'Milwaukee, WI',
    productTags: ['23/32 Advantech', '19/32 sheathing', 'Stinger R60'],
    repPersona: 'floor@lumberone.net',
    customerPersona: 'e.price@badgertruss.com',
    tags: ['email', 'moisture'],
    notable: ['Basement re-sheet after flood'],
    emailTranscript: `From: e.price@badgertruss.com
To: floor@lumberone.net
Subject: Advantech 23/32 — moisture concern

Evan here —

Customer wants 23/32 for subfloor in a 3-day-dry job. We usually run 19/32 on truss floor. Can you spec fastener pattern for Advantech + mention Stinger R60 for crew?

Thanks,
Evan`,
  },
  {
    id: 'ly-mail-10-pergola-atlanta',
    callDate: '2026-04-15',
    title: '6x6 rough cedar + hardware',
    customerName: 'Jada Williams',
    location: 'Atlanta, GA',
    productTags: ['6x6x12 #2 WRC', '2x8x12 rough', 'OWT Ozco plate'],
    repPersona: 'outdoor@lumberone.net',
    customerPersona: 'j.williams@porchnative.com',
    tags: ['email', 'outdoor', 'retail'],
    notable: ['DIY client wants kit alternative'],
    emailTranscript: `From: j.williams@porchnative.com
To: outdoor@lumberone.net
Subject: 6x6 rough cedar + hardware

Ash —

Can I get 4 ea 6x6x12, 2x8x12, and 4 of the Ozco OWT plates? Customer passed on an Amazon kit; I want a clean BOM.

Jada`,
  },
  {
    id: 'ly-mail-11-barn-board-seattle',
    callDate: '2026-04-14',
    title: 'Rush: barn board + Bona R440',
    customerName: 'Yuki Tan',
    location: 'Seattle, WA',
    productTags: ['1x8 shiplap pine', 'Bona R440', 'rental belt 4×24'],
    repPersona: 'nightcrew@lumberone.net',
    customerPersona: 'yuki@lumenkitchens.com',
    tags: ['email', 'rush'],
    notable: ['Holiday install pressure'],
    emailTranscript: `From: yuki@lumenkitchens.com
To: nightcrew@lumberone.net
Subject: Rush: barn board + Bona R440

Mira —

Need 400 SF 1x8, R440, and 80-grit for rental sander if you can cross-rent. Pickup 11 PM if possible. I'll buy beer for your crew. 🍕

Yuki`,
  },
  {
    id: 'ly-mail-12-2x4-boston',
    callDate: '2026-04-13',
    title: '2x4 bundle + sinkers — pro desk',
    customerName: 'Owen Flaherty',
    location: 'Boston, MA',
    productTags: ['2x4x96 SPF', '16d sinker box', '33° strip nails 3-1/4'],
    repPersona: 'prodesk@lumberone.net',
    customerPersona: 'o.flaherty@charitybuild.org',
    tags: ['email', 'pro'],
    notable: ['Volunteer build weekend'],
    emailTranscript: `From: o.flaherty@charitybuild.org
To: prodesk@lumberone.net
Subject: 2x4 bundle + sinkers

Need 8 bundles 2x4, one box 16d common, 2 coils 33°. Tax-exempt on file. Load-out 6 AM.

Owen`,
  },
  {
    id: 'ly-mail-13-siding-slc',
    callDate: '2026-04-12',
    title: 'James Hardie vs. LP in zone 2',
    customerName: 'Mitch Vogel',
    location: 'Salt Lake City, UT',
    productTags: ['Hardie 8-1/4', 'HardiFlex trim', 'Z-flashing'],
    repPersona: 'exteriors@lumberone.net',
    customerPersona: 'm.vogel@waselect.com',
    tags: ['email', 'compare'],
    notable: ['HOA spec conflict'],
    emailTranscript: `From: m.vogel@waselect.com
To: exteriors@lumberone.net
Subject: James Hardie vs. LP in zone 2

Omar —

Can you document wind load for 8-1/4 Hardie vs LP in our county? HOA wants a letter on the record.

Mitch`,
  },
  {
    id: 'ly-mail-14-jeld-stlouis',
    callDate: '2026-04-11',
    title: 'Jeld-Wen swap on existing PO',
    customerName: 'Sonia Malik',
    location: 'St. Louis, MO',
    productTags: ['JELD-WEN 6055 fir', 'oil-rubbed hinge 4½"', 'Astragal ext kit'],
    repPersona: 'willcall@lumberone.net',
    customerPersona: 's.malik@handyheartland.com',
    tags: ['email', 'return'],
    notable: ['Homeowner color conflict'],
    emailTranscript: `From: s.malik@handyheartland.com
To: willcall@lumberone.net
Subject: Jeld-Wen swap on existing PO

Sienna —

GC approved swap from generic to 6055 fir 6-8. Need revised PO and hinge pack ORB. Will pick up 4/10.

Sonia`,
  },
  {
    id: 'ly-mail-15-deck-denver',
    callDate: '2026-04-10',
    title: 'TimberTech samples + stainless screws',
    customerName: 'Lena Orozco',
    location: 'Denver, CO',
    productTags: ['TimberTech AZEK Vintage', 'Cortex screws', ' joist tape'],
    repPersona: 'decks@lumberone.net',
    customerPersona: 'l.orozco@rockymtnremodels.com',
    tags: ['email', 'samples'],
    notable: ['HOA cap on composite'],
    emailTranscript: `From: l.orozco@rockymtnremodels.com
To: decks@lumberone.net
Subject: TimberTech samples + stainless screws

Marcus —

Send 3 board samples Vintage (dark) + Cortex 2-1/2 box, plus joist tape for 400 SF. I’ll swing by the Aurora DC.

Lena`,
  },
].map((e) => ({ ...e, source: 'email' }))

const fields = [
  {
    id: 'ly-field-01-aurora-visit',
    callDate: '2026-04-24',
    title: 'Site visit: Aurora multifamily',
    customerName: 'Darius Cole',
    location: 'Aurora, CO',
    productTags: ['HardiPlank 7"', 'VaproShield WRB', 'Rainscreen 3mm'],
    repPersona: 'Kai Nakamura — field sales',
    customerPersona: 'Darius Cole — GC sup',
    tags: ['field', 'exterior', 'voicenote'],
    notable: ['Wants WRB + vented rain screen'],
    fieldNotesText: `Voice note — April 24, 4:10 PM, outside trailer on Filmore.

"Stopped by the Aurora MF shell. Darius walked the south elevation with me. He’s comparing Hardie 7" lap against LP SmartSide for cost but cares more about the WRB — wants VaproShield and a 3mm mat-style rain screen so inspectors see capillary break. I told him we stock Cor-A-battens as an alternative if budget tight. Follow up: send a two-system quote with a dry-stack detail from James Hardie bulletin. He’s pushing pour next Tuesday — materials decision by Monday."`,
  },
  {
    id: 'ly-field-02-kansas-truss',
    callDate: '2026-04-23',
    title: 'Truss company walk-through',
    customerName: 'Pete Sorenson',
    location: 'Kansas City, MO',
    productTags: ['Weyerhaeuser Edge OSB', 'Advantech T&G', 'SDS 5/8×6'],
    repPersona: 'Devin Moss — field sales',
    customerPersona: 'Pete Sorenson — plant mgr',
    tags: ['field', 'truss', 'voicenote'],
    notable: ['Sheathing bundle schedule'],
    fieldNotesText: `Voice — KC truss plant, shop floor, noisy.

"Met Pete on the line. He’s short 7/16 OSB this week; wants Edge Gold over commodity because the crew nicks the corners less. Threw in Advantech 23/32 T&G for the high-humidity laydown area. Quoted Stinger 3/8 clips + SDS 5/8×6 in bulk. He asked if we can stage two drops Wed/Fri; I said yes with 4-hour window."`,
  },
  {
    id: 'ly-field-03-riverwalk-deck',
    callDate: '2026-04-22',
    title: 'Backyard deck — river walkout',
    customerName: 'Alison Reeves',
    location: 'Little Rock, AR',
    productTags: ['5/4x6 ipe', 'Cortex stainless', 'Lateral tension ties'],
    repPersona: 'Sana Rahman — field sales',
    customerPersona: 'Alison Reeves — architect homeowner',
    tags: ['field', 'deck', 'voicenote'],
    notable: ['Wants hidden fasteners, stainless'],
    fieldNotesText: `Voice at walkout, wind off river.

"Alison wants 5/4x6 ipe, not composite — maintenance budget is fine, aesthetics drive. I showed Cortex and GRK RSS for ledger; she’s worried about lateral load on a cantilever. I sketched 2-2x8 dropped beam with Simpson DTT2Z ties. Note: send LVL header calc example from our vendor packet so she can share with her engineer by Friday."`,
  },
  {
    id: 'ly-field-04-church',
    callDate: '2026-04-21',
    title: 'Parish hall re-roof day',
    customerName: 'Rev. Amos Nyerere',
    location: 'Mobile, AL',
    productTags: ['OSB 15/32', 'GAF Timberline HDZ', 'drip edge galv'],
    repPersona: 'Gina Loft — field sales',
    customerPersona: 'Rev. Amos Nyerere',
    tags: ['field', 'charity', 'voicenote'],
    notable: ['Tight window before Easter'],
    fieldNotesText: `Voice in parking lot after ladder inspection.

"Roof is two-layer tear; Rev. Nyerere wants 15/32 and HDZ in charcoal. Budget is a stretch — I offered house-brand OSB in same PO if GAF bundle ships together. Drip edge galv, not aluminum; coastal wind zone. Follow up: send volunteer pricing sheet and a Sunday delivery if dispatch allows."`,
  },
  {
    id: 'ly-field-05-clinic-tenant',
    callDate: '2026-04-20',
    title: 'Tenant build-out spec',
    customerName: 'Nico Ferreira',
    location: 'Tampa, FL',
    productTags: ['5/8 type X', 'Hollow metal 3068', 'Acoustical 2x4'],
    repPersona: 'Luis Caro — field sales',
    customerPersona: 'Nico Ferreira — GC',
    tags: ['field', 'commercial', 'voicenote'],
    notable: ['Lead-lined option discussed'],
    fieldNotesText: `Dictated in truck between sites.

"Clinic build-out, Nico wants 5/8 Type X in exam rooms, HM 3068 frames, basic acoustical. Mentioned lead-lined gypsum in X-ray; I do NOT stock — told him to call RadShield rep; I can coordinate delivery on everything else. Door schedule due Thursday."`,
  },
  {
    id: 'ly-field-06-horsebarn',
    callDate: '2026-04-19',
    title: 'Horse barn re-clad',
    customerName: 'Hayley Crump',
    location: 'Lexington, KY',
    productTags: ['1x6 board & batten', 'cedar 5/4x4', 'Tarter stall grill'],
    repPersona: 'Brett Cline — field sales',
    customerPersona: 'Hayley Crump — owner',
    tags: ['field', 'ag', 'voicenote'],
    notable: ['Prefers WRC, low VOC stain'],
    fieldNotesText: `Voice — paddock side, rain starting.

"Hayley is refreshing the barn. She wants 1x6 B&B vertical WRC, 5/4x4 for trim, Tarter heavy stall fronts if we can match price to Tractor Supply. I warned her on WRC check — we should bundle stain pre-order Cabot. She wants a sample board left at office."`,
  },
  {
    id: 'ly-field-07-warehouse',
    callDate: '2026-04-18',
    title: 'Spec warehouse racking mezz',
    customerName: 'Jin Park',
    location: 'Memphis, TN',
    productTags: ['2x10x20 SPF', 'Simpson A35', 'Simpson Titen HD'],
    repPersona: 'Kara Wynn — field sales',
    customerPersona: 'Jin Park — facilities',
    tags: ['field', 'industrial', 'voicenote'],
    notable: ['Mezz bracing to existing steel'],
    fieldNotesText: `Voice, echoey warehouse.

"Jin is adding a mezz platform off existing columns. Thinks 2x10 joists on 12; I said let structural stamp it — I can supply 2x10x20, A35s for ledger, and Titen for posts into slab. He wants a cut list and delivery before electrical rough — date is soft—push team for 4/25."`,
  },
  {
    id: 'ly-field-08-restaurant',
    callDate: '2026-04-17',
    title: 'Open-kitchen FRP + trim',
    customerName: 'Benoit Fortier',
    location: 'New Orleans, LA',
    productTags: ['0.09 FRP white', 'MDF 5-1/2 base', 'bullnose cap'],
    repPersona: 'Alicia Mora — field sales',
    customerPersona: 'Benoit Fortier — restaurateur',
    tags: ['field', 'hospitality', 'voicenote'],
    notable: ['Health dept walk soon'],
    fieldNotesText: `Voice, kitchen under demo.

"Benoit needs FRP for back wall, MDF base, bullnose cap on bar face. I flagged humidity — FRP with compatible adhesive, not double-stick tape. Wants 1x8 barn-look in dining already ordered elsewhere; I’m only wiring trim + FRP on this visit."`,
  },
  {
    id: 'ly-field-09-cabin',
    callDate: '2026-04-16',
    title: 'Cabin on lake access road',
    customerName: 'Theo Brandt',
    location: 'Traverse City, MI',
    productTags: ['1x6 pine V-joint', 'Cedar 4x4 post', 'Dock screws 3-1/2'],
    repPersona: 'Nora Pike — field sales',
    customerPersona: 'Theo Brandt — weekend builder',
    tags: ['field', 'retreat', 'voicenote'],
    notable: ['Moisture at lake level'],
    fieldNotesText: `Voice, gravel drive.

"Theo is doing interior V-groove 1x6 in great room; exterior posts 4x4 WRC, dock screws 316 stainless. I reminded him to ventilate behind pine — borate treat if he won’t. He’s picking up a belt sander rental when barn board lands."`,
  },
  {
    id: 'ly-field-10-solar',
    callDate: '2026-04-15',
    title: 'Solar racking on standing seam',
    customerName: 'Priyanka Das',
    location: 'Albuquerque, NM',
    productTags: ['2x8 rafter 16 OC', 'S-5! clamp N', 'K2 rail kit'],
    repPersona: 'Eddie Ruiz — field sales',
    customerPersona: 'Priyanka Das — installer',
    tags: ['field', 'solar', 'voicenote'],
    notable: ['Metal roof clip pattern'],
    fieldNotesText: `Voice, roof edge harness on.

"Priyanka’s crew needs S-5! Mini clamps for K2, plus 2x8 blocking pattern we stock. I do NOT supply rails — I gave her a parts list; she will buy rails direct. I confirmed she has clip spacing doc from S-5! — photo attached in CRM."`,
  },
  {
    id: 'ly-field-11-school',
    callDate: '2026-04-14',
    title: 'Gym floor repair window',
    customerName: 'Calvin Wu',
    location: 'Portland, OR',
    productTags: ['2x6x8 SPF', '23/32 T&G maple', 'Bona 2K finish'],
    repPersona: 'Meg Silva — field sales',
    customerPersona: 'Calvin Wu — facilities mgr',
    tags: ['field', 'edu', 'voicenote'],
    notable: ['Summer only install'],
    fieldNotesText: `Voice, under bleachers.

"Cal wants summer-only gym replace — 23/32 maple, Bona 2K, sleeper fix with 2x6. I need quote by June board meeting. I flagged moisture testing — 5 spots before order."`,
  },
  {
    id: 'ly-field-12-apt',
    callDate: '2026-04-13',
    title: 'Repipe chase — LVP schedule',
    customerName: 'Irene Santos',
    location: 'San Antonio, TX',
    productTags: ['7mm LVP with pad', '1/4 underlayment', 'schluter strip'],
    repPersona: 'Jorge Ibarra — field sales',
    customerPersona: 'Irene Santos — super',
    tags: ['field', 'multifam', 'voicenote'],
    notable: ['Noise complaint stack'],
    fieldNotesText: `Voice, hallway, kids in background.

"Irene re-pipes unit stack; LVP 7mm with attached pad, Schluter at wet wall. I told her 1/4 underlay is optional on concrete but helps sound. We’ll sync delivery after rough inspection Thursday."`,
  },
  {
    id: 'ly-field-13-brewery',
    callDate: '2026-04-12',
    title: 'Brewery taproom cedar bar',
    customerName: 'Greta Hollen',
    location: 'Asheville, NC',
    productTags: ['2x10 cedar rough', 'Waterlox marine', 'bar rail cap'],
    repPersona: 'Cameron Voss — field sales',
    customerPersona: 'Greta Hollen — owner',
    tags: ['field', 'hospitality', 'voicenote'],
    notable: ['NSF adjacent'],
    fieldNotesText: `Voice, keg clank.

"Greta wants 2x10 cedar face for bar, Waterlox Satin, rail cap. I said seal schedule before first pour. Health inspector wants non-porous splash — I suggested solid surface cap at bartender well only."`,
  },
  {
    id: 'ly-field-14-condo',
    callDate: '2026-04-11',
    title: 'Balcony re-sheet',
    customerName: 'Samira Okonkwo',
    location: 'Chicago, IL',
    productTags: ['1/2 DensGlass sheathing', 'Flashing tape 4"', 'Hardie 5/16'],
    repPersona: 'Devon Walsh — field sales',
    customerPersona: 'Samira Okonkwo — HOA board',
    tags: ['field', 'condo', 'voicenote'],
    notable: ['Wind off lake'],
    fieldNotesText: `Voice, balcony, wind.

"HOA re-sheet project — DensGlass at balcony soffit, 4" flashing tape, Hardie 5/16 re-wrap. I told Samira clip spacing to engineer spec; we’re not certifying. Delivery to alley; no crane Saturday."`,
  },
  {
    id: 'ly-field-15-orchard',
    callDate: '2026-04-10',
    title: 'Barn + irrigation shed',
    customerName: 'Etta Graham',
    location: 'Hood River, OR',
    productTags: ['2x6x10 PT', 'T-111 5/8', 'Corrugated 29ga'],
    repPersona: 'Nora Pike — field sales',
    customerPersona: 'Etta Graham — orchardist',
    tags: ['field', 'ag', 'voicenote'],
    notable: ['High moisture valley'],
    fieldNotesText: `Voice, orchard access road.

"Etta needs 2x6x10 for shed frame, 5/8 T-111, 29ga wavy. Valley moisture — I spec'd PT ground contact, borate for interior T-111 if she will flash windows. Wants a Friday drop before crew flies out."`,
  },
].map((e) => ({ ...e, source: 'field_notes' }))

writeFileSync(
  OUT,
  JSON.stringify(
    { version: 1, generated: new Date().toISOString(), entries: [...emails, ...fields] },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log('Wrote', OUT, 'entries:', emails.length + fields.length)
