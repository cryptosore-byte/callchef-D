/**
 * Future abstraction for legally approved marketplace sources.
 * Intentionally empty: no Deliveroo / Uber Eats scraping in this MVP.
 */
export interface MarketplaceDataProvider {
  readonly name: string;
}
