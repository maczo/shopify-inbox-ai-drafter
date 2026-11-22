import rawProducts from "@/data/products.json";
import type { Product } from "./types";
import { buildBundle, withAnnotations } from "./ingredients";

const products = rawProducts as unknown as Product[];
const byId = new Map(products.map((p) => [p.id, p]));

export { NOT_STATED, annotateIngredients } from "./ingredients";

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
 * The complete, closed set of facts the drafter may use.
 *
 * For a gift set, the component products are appended as separate sections so
 * every fact keeps a clear origin. Nothing else is ever added.
 */
export function buildDocBundle(product: Product): string {
  return buildBundle(product, products);
}

/** Titles-only catalog, used solely for spotting a wrong-product question. */
export function buildCatalog(): string {
  return products.map((p) => `${p.id} — ${p.title}`).join("\n");
}
