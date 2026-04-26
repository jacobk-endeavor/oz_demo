export type CompetitorOfferRow = {
  id: string
  competitor: string
  product: string
  price: string
  /** Primary PDP / listing (opens in new tab from modal & table). */
  productPageUrl: string
  /** Thumbnail (placeholder or from search) for modal. */
  imageUrl?: string
  /** Optional Brave/search provenance. */
  sourceLabel?: string
}
