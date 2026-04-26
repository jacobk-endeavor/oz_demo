/**
 * One-time patch: Russin-style demo narratives + shared hero account (Hudson Valley Deck & Porch / Morgan).
 * Run: node lumberyard-calls/tools/patch-russin-demo-2026.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const lib = path.join(root, 'call-library.json')
const activity = path.join(root, 'activity-mock.json')

const callsPatch = {
  'lumber-01-cedar-timbertech-diy': {
    title: 'Thermory & AZEK samples — Montgomery deck refresh',
    callDate: '2026-04-26',
    location: 'Montgomery, NY',
    customerName: 'Morgan Ellis',
    productTags: ['Thermory Ash 1x6', 'AZEK Vintage wide board', 'Deckorators ALX aluminum rail'],
    tags: ['purchase', 'competitor', 'product-preference', 'contractor', 'russin-hero'],
    notable: [
      'Hudson Valley Deck & Porch: Morgan compares Russin in-yard samples to a Beacon (BECN) photo; wants Thermory + AZEK in one deck pack, factory prefinish, deck/rail takeoff; architect (Studio Ellison) may join Russin CEU.',
    ],
    repPersona: 'Jordan Hayes — exteriors & decking, Russin',
    customerPersona: 'Morgan Ellis — project lead, Hudson Valley Deck & Porch Co.',
  },
  'lumber-02-contractor-pt-lumber-homedepot': {
    title: 'Duplex frame — ABC pro desk vs. Russin will-call',
    callDate: '2026-04-20',
    location: 'Hudson, WI',
    customerName: 'Dante Romero',
    productTags: ['2x6x12 #2 PT', '7/16 OSB sheathing', 'Simpson H2.5A hangers'],
    tags: ['purchase', 'competitor', 'pro-account', 'contractor'],
    notable: [
      'Pro GC mentions ABC Supply for PT bundles; still wants Russin for engineered stock + credit line on structural pulls.',
    ],
    repPersona: 'Avery Collins — pro desk & commercial, Russin',
    customerPersona: 'Dante Romero — GC, multifamily in-fill',
  },
  'lumber-03-cedar-odor-vs-pt-fence': {
    title: 'WRC privacy vs. big-box picket color drift',
    callDate: '2026-04-14',
    location: 'Garrison, NY',
    customerName: 'Lorraine Hale',
    productTags: ['1x6 Western Red Cedar pickets', '4x4x8 #2 PT', 'Cedar post cap'],
    tags: ['product-preference', 'purchase', 'homeowner', 'russin-narrative'],
    notable: [
      'Homeowner planning exterior; Russin is B2B but newsletter + consult led her in; she wants true WRC, not box-store return-bin batch.',
    ],
    repPersona: 'Priya Nair — treated & natural cedar, Russin',
    customerPersona: 'Lorraine Hale — homeowner, weekend renovation',
  },
  'lumber-04-plywood-menards-mention': {
    title: 'Advantech sheathing — big-box ad vs. dealer delivery',
    callDate: '2026-04-13',
    location: 'Poughkeepsie, NY',
    customerName: 'Arun Patel',
    productTags: ['19/32 CDX', '23/32 Advantech', 'Stinger cap staples'],
    tags: ['competitor', 'product-preference', 'purchase', 'dealer', 'russin-narrative'],
    notable: [
      'Lumberyard buyer for North River: compares Menards ad to Russin LTL drop for Advantech + job pack.',
    ],
    repPersona: 'Miguel Vásquez — receiving, Russin',
    customerPersona: 'Arun Patel — buyer, independent lumberyard (dealer account)',
  },
  'lumber-05-lvl-simpson-hangers': {
    title: 'LVL + Simpson — beam pocket that moved (porch sub)',
    callDate: '2026-04-19',
    location: 'Wappingers Falls, NY',
    customerName: 'Rigo Salazar',
    productTags: ['1.75x11-7/8 LVL 2.0E', 'Simpson LUS210', 'ABU66Z post cap'],
    tags: ['purchase', 'product-preference', 'contractor'],
    notable: [
      'Carpenter under Morgan on same exteriors pipeline; L&W mentioned for hangers but wants Russin cut-to-length LVL for tomorrow.',
    ],
    repPersona: 'Tessa Ibarra — structural desk, Russin',
    customerPersona: 'Rigo Salazar — lead carpenter, Hudson Valley Deck & Porch',
  },
  'lumber-06-trim-moulding-package-84-lumber': {
    title: 'Interior casing — 84 visit vs. Russin milled poplar',
    callDate: '2026-04-12',
    location: 'Kingston, NY',
    customerName: 'Nina Wexler AIA',
    productTags: ['1x4 finger-joint poplar', 'Primed MDF base', 'Custom mill re-profile'],
    tags: ['competitor', 'product-preference', 'architect', 'russin-narrative'],
    notable: [
      'Architect (Studio Ellison) cross-shopped 84; Russin custom milling for knife match + CEU follow-up for Hardie/trim integration.',
    ],
    repPersona: 'Holly Brenner — interior trim, Russin',
    customerPersona: 'Nina Wexler AIA — specifying principal, residential',
  },
  'lumber-07-pro-desk-lowes-compare': {
    title: 'Hollow metal — Lowe’s pro vs. L&W for anchors',
    callDate: '2026-04-11',
    location: 'Albany, NY',
    customerName: 'Bri Turner',
    productTags: ['Curries 16ga HM frame', '18ga door slab 3-0x7-0', 'Tapcon anchors'],
    tags: ['competitor', 'purchase', 'contractor'],
    notable: [
      'Site super: Lowe’s lead time; Russin can bundle HM with Tapcons same day; mentions L&W on fasteners.',
    ],
    repPersona: 'Quentin Okafor — pro desk commercial, Russin',
    customerPersona: 'Bri Turner — field superintendent, commercial TI',
  },
  'lumber-08-wrong-cut-return-jeldwen': {
    title: 'Jeld-Wen spec stick — return line tension',
    callDate: '2026-04-10',
    location: 'Middletown, NY',
    customerName: 'Sonia Malik',
    productTags: ['JELD-WEN 6055 fir slab 6-8', 'Prehung jamb', 'ORB hinge pack'],
    tags: ['product-preference', 'small-transaction', 'dealer', 'russin-narrative'],
    notable: [
      'Dealer (North River) will-call: homeowner spec conflict; she wants the fir slab Russin can swap from existing PO.',
    ],
    repPersona: 'Sienna Cole — will-call, Russin',
    customerPersona: 'Sonia Malik — pro buyer, North River Lumber & Building',
  },
  'lumber-09-siding-lp-vs-composite-mention': {
    title: 'James Hardie rainscreen — spec builder re-order',
    callDate: '2026-04-18',
    location: 'Beacon, NY',
    customerName: 'Nadia Fayed',
    productTags: ['James Hardie 8-1/4 HardiePlank', 'Cor-A-Vent SV-5', 'Tyvek CommercialWrap'],
    tags: ['competitor', 'product-preference', 'purchase', 'contractor'],
    notable: [
      'Builder comparing LP vs. Hardie; next leg ties to same Montgomery job Morgan has on the books.',
    ],
    repPersona: 'Omar Khalil — exteriors, Russin',
    customerPersona: 'Nadia Fayed — spec home builder, quality sensitive',
  },
  'lumber-10-osb-weyerhaeuser-preference': {
    title: 'Weyerhaeuser Edge sheathing — LTL framer',
    callDate: '2026-04-17',
    location: 'New Paltz, NY',
    customerName: 'Ike Watanabe',
    productTags: ['7/16 Edge Gold OSB', '3/8 edge clips', '2x4x92-5/8 stud'],
    tags: ['product-preference', 'purchase', 'contractor'],
    notable: [
      'Framer: prefers Weyer; Russin can stage with ABC-style bundle pricing on OSB in season.',
    ],
    repPersona: 'Cal Fisher — stock desk, Russin',
    customerPersona: 'Ike Watanabe — owner-operator framer',
  },
  'lumber-11-pergola-raw-cedar-kits': {
    title: 'Millboard & Thermory over Amazon kit — outdoor living',
    callDate: '2026-04-16',
    location: 'Rhinebeck, NY',
    customerName: 'Jada Williams',
    productTags: ['Millboard Envello', 'Thermory pine decking', 'OWT Ornamental Wood Ties'],
    tags: ['competitor', 'product-preference', 'purchase', 'russin-narrative'],
    notable: [
      'Porch & rail contractor; says Amazon kit looked cheap; wants Millboard + Thermory through Russin with hidden fasteners.',
    ],
    repPersona: 'Ash Winters — outdoor living, Russin',
    customerPersona: 'Jada Williams — design-build, Porchnative Co.',
  },
  'lumber-12-stain-cabot-rival': {
    title: 'Cabot ATO for Thermory — stain aisle comparison',
    callDate: '2026-04-15',
    location: 'Nyack, NY',
    customerName: 'Hector Ruiz',
    productTags: ['Cabot Australian Timber Oil', 'Thermory prefinish touch-up', 'Purdy Clearcut'],
    tags: ['competitor', 'product-preference', 'contractor'],
    notable: [
      'Cabinet/finish sub on Morgan’s project; big-box stain aisle; Russin can bundle Cabot with Thermory care kit.',
    ],
    repPersona: 'Pilar Duarte — coatings, Russin',
    customerPersona: 'Hector Ruiz — cabinet & deck finisher, side job',
  },
  'lumber-13-2x4-bulk-lowes-out': {
    title: '2x4 bundle — box out of stock, L&W parallel quote',
    callDate: '2026-04-12',
    location: 'Carmel, NY',
    customerName: 'Owen Flaherty',
    productTags: ['2x4x96 #2 SPF', '16d common', '33° strip nails 3-1/4'],
    tags: ['competitor', 'purchase', 'russin-narrative'],
    notable: [
      'Church build volunteer; Russin can fill 2x like L&W; nonprofit pricing sheet in CRM.',
    ],
    repPersona: 'Ren Park — load-out, Russin',
    customerPersona: 'Owen Flaherty — volunteer coordinator, community build',
  },
  'lumber-14-farm-gates-posts-tarter': {
    title: 'Tarter gate vs. Russin WRC + ag package',
    callDate: '2026-04-12',
    location: 'Pine Bush, NY',
    customerName: 'Rita Velásquez',
    productTags: ['Tarter 10 ft equestrian gate', '48" non-climb 12.5ga', '4x4x10 #2 PT'],
    tags: ['competitor', 'product-preference', 'purchase', 'homeowner', 'russin-narrative'],
    notable: [
      'Small acreage: compares Tractor Supply / Tarter to Russin PT + fence package.',
    ],
    repPersona: 'Gus Morrow — ag & ranch, Russin',
    customerPersona: 'Rita Velásquez — homeowner, equestrian',
  },
  'lumber-15-rush-barn-board-holiday': {
    title: 'Rush T&G — same-week Thermory + Bona (restaurant)',
    callDate: '2026-04-19',
    location: 'Newburgh, NY',
    customerName: 'Benoit Fortier',
    productTags: ['1x8 pine T&G shiplap', 'Bona R440 sealer', 'Clark belt sander'],
    tags: ['purchase', 'competitor', 'product-preference', 'hospitality'],
    notable: [
      'F&B fit-out: regional supplier undercut; Russin got barn board + Bona in one drop for health-inspection week.',
    ],
    repPersona: 'Mira Lugo — night-crew & closings, Russin',
    customerPersona: 'Benoit Fortier — restaurateur, build-out on clock',
  },
}

const raw = JSON.parse(readFileSync(lib, 'utf8'))
for (const c of raw.calls) {
  const p = callsPatch[c.id]
  if (p) Object.assign(c, p)
}
writeFileSync(lib, JSON.stringify(raw, null, 2) + '\n', 'utf8')
console.log('Patched', Object.keys(callsPatch).length, 'calls in call-library.json')

const heroEntries = [
  {
    id: 'russin-hero-mail-thermory-0426',
    callDate: '2026-04-26',
    title: 'Re: Thermory + AZEK takeoff (Montgomery job — Morgan)',
    customerName: 'Morgan Ellis',
    location: 'Montgomery, NY',
    productTags: ['Thermory Ash 1x6', 'AZEK Vintage', 'Factory prefinish top coat'],
    repPersona: 'decks@russin.com',
    customerPersona: 'morgan@hudsonvalleydeckporch.com',
    tags: ['email', 'contractor', 'russin-hero', 'exteriors'],
    notable: [
      'Morgan asks Russin to lock Thermory + AZEK package pricing before Thursday pour; same thread references rail schedule for Deckorators ALX; CC: North River for dealer will-call on fasteners.',
    ],
    emailTranscript: `From: morgan@hudsonvalleydeckporch.com
To: decks@russin.com
Cc: orderdesk@russin.com, buyers@northriverlumber.com
Subject: Re: Thermory + AZEK takeoff (Montgomery job — Morgan)

Jordan —

Please confirm factory prefinish for Thermory Ash on the gable “wrap” and AZEK Vintage on the deck field. I’m matching what we saw in the yard vs. a Beacon (BECN) photo the architect pulled—she wants a CEU on rainscreen if your team is still doing the Tuesday lunch series.

We’re pulling the deck pack and rails through the usual Russin + North River handoff so my dealer can use **Check Order Status** on the PO. Need ship-to Montgomery by early next week; I’ll be on site with Rigo the same day as the LVL sub.

Morgan
Hudson Valley Deck & Porch Co.

---
From: decks@russin.com
To: morgan@hudsonvalleydeckporch.com
Subject: Re: Thermory + AZEK takeoff (Montgomery job — Morgan)

Morgan —

Locked. Thermory + AZEK in one exteriors bundle; ALX rail BO under same quote; factory finish top coat per bulletin. I’ll have CEU link for Studio Ellison (AIA) on rainscreen + Hardie interface.
Jordan — Exteriors, Russin`,
    source: 'email',
  },
  {
    id: 'russin-hero-field-morgan-walk-0426',
    callDate: '2026-04-26',
    title: 'Field note: Montgomery deck + Thermory gable (site walk with Morgan)',
    customerName: 'Morgan Ellis',
    location: 'Montgomery, NY',
    productTags: ['Thermory Ash 1x6', 'AZEK Vintage', 'Simpson DTT2Z ledger'],
    repPersona: 'Jordan Hayes — exteriors, Russin (field)',
    customerPersona: 'Morgan Ellis — Hudson Valley Deck & Porch',
    tags: ['field_notes', 'contractor', 'russin-hero', 'exteriors', 'voicenote'],
    notable: [
      'Voice note: walked Thermory gable and AZEK field with Morgan; Rigo on ledger hardware; next step: rail template for ALX; dealer stock pick at North River for Simpson.',
    ],
    fieldNotesText: `Voice — April 26, 7:20 AM, Montgomery site, walkout to river.

"Met Morgan and Rigo. Framing is dry—Thermory Ash run on the gable, AZEK deck field going in after DTT2Z ledger pass. Architect wants the CEU rainscreen story for the board & batten mix; I told her we can bundle with Russin’s AIA course invite.

North River is pulling Simpson + joist tape on their PO; Morgan wants one invoice narrative even though the dealer is will-call. Flagged: compare lead time vs. 84 and Beacon on a parallel rail line if we slip—Morgan is cool as long as color stays in-family.

Follow-up: text Morgan the prefinish touch-up kit for Thermory. Same customer thread as the morning email."`,
    source: 'field_notes',
  },
  {
    id: 'russin-hero-dealer-order-0425',
    callDate: '2026-04-25',
    title: 'Re: Check Order Status — THRM/AZEK job pack (Hudson Valley Deck PO)',
    customerName: 'Casey Breen',
    location: 'Newburgh, NY',
    productTags: ['Dealer will-call', 'Job pack Thermory+AZEK', 'Fasteners & joist tape'],
    repPersona: 'dealerdesk@russin.com',
    customerPersona: 'buyers@northriverlumber.com',
    tags: ['email', 'dealer', 'lumberyard', 'russin-hero', 'b2b'],
    notable: [
      'Lumber **dealer** (North River) coordinating Russin-fulfilled exteriors for the same Morgan job—B2B order visibility like Check Order, not a homeowner retail path.',
    ],
    emailTranscript: `From: buyers@northriverlumber.com
To: dealerdesk@russin.com
Subject: Re: Check Order Status — THRM/AZEK job pack (Hudson Valley Deck PO)

Team —

Please confirm the Montgomery ship window for the Thermory + AZEK bundle for Hudson Valley Deck & Porch (Morgan’s PO-77421). We need will-call with Simpson hangers + 3M tape; customer wants to see **Check Order** green before the contractor stages Saturday.

We’re the retail yard selling to the trade—not a DIY walk-in—so treat this like the dealer + distributor handoff we always run with Russin.

— Casey
North River Lumber & Building Supply

---
From: dealerdesk@russin.com
To: buyers@northriverlumber.com
Subject: Re: Check Order Status — THRM/AZEK job pack (Hudson Valley Deck PO)

Casey —

Staged. Pick ticket shows THRM/AZEK + ALX sub-lines; will-call 3 PM Friday; “ready” in portal now.
Russin Dealer Desk`,
    source: 'email',
  },
  {
    id: 'russin-hero-mail-arch-ceu-0426',
    callDate: '2026-04-26',
    title: 'AIA lunch & learn: rainscreen + exterior brands (CEU hold)',
    customerName: 'Avery Kim AIA',
    location: 'Beacon, NY',
    productTags: ['James Hardie interface', 'Thermory rainscreen', 'CEU 1.0 LU'],
    repPersona: 'architect@russin.com',
    customerPersona: 'a.kim@studioellison.com',
    tags: ['email', 'architect', 'CEU', 'russin-hero', 'russin-narrative'],
    notable: [
      'Specifying architect (Studio Ellison) on Morgan’s same exterior job; CEU and submittal package—trade pull through Russin, not through Home Depot pro desk alone.',
    ],
    emailTranscript: `From: a.kim@studioellison.com
To: architect@russin.com
Subject: AIA lunch & learn: rainscreen + exterior brands (CEU hold)

We’re detailing Thermory gable with HardiePlank at first floor. Can Russin run the **CEU** on vented rainscreen and factory finishing when boards meet fiber cement? Same site as the Hudson Valley Deck scope—please loop Morgan and Jordan.

Avery Kim AIA
Studio Ellison Architecture

---
From: architect@russin.com
To: a.kim@studioellison.com
Subject: Re: AIA lunch & learn

Avery —

Yes. 1.0 LU/HSW-style session (demo); we’ll use Montgomery as the live submittal example with Thermory + Hardie details. Morgan is already in-thread.

Russin Architect & Designer Programs`,
    source: 'email',
  },
]

const act = JSON.parse(readFileSync(activity, 'utf8'))
if (act.entries.some((e) => e.id === 'russin-hero-mail-thermory-0426')) {
  console.log('activity-mock.json already has Russin hero entries; skip.')
} else {
  act.entries = [...heroEntries, ...act.entries]
  writeFileSync(activity, JSON.stringify(act, null, 2) + '\n', 'utf8')
  console.log('Prepended', heroEntries.length, 'hero entries to activity-mock.json')
}
