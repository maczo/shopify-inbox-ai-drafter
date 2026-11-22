/**
 * Ingests the two dev-store CSV exports into normalised JSON.
 *
 *   node scripts/ingest.ts
 *
 * Runs on Node 24 with native type stripping — no build step, no deps.
 * Source rows are kept verbatim; nothing is paraphrased here.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataDir = join(root, "data");

const PRODUCTS_CSV = join(
  root,
  "Shopify Dev Store Product Pages (catalog snapshot, 16 Nov 2026).csv",
);
const QUESTIONS_CSV = join(
  root,
  "Shopify Inbox Shopper Questions (19 Oct - 16 Nov 2026).csv",
);

// ---------------------------------------------------------------- csv

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = input.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toObjects(csv: string): Record<string, string>[] {
  const rows = parseCsv(csv);
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((key, idx) => {
        obj[key] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}

// ---------------------------------------------------------------- types

type Product = {
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

type Question = {
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

// ---------------------------------------------------------------- build

const productRows = toObjects(readFileSync(PRODUCTS_CSV, "utf8"));
const questionRows = toObjects(readFileSync(QUESTIONS_CSV, "utf8"));

const NOT_STATED = "NOT STATED ON PAGE";

function field(label: string, value: string): string {
  return `${label}: ${value.trim() === "" ? NOT_STATED : value.trim()}`;
}

function buildDocText(p: Omit<Product, "docText" | "componentIds">): string {
  return [
    field("Product", p.title),
    field("Product ID", p.id),
    field("Type", p.type),
    field("Vendor", p.vendor),
    field("Price", p.price ? `$${p.price}` : ""),
    field("Size", p.size),
    field("Description", p.description),
    field("Ingredients", p.ingredients),
    field("Allergen statement", p.allergen),
    field("Usage", p.usage),
    field("Page", p.pageUrl),
    field("Last updated", p.lastUpdated),
  ].join("\n");
}

const base = productRows.map((r) => ({
  id: r.product_id,
  handle: r.product_handle,
  title: r.title,
  type: r.product_type,
  vendor: r.vendor,
  price: r.price,
  currency: "USD",
  size: r.size,
  description: r.description,
  ingredients: r.ingredient_list,
  allergen: r.allergen_statement,
  usage: r.usage_instructions,
  pageUrl: r.page_url,
  lastUpdated: r.last_updated,
}));

const products: Product[] = base.map((p) => {
  // Gift sets name their components in the size column, e.g.
  // "Lavender Sleep Balm 30 g + Rose Lip Balm 4.5 g + ...".
  const componentIds =
    p.type === "Gift Set"
      ? base
          .filter((other) => other.id !== p.id && p.size.includes(other.title))
          .map((other) => other.id)
      : [];

  return { ...p, componentIds, docText: buildDocText(p) };
});

const questions: Question[] = questionRows.map((r) => ({
  id: r.question_id,
  productId: r.product_id,
  receivedAt: r.chat_received_at,
  shopperFirstName: r.shopper_first_name,
  text: r.question_text,
  category: r.question_category,
  ingredientMentioned: r.ingredient_mentioned,
  answerable: r.answerable_from_page.toLowerCase() === "true",
  expectedNote: r.expected_answer_note,
}));

/**
 * Rows I hand-verified as internally consistent with the product sheet AND
 * consistent with this app's absence policy. The other ~85 rows are known
 * broken; see docs/eval-sheet-issues.md.
 */
const GOLDEN: { id: string; verdict: "answered" | "flagged" }[] = [
  // positive facts stated on the page
  { id: "Q-029", verdict: "answered" }, // lanolin listed
  { id: "Q-032", verdict: "answered" }, // facility handles tree nuts
  { id: "Q-033", verdict: "answered" }, // tocopherol listed
  { id: "Q-049", verdict: "answered" }, // coconut oil listed
  { id: "Q-052", verdict: "answered" }, // size + price
  { id: "Q-064", verdict: "answered" }, // beeswax listed
  { id: "Q-076", verdict: "answered" }, // beeswax listed
  { id: "Q-087", verdict: "answered" }, // shea listed
  { id: "Q-101", verdict: "answered" }, // tocopherol listed
  // absence -> flag under the strict policy
  { id: "Q-027", verdict: "flagged" }, // duration not stated
  { id: "Q-030", verdict: "flagged" }, // pregnancy not stated
  { id: "Q-041", verdict: "flagged" }, // shipping not stated
  { id: "Q-047", verdict: "flagged" }, // cruelty-free not stated
  { id: "Q-048", verdict: "flagged" }, // returns not stated
  { id: "Q-054", verdict: "flagged" }, // pregnancy not stated
  { id: "Q-062", verdict: "flagged" }, // cruelty-free not stated
  { id: "Q-069", verdict: "flagged" }, // refunds not stated
  { id: "Q-072", verdict: "flagged" }, // retinol not stated
  { id: "Q-082", verdict: "flagged" }, // pregnancy not stated
  { id: "Q-085", verdict: "flagged" }, // cruelty-free not stated
  { id: "Q-086", verdict: "flagged" }, // lanolin not stated
  { id: "Q-088", verdict: "flagged" }, // retinol not stated
  { id: "Q-089", verdict: "flagged" }, // shipping not stated
  { id: "Q-090", verdict: "flagged" }, // niacinamide not stated
  { id: "Q-093", verdict: "flagged" }, // refunds not stated
  { id: "Q-097", verdict: "flagged" }, // infant use not stated
  { id: "Q-099", verdict: "flagged" }, // free shipping not stated
  { id: "Q-103", verdict: "flagged" }, // duration not stated
  { id: "Q-106", verdict: "flagged" }, // pregnancy not stated
  { id: "Q-107", verdict: "flagged" }, // cruelty-free not stated
  { id: "Q-115", verdict: "flagged" }, // refunds not stated
  { id: "Q-116", verdict: "flagged" }, // shipping not stated
  { id: "Q-119", verdict: "flagged" }, // paraben-free not stated
];

const goldenIds = new Set(GOLDEN.map((g) => g.id));
for (const g of GOLDEN) {
  if (!questions.some((q) => q.id === g.id)) {
    throw new Error(`golden row ${g.id} not found in questions csv`);
  }
}

const golden = GOLDEN.map((g) => {
  const q = questions.find((x) => x.id === g.id)!;
  return {
    questionId: q.id,
    productId: q.productId,
    verdict: g.verdict,
    note: g.verdict === "answered"
      ? "verified: page states the asked fact"
      : "verified: page is silent on the asked fact",
  };
});

// ---------------------------------------------------------------- write

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "products.json"), JSON.stringify(products, null, 2));
writeFileSync(join(dataDir, "questions.json"), JSON.stringify(questions, null, 2));
writeFileSync(join(dataDir, "golden.json"), JSON.stringify(golden, null, 2));

const giftSets = products.filter((p) => p.componentIds.length > 0);
const blankAllergens = products.filter((p) => p.allergen === "");

console.log(`products:  ${products.length}`);
console.log(`questions: ${questions.length}`);
console.log(`golden:    ${golden.length} (${golden.filter((g) => g.verdict === "answered").length} answered / ${golden.filter((g) => g.verdict === "flagged").length} flagged)`);
console.log(`gift sets resolved: ${giftSets.map((p) => `${p.id}->${p.componentIds.join(",")}`).join(" ")}`);
console.log(`blank allergen statements: ${blankAllergens.map((p) => p.id).join(", ")}`);
console.log(`known-broken eval rows: ${questions.length - goldenIds.size}`);
