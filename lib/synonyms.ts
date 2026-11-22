/**
 * Common name ↔ INCI name.
 *
 * Shoppers ask for "vitamin E" and "hyaluronic acid". Labels say "Tocopherol"
 * and "Sodium Hyaluronate". Bridging those is not outside knowledge — it is
 * reading the label — but it has to be a curated table so it stays auditable
 * and so the model never invents an equivalence of its own.
 *
 * Only entries whose equivalence is unambiguous are listed. Anything with a
 * marketing meaning ("clean", "natural", "non-toxic") is deliberately absent.
 */
type Synonym = {
  /** Substring matched case-insensitively against one ingredient token. */
  inci: string;
  /** What a shopper is likely to call it. */
  common: string[];
};

const SYNONYMS: Synonym[] = [
  { inci: "Tocopherol", common: ["vitamin E"] },
  { inci: "Ascorbic Acid", common: ["vitamin C"] },
  { inci: "Ascorbyl Palmitate", common: ["vitamin C"] },
  { inci: "Sodium Hyaluronate", common: ["hyaluronic acid"] },
  { inci: "Panthenol", common: ["provitamin B5", "vitamin B5"] },
  { inci: "Niacinamide", common: ["vitamin B3"] },
  { inci: "Salicylic Acid", common: ["BHA", "beta hydroxy acid"] },
  { inci: "Lactic Acid", common: ["AHA", "alpha hydroxy acid"] },
  { inci: "Zinc Oxide", common: ["zinc"] },
  { inci: "Allantoin", common: ["comfrey"] },
  { inci: "Bisabolol", common: ["chamomile"] },
  { inci: "Ceramide NP", common: ["ceramide"] },
];

/** Common names for one ingredient token, or an empty array. */
export function commonNamesFor(token: string): string[] {
  const lower = token.toLowerCase();
  const found: string[] = [];
  for (const synonym of SYNONYMS) {
    if (lower.includes(synonym.inci.toLowerCase())) {
      for (const name of synonym.common) {
        if (!found.includes(name)) found.push(name);
      }
    }
  }
  return found;
}
