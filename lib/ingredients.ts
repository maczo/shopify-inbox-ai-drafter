import { coconutTermsIn } from "./coconut.ts";
import { commonNamesFor } from "./synonyms.ts";

export const NOT_STATED = "NOT STATED ON PAGE";

/**
 * Adds two kinds of internal note to an ingredient token:
 *   [coconut-derived: ...]  so a coconut allergy question cannot be missed
 *   [also known as: ...]    so a common name (vitamin E) maps to its INCI name
 *
 * Both are stripped from model output before it reaches a shopper.
 *
 * Kept free of data imports so the grader can build the same document bundle
 * the drafter sees, without going through the app's alias resolution.
 */
export function annotateIngredients(ingredients: string): string {
  if (!ingredients.trim()) return NOT_STATED;
  return ingredients
    .split(",")
    .map((token) => {
      const clean = token.trim();
      const notes: string[] = [];

      const coconut = coconutTermsIn(clean);
      if (coconut.length > 0) notes.push(`coconut-derived: ${coconut.join(", ")}`);

      const common = commonNamesFor(clean);
      if (common.length > 0) notes.push(`also known as: ${common.join(", ")}`);

      return notes.length > 0 ? `${clean} [${notes.join("; ")}]` : clean;
    })
    .join(", ");
}

export function withAnnotations(docText: string): string {
  return docText.replace(/^Ingredients: (.*)$/m, (_match, ingredients: string) => {
    return `Ingredients: ${annotateIngredients(ingredients)}`;
  });
}

export type BundleProduct = {
  id: string;
  title: string;
  docText: string;
  componentIds?: string[];
};

/**
 * The complete, closed set of facts a drafter may use for one product.
 * Gift sets append their component products as separate sections.
 */
export function buildBundle(product: BundleProduct, all: BundleProduct[]): string {
  const byId = new Map(all.map((p) => [p.id, p]));
  const sections = [
    `=== PRODUCT DOCUMENT: ${product.id} — ${product.title} ===\n${withAnnotations(product.docText)}`,
  ];
  for (const componentId of product.componentIds ?? []) {
    const component = byId.get(componentId);
    if (!component) continue;
    sections.push(
      `=== INCLUDED IN THIS SET: ${component.id} — ${component.title} ===\n${withAnnotations(component.docText)}`,
    );
  }
  return sections.join("\n\n");
}
