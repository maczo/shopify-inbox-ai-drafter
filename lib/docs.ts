import rawProducts from "@/data/products.json";
import type { Product } from "./types";
import { coconutTermsIn } from "./coconut";
import { commonNamesFor } from "./synonyms";

const products = rawProducts as unknown as Product[];
const byId = new Map(products.map((p) => [p.id, p]));

export const NOT_STATED = "NOT STATED ON PAGE";

export function allProducts(): Product[] {
  return products;
}

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

/** Lightweight list for the picker and for the titles-only catalog. */
export function listProducts() {
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    vendor: p.vendor,
    price: p.price,
    size: p.size,
    handle: p.handle,
  }));
}

/**
 * Adds two kinds of internal note to an ingredient token:
 *   [coconut-derived: ...]  so a coconut allergy question cannot be missed
 *   [also known as: ...]    so a common name (vitamin E) maps to its INCI name
 * Both are stripped from model output before it reaches a shopper.
 */
export function annotateIngredients(ingredients: string): string {
  if (!ingredients.trim()) return NOT_STATED;
  return ingredients
    .split(",")
    .map((token) => {
      const clean = token.trim();
      const notes: string[] = [];

      const coconut = coconutTermsIn(clean);
      if (coconut.length > 0) {
        notes.push(`coconut-derived: ${coconut.join(", ")}`);
      }

      const common = commonNamesFor(clean);
      if (common.length > 0) {
        notes.push(`also known as: ${common.join(", ")}`);
      }

      return notes.length > 0 ? `${clean} [${notes.join("; ")}]` : clean;
    })
    .join(", ");
}

function withAnnotations(docText: string): string {
  return docText.replace(/^Ingredients: (.*)$/m, (_match, ingredients: string) => {
    return `Ingredients: ${annotateIngredients(ingredients)}`;
  });
}

/**
 * The complete, closed set of facts the drafter may use.
 *
 * For a gift set, the component products are appended as separate sections so
 * every fact keeps a clear origin. Nothing else is ever added.
 */
export function buildDocBundle(product: Product): string {
  const sections = [
    `=== PRODUCT DOCUMENT: ${product.id} — ${product.title} ===\n${withAnnotations(product.docText)}`,
  ];

  for (const componentId of product.componentIds) {
    const component = byId.get(componentId);
    if (!component) continue;
    sections.push(
      `=== INCLUDED IN THIS SET: ${component.id} — ${component.title} ===\n${withAnnotations(component.docText)}`,
    );
  }

  return sections.join("\n\n");
}

/** Titles-only catalog, used solely for spotting a wrong-product question. */
export function buildCatalog(): string {
  return products.map((p) => `${p.id} — ${p.title}`).join("\n");
}
