/**
 * Coconut-derived INCI names.
 *
 * Deliberately conservative: only names that are unambiguously coconut-derived
 * in this catalogue. Fatty alcohols (cetearyl, cetyl, stearyl) are excluded —
 * they can be coconut, palm or synthetic, and flagging them would make almost
 * every cream "contain coconut", which would be misleading for allergy answers.
 */
export const COCONUT_DERIVED = [
  "Cocos Nucifera",
  "Coco-Glucoside",
  "Coco-Betaine",
  "Cocamidopropyl Betaine",
  "Cocamide",
  "Sodium Coco-Sulfate",
  "Sodium Cocoyl Isethionate",
  "Caprylic/Capric Triglyceride",
  "Glyceryl Caprylate",
  "Glyceryl Caprate",
  "Caprylyl Glycol",
] as const;

/** True when the ingredient token is the coconut itself, not a derivative. */
export function isDirectCoconut(token: string): boolean {
  return /cocos nucifera/i.test(token);
}

/** Returns the coconut-derived terms found in one ingredient token. */
export function coconutTermsIn(token: string): string[] {
  return COCONUT_DERIVED.filter((term) =>
    token.toLowerCase().includes(term.toLowerCase()),
  );
}

export function findCoconutDerivatives(ingredients: string): string[] {
  if (!ingredients) return [];
  const found = new Set<string>();
  for (const token of ingredients.split(",")) {
    for (const term of coconutTermsIn(token)) found.add(term);
  }
  return [...found];
}
