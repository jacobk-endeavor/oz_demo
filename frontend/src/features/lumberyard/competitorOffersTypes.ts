export type CompetitorOfferRow = {
  id: string
  competitor: string
  product: string
  price: string
  /** How the price is quoted for this SKU (e.g. per linear foot, per sheet). */
  priceUnit: string
  /** Primary PDP / listing (opens in new tab from modal & table). */
  productPageUrl: string
  /** Thumbnail (placeholder or from search) for modal. */
  imageUrl?: string
  /** Optional Brave/search provenance. */
  sourceLabel?: string
}
