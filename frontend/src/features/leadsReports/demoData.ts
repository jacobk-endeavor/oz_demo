import type { LeadProspect, RouteSummary, WeeklyDigestReport } from './types'

export const leadPrompt = 'Find nearby customers similar to our best decking accounts.'

export const leadProspects: LeadProspect[] = [
  {
    id: 'lead_north_ridge',
    company: 'North Ridge Builders',
    contact: 'Jordan Miles',
    phone: '555-0142',
    location: 'Albany, NY',
    similarityReason: 'Matches Russin Lumber decking volume, exterior materials mix, and fast-delivery needs.',
    estimatedFit: 94,
    currentSupplierSignal: 'TimberTech mentioned in two recent decking calls',
    suggestedProduct: 'Composite decking bundle',
    routeStop: 1,
    distanceFromRoute: '0.8 mi from I-87 corridor',
    talkingPoint: 'Open with faster composite decking availability and delivery assumptions.',
  },
  {
    id: 'lead_beacon_yard',
    company: 'Beacon Yard Supply',
    contact: 'Taylor Quinn',
    phone: '555-0198',
    location: 'Poughkeepsie, NY',
    similarityReason: 'Recently expanded contractor counter and sells deck packages to regional builders.',
    estimatedFit: 89,
    currentSupplierSignal: 'Buying exterior trim from Boral-aligned distributor',
    suggestedProduct: 'Exterior trim and fastener bundle',
    routeStop: 2,
    distanceFromRoute: '1.4 mi from Route 9',
    talkingPoint: 'Lead with bundled trim and hidden fasteners to improve jobsite margin.',
  },
  {
    id: 'lead_catskill_supply',
    company: 'Catskill Pro Supply',
    contact: 'Morgan Lee',
    phone: '555-0176',
    location: 'Kingston, NY',
    similarityReason: 'Similar contractor mix to high-performing decking accounts and repeated backorder complaints.',
    estimatedFit: 86,
    currentSupplierSignal: 'Customer reviews cite unreliable cedar and trim lead times',
    suggestedProduct: 'Decking accessories and exterior trim',
    routeStop: 3,
    distanceFromRoute: '2.1 mi from Route 32',
    talkingPoint: 'Show a reliable-stock plan for accessories before peak deck season.',
  },
  {
    id: 'lead_hudson_builders',
    company: 'Hudson Builders Co-op',
    contact: 'Riley Chen',
    phone: '555-0184',
    location: 'Newburgh, NY',
    similarityReason: 'Shares product-request pattern with Russin Lumber: decking, fasteners, and exterior trim.',
    estimatedFit: 82,
    currentSupplierSignal: 'Quoted alternate supplier on fastener systems last month',
    suggestedProduct: 'Hidden fastener starter package',
    routeStop: 4,
    distanceFromRoute: '0.6 mi from return route',
    talkingPoint: 'Offer a starter package that attaches to tomorrow’s decking quote.',
  },
]

export const routeSummary: RouteSummary = {
  origin: 'Russin Lumber, Montgomery, NY',
  totalTravelTime: '3 hr 45 min',
  stops: leadProspects.map((lead) => ({
    stop: lead.routeStop,
    company: lead.company,
    travelTime: ['52 min', '47 min', '41 min', '35 min'][lead.routeStop - 1],
    reason: lead.similarityReason,
    talkingPoint: lead.talkingPoint,
    productAngle: lead.suggestedProduct,
  })),
}

export const weeklyDigestReport: WeeklyDigestReport = {
  title: 'Weekly Sales Intelligence Digest',
  cadence: 'Every Monday at 8:00 AM',
  recipients: ['sami@example.com', 'sales@example.com', 'ops@example.com'],
  sections: [
    {
      id: 'product_requests',
      title: 'Top product requests',
      items: [
        'Composite decking bundles appeared in 7 qualified customer conversations.',
        'Exterior trim demand clustered around Albany and Hudson Valley accounts.',
        'Hidden fastener systems are the strongest attach opportunity for decking quotes.',
      ],
      sourceRecords: ['int_001', 'int_002', 'lead_north_ridge'],
    },
    {
      id: 'complaints',
      title: 'Top complaints',
      items: [
        'Lead-time uncertainty is blocking callbacks on high-value decking orders.',
        'Backorder reporting was cited as a reason buyers compare alternate suppliers.',
      ],
      sourceRecords: ['int_001', 'int_003'],
    },
    {
      id: 'competitor_mentions',
      title: 'Competitor mentions',
      items: [
        'TimberTech is being used as the benchmark for decking delivery windows.',
        'Boral pricing came up in exterior trim planning for Hudson Valley buyers.',
      ],
      sourceRecords: ['int_001', 'int_003', 'lead_beacon_yard'],
    },
    {
      id: 'new_leads',
      title: 'New lookalike leads',
      items: [
        'North Ridge Builders: call Jordan Miles about composite decking bundle.',
        'Beacon Yard Supply: visit Taylor Quinn with trim and fastener bundle.',
        'Catskill Pro Supply: show reliable-stock plan for deck accessories.',
      ],
      sourceRecords: ['lead_north_ridge', 'lead_beacon_yard', 'lead_catskill_supply'],
    },
    {
      id: 'quote_opportunities',
      title: 'Quote opportunities',
      items: [
        'Draft a composite decking quote with hidden fasteners for North Ridge Builders.',
        'Prepare an exterior trim bundle for Beacon Yard Supply before the route visit.',
      ],
      sourceRecords: ['lead_north_ridge', 'lead_beacon_yard'],
    },
  ],
  recommendedRepActions: [
    'Sami should call Jordan Miles today and book the first route stop.',
    'Add the four-stop route to tomorrow’s territory plan.',
    'Attach hidden fasteners to every decking quote discussed this week.',
  ],
}
