import { allProducts } from "./docs";
import type { Product } from "./types";

export type ProductMatch = {
  productId: string;
  confidence: number;
  reason: string;
};

const STOP = new Set(["the", "and", "with", "for", "of", "a", "an", "in", "on", "to", "spf"]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Crude singular form, enough for "heels" -> "heel". */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function titleWords(product: Product): string[] {
  return normalize(product.title)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

/**
 * Deterministic pre-pass. Returns null when it is not confident, so the UI can
 * ask the merchant to choose instead of guessing.
 */
export function matchProduct(message: string): ProductMatch | null {
  const msg = normalize(message);
  const raw = message.toLowerCase();
  const products = allProducts();

  // 1. Explicit product ID, e.g. "DSP-004".
  const idHit = raw.match(/\bdsp-\d{3}\b/);
  if (idHit) {
    const product = products.find((p) => p.id.toLowerCase() === idHit[0]);
    if (product) {
      return { productId: product.id, confidence: 99, reason: `product ID ${product.id}` };
    }
  }

  // 2. Exact product name. Longest wins, so "Calendula Healing Balm Light"
  //    beats its own prefix "Calendula Healing Balm".
  const exact = products
    .filter((p) => msg.includes(normalize(p.title)))
    .sort((a, b) => b.title.length - a.title.length)[0];
  if (exact) {
    return { productId: exact.id, confidence: 96, reason: "exact product name" };
  }

  // 3. Product handle.
  const handle = products.find((p) => raw.includes(p.handle.toLowerCase()));
  if (handle) {
    return { productId: handle.id, confidence: 92, reason: "product handle" };
  }

  // 4. Token overlap.
  const msgWords = new Set(msg.split(" ").map(stem));
  let best: { product: Product; score: number } | null = null;
  let second = 0;

  for (const product of products) {
    const words = titleWords(product);
    if (words.length === 0) continue;
    const hit = words.filter((w) => msgWords.has(w)).length;
    const score = Math.round((hit / words.length) * 100);
    if (score > (best?.score ?? 0)) {
      second = best?.score ?? 0;
      best = { product, score };
    } else if (score > second) {
      second = score;
    }
  }

  if (!best || best.score < 60) return null;
  if (best.score - second < 15) return null;

  return {
    productId: best.product.id,
    confidence: Math.min(best.score, 85),
    reason: `matched the name "${best.product.title}"`,
  };
}
