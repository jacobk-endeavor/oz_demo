export type ReportStatus = 'draft' | 'scheduled' | 'sent'

export interface LeadProspect {
  id: string
  company: string
  contact: string
  phone: string
  location: string
  similarityReason: string
  estimatedFit: number
  currentSupplierSignal: string
  suggestedProduct: string
  routeStop: number
  distanceFromRoute: string
  talkingPoint: string
}

export interface RouteSummary {
  origin: string
  totalTravelTime: string
  stops: RouteStop[]
}

export interface RouteStop {
  stop: number
  company: string
  travelTime: string
  reason: string
  talkingPoint: string
  productAngle: string
}

export interface ReportSection {
  id: string
  title: string
  items: string[]
  sourceRecords: string[]
}

export interface WeeklyDigestReport {
  title: string
  cadence: string
  recipients: string[]
  sections: ReportSection[]
  recommendedRepActions: string[]
}
