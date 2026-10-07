import type { Review } from "@/types";
/** Reviews usually arrive with the places payload. Separate abstraction so a dedicated review source can be added. */
export interface ReviewDataProvider {
  getReviews(restaurantId: string, max: number): Promise<Review[]>;
}
export class InlineReviewProvider implements ReviewDataProvider {
  constructor(private lookup: (id: string) => Review[]) {}
  async getReviews(id: string, max: number) { return this.lookup(id).slice(0, max); }
}
