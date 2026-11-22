export type Product = {
  id: string;
  handle: string;
  title: string;
  type: string;
  vendor: string;
  price: string;
  currency: string;
  size: string;
  description: string;
  ingredients: string;
  allergen: string;
  usage: string;
  pageUrl: string;
  lastUpdated: string;
  componentIds: string[];
  docText: string;
};

export type Question = {
  id: string;
  productId: string;
  receivedAt: string;
  shopperFirstName: string;
  text: string;
  category: string;
  ingredientMentioned: string;
  answerable: boolean;
  expectedNote: string;
};

export type Evidence = {
  quote: string;
  field: string;
};

export type DraftResult = {
  verdict: "answered" | "flagged";
  draft: string;
  merchantNote: string;
  evidence: Evidence[];
};

export type VerifiedEvidence = Evidence & { ok: boolean };

export type DraftResponse = Omit<DraftResult, "evidence"> & {
  productId: string;
  productTitle: string;
  evidence: VerifiedEvidence[];
  /** true when code overrode the model (bad evidence, invalid holding reply, etc.) */
  downgraded: boolean;
  model: string;
  ms: number;
};
