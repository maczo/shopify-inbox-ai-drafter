/**
 * Grades all 120 shopper replies.
 *
 *   npm run grade            # resume if reports/results.json exists
 *   npm run grade -- --fresh # start over
 *   npm run grade -- --only=Q-029,Q-033
 *
 * Two model passes per row:
 *   1. the app's own drafter, over HTTP, exactly as the merchant uses it
 *   2. an independent judge (recursive/flint-v1.0:free) that audits the draft
 *      against the product document
 *
 * Every deterministic guard the server already applies is re-checked here so a
 * row's verdict does not rest on the judge alone.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "../lib/ingredients.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "recursive/flint-v1.0:free";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");

/* ------------------------------------------------------------------ types */

type Question = {
  id: string;
  productId: string;
  text: string;
  category: string;
  answerable: boolean;
};

type Product = {
  id: string;
  title: string;
  docText: string;
  componentIds?: string[];
};

type Golden = { questionId: string; productId: string; verdict: string };

type Row = {
  questionId: string;
  sheetRow: number;
  productId: string;
  productTitle: string;
  subset: "verified" | "unverified";
  expected: string | null;
  actual: string | null;
  match: "pass" | "fail" | "n/a";
  draft: string;
  merchantNote: string;
  model: string;
  ms: number;
  /* deterministic */
  tagLeak: boolean;
  placeholder: boolean;
  evidenceTotal: number;
  evidenceOk: number;
  evidencePass: boolean;
  holdingOk: boolean | null;
  wordCount: number;
  /* judge */
  unsupported: string[];
  judgeSendReady: boolean;
  judgeReason: string;
  judgeError: string | null;
  /* derived */
  invented: boolean;
  sendReady: boolean;
  error: string | null;
};

type Calibration = {
  name: string;
  expected: "pass" | "fail";
  got: "pass" | "fail" | "error";
  unsupported: string[];
  reason: string;
};

/* ------------------------------------------------------------------- data */

const read = <T,>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;

const questions = read<Question[]>("data/questions.json");
const products = read<Product[]>("data/products.json");
const golden = read<Golden[]>("data/golden.json");
const productById = new Map(products.map((p) => [p.id, p]));
const goldenById = new Map(golden.map((g) => [g.questionId, g]));

const OPENAI = (() => {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY="));
  if (!line) throw new Error("OPENROUTER_API_KEY missing from .env.local");
  return line.slice("OPENROUTER_API_KEY=".length).trim();
})();

const outDir = join(root, "reports");
mkdirSync(outDir, { recursive: true });
const resultsPath = join(outDir, "results.json");

type Store = { rows: Record<string, Row>; calibration: Calibration[] };
const store: Store =
  !fresh && existsSync(resultsPath)
    ? (JSON.parse(readFileSync(resultsPath, "utf8")) as Store)
    : { rows: {}, calibration: [] };

const save = () => writeFileSync(resultsPath, JSON.stringify(store, null, 2));

/* ---------------------------------------------------------------- helpers */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function retryable(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/* ------------------------------------------------------------- deterministic */

const TAG = /\[(?:coconut-derived|also known as):/i;
const PLACEHOLDER = /As an AI|\[name\]|\*\*|^\s*[-*]\s|https?:\/\//im;
const FACT_MARKERS =
  /\d|\$|%|\b(ingredients?|contains?|lanolin|coconut|shea|beeswax|retinol|paraben|niacinamide|tocopherol|almond|oat|fragrance|sulfate|silicone|vegan|cruelty|shipping|refund|returns?|stock|size|ml|grams?)\b/i;
const APPROVED = /(check|confirm|look into|get back|come back|follow up|ask the team)/i;

export function holdingOk(draft: string): boolean {
  const t = draft.trim();
  return (
    t.length > 0 &&
    t.split(/\s+/).length <= 60 &&
    !/\d/.test(t) &&
    !FACT_MARKERS.test(t) &&
    APPROVED.test(t) &&
    !/[\[\]{}]/.test(t)
  );
}

/* ---------------------------------------------------------------- drafting */

async function draft(productId: string, message: string): Promise<{
  verdict: string;
  draft: string;
  merchantNote: string;
  evidence: { quote: string; field: string; ok: boolean }[];
  model: string;
  ms: number;
}> {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/api/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, message }),
    });
    if (res.ok) return (await res.json()) as never;
    last = `HTTP ${res.status}`;
    if (!retryable(res.status)) break;
    await sleep(1500 * 2 ** attempt);
  }
  throw new Error(last || "draft failed");
}

/* ------------------------------------------------------------------ judge */

const JUDGE_SYSTEM = `You audit one reply written by a store's assistant.

You are given the product document (the ONLY permitted source of facts), the shopper's question, and the reply.

Return JSON only:
{
  "unsupported": ["each sentence or clause in the reply that the document does not support, quoted verbatim"],
  "send_ready": true | false,
  "reason": "one sentence"
}

Rules:
- A claim of absence ("does not contain X", "free of X", "safe for", "nut-free") is supported ONLY if the document states it. Not finding X in a list is NOT support.
- A reply that says the merchant will check and follow up makes no factual claim, so it is not unsupported.
- send_ready is true if a merchant could send the reply unchanged: it uses only document facts (or makes no factual claim), is polite, contains no placeholders and does not mention being an assistant, and responds to the shopper's message as far as the document allows.
- A reply that says the merchant will check and follow up IS send-ready when the document cannot answer the question. Do not mark it down for not answering.
- Do not mark a reply down for being short, or for declining to answer something the document does not cover.
- Judge only against the document. Never use outside knowledge to excuse or condemn a claim.`;

async function judge(doc: string, question: string, draftText: string) {
  const body = {
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: `DOCUMENT:\n${doc}\n\nSHOPPER QUESTION:\n${question}\n\nREPLY:\n${draftText}`,
      },
    ],
  };

  let last = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(raw) as {
          unsupported?: unknown;
          send_ready?: unknown;
          reason?: unknown;
        };
        return {
          unsupported: Array.isArray(parsed.unsupported)
            ? parsed.unsupported.map(String).filter((s) => s.trim().length > 0)
            : [],
          sendReady: parsed.send_ready === true,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
          error: null as string | null,
        };
      } catch {
        return { unsupported: [], sendReady: false, reason: "", error: "judge returned non-JSON" };
      }
    }
    last = `HTTP ${res.status}`;
    if (!retryable(res.status)) break;
    await sleep(1500 * 2 ** attempt);
    }
  return { unsupported: [], sendReady: false, reason: "", error: last || "judge failed" };
}

/* -------------------------------------------------------------- one row */

async function gradeQuestion(q: Question) {
  if (store.rows[q.id]) return;
  const product = productById.get(q.productId);
  if (!product) {
    store.rows[q.id] = {
      questionId: q.id,
      sheetRow: Number(q.id.split("-")[1]) + 1,
      productId: q.productId,
      productTitle: "(unknown product)",
      subset: "unverified",
      expected: null,
      actual: null,
      match: "n/a",
      draft: "",
      merchantNote: "",
      model: "",
      ms: 0,
      tagLeak: false,
      placeholder: false,
      evidenceTotal: 0,
      evidenceOk: 0,
      evidencePass: false,
      holdingOk: null,
      wordCount: 0,
      unsupported: [],
      judgeSendReady: false,
      judgeReason: "",
      judgeError: null,
      invented: false,
      sendReady: false,
      error: `unknown product ${q.productId}`,
    };
    save();
    return;
  }

  const gold = goldenById.get(q.id);
  const base = {
    questionId: q.id,
    sheetRow: Number(q.id.split("-")[1]) + 1,
    productId: q.productId,
    productTitle: product.title,
    subset: (gold ? "verified" : "unverified") as "verified" | "unverified",
    expected: gold ? gold.verdict : null,
  };

  let result;
  try {
    result = await draft(q.productId, q.text);
  } catch (e) {
    store.rows[q.id] = {
      ...base,
      actual: null,
      match: "n/a",
      draft: "",
      merchantNote: "",
      model: "",
      ms: 0,
      tagLeak: false,
      placeholder: false,
      evidenceTotal: 0,
      evidenceOk: 0,
      evidencePass: false,
      holdingOk: null,
      wordCount: 0,
      unsupported: [],
      judgeSendReady: false,
      judgeReason: "",
      judgeError: null,
      invented: false,
      sendReady: false,
      error: e instanceof Error ? e.message : "draft failed",
    };
    save();
    console.log(`ERROR ${q.id} ${q.productId} — ${e instanceof Error ? e.message : "failed"}`);
    return;
  }

  const evidenceOk = result.evidence.filter((e) => e.ok).length;
  const tagLeak = TAG.test(result.draft) || TAG.test(result.merchantNote);
  const placeholder = PLACEHOLDER.test(result.draft);

  // The judge must see exactly what the drafter saw, including the internal
  // [coconut-derived: ...] and [also known as: ...] tags. Without them a
  // correct "Tocopherol, which is vitamin E" looks invented.
  const j = await judge(buildBundle(product, products), q.text, result.draft);

  const evidencePass =
    result.verdict === "answered"
      ? result.evidence.length > 0 && evidenceOk === result.evidence.length
      : true;

  const holdOk = result.verdict === "flagged" ? holdingOk(result.draft) : null;
  const wordCount = result.draft.trim() ? result.draft.trim().split(/\s+/).length : 0;

  const invented = j.unsupported.length > 0 || tagLeak || !evidencePass;
  const sendReady =
    !invented &&
    !placeholder &&
    wordCount > 0 &&
    wordCount <= 70 &&
    (holdOk === null || holdOk === true) &&
    j.sendReady &&
    j.error === null;

  const match: Row["match"] =
    gold === undefined ? "n/a" : result.verdict === gold.verdict ? "pass" : "fail";

  store.rows[q.id] = {
    ...base,
    actual: result.verdict,
    match,
    draft: result.draft,
    merchantNote: result.merchantNote,
    model: result.model,
    ms: result.ms,
    tagLeak,
    placeholder,
    evidenceTotal: result.evidence.length,
    evidenceOk,
    evidencePass,
    holdingOk: holdOk,
    wordCount,
    unsupported: j.unsupported,
    judgeSendReady: j.sendReady,
    judgeReason: j.reason,
    judgeError: j.error,
    invented,
    sendReady,
    error: null,
  };
  save();
  const flag = match === "fail" || invented || !sendReady ? "!" : " ";
  console.log(
    `${flag} ${q.id} ${q.productId} ${result.verdict}${gold ? ` (exp ${gold.verdict})` : ""} ` +
      `send=${sendReady ? "y" : "n"} invented=${invented ? "y" : "n"} ${(result.ms / 1000).toFixed(1)}s`,
  );
}

/* ----------------------------------------------------------- calibration */

const CALIBRATION: { name: string; draft: string; expected: "pass" | "fail" }[] = [
  {
    name: "correct answer",
    draft: "Yes, it contains Prunus Amygdalus Dulcis Oil.",
    expected: "pass",
  },
  {
    name: "holding reply",
    draft: "Thanks for reaching out. Let me check that with the team and I'll come back to you.",
    expected: "pass",
  },
  {
    name: "invented price",
    draft: "Yes, it contains Prunus Amygdalus Dulcis Oil, and it is $18.00 for 100 ml.",
    expected: "fail",
  },
  {
    name: "fake nut-free claim",
    draft: "Yes it has almond oil, but it's nut-free and safe for allergies.",
    expected: "fail",
  },
];

async function runCalibration() {
  if (only && !store.calibration.length) return;
  if (store.calibration.length === CALIBRATION.length && !rejudge) return;
  const p = productById.get("DSP-001");
  if (!p) return;
  const doc = buildBundle(p, products);
  const question = "is there almond oil in this?";
  const out: Calibration[] = [];
  for (const c of CALIBRATION) {
    const j = await judge(doc, question, c.draft);
    const got =
      j.error !== null
        ? "error"
        : j.unsupported.length > 0 || !j.sendReady
          ? "fail"
          : "pass";
    out.push({ name: c.name, expected: c.expected, got, unsupported: j.unsupported, reason: j.reason });
    console.log(`CAL ${got === c.expected ? "ok" : "MISS"} ${c.name}: want ${c.expected} got ${got}`);
  }
  store.calibration = out;
  save();
}

/* -------------------------------------------------------------------- run */

/**
 * Re-scores stored drafts with the current rubric and document bundle.
 * No drafting calls are made, so the drafts under review stay identical.
 */
async function rejudgeRow(row: Row) {
  const product = productById.get(row.productId);
  const q = questionById(row.questionId);
  if (!product || !q || !row.draft) return;

  const j = await judge(buildBundle(product, products), q.text, row.draft);

  const tagLeak = TAG.test(row.draft) || TAG.test(row.merchantNote);
  const placeholder = PLACEHOLDER.test(row.draft);
  const evidencePass =
    row.actual === "answered" ? row.evidenceTotal > 0 && row.evidenceOk === row.evidenceTotal : true;
  const holdOk = row.actual === "flagged" ? holdingOk(row.draft) : null;
  const wordCount = row.draft.trim() ? row.draft.trim().split(/\s+/).length : 0;

  const invented = j.unsupported.length > 0 || tagLeak || !evidencePass;
  const sendReady =
    !invented &&
    !placeholder &&
    wordCount > 0 &&
    wordCount <= 70 &&
    (holdOk === null || holdOk === true) &&
    j.sendReady &&
    j.error === null;

  Object.assign(row, {
    tagLeak,
    placeholder,
    evidencePass,
    holdingOk: holdOk,
    wordCount,
    unsupported: j.unsupported,
    judgeSendReady: j.sendReady,
    judgeReason: j.reason,
    judgeError: j.error,
    invented,
    sendReady,
  });
  save();
  console.log(
    `  ${row.questionId} ${row.productId} ${row.actual} send=${sendReady ? "y" : "n"} ` +
      `invented=${invented ? "y" : "n"}${j.unsupported.length ? ` — ${j.unsupported.join("; ")}` : ""}`,
  );
}

function questionById(id: string): Question | undefined {
  return questions.find((q) => q.id === id);
}

const rejudge = args.includes("--rejudge");

if (rejudge) {
  const targets = Object.values(store.rows)
    .filter((r) => !r.error && r.draft)
    .filter((r) => !only || only.includes(r.questionId));
  console.log(`re-judging ${targets.length} stored drafts (no new drafts)\n`);
  store.calibration = [];
  await pool(targets, 3, rejudgeRow);
} else {
  const queue = (only ? questions.filter((q) => only.includes(q.id)) : questions).filter(
    (q) => !store.rows[q.id],
  );
  console.log(`grading ${queue.length} of ${questions.length} rows against ${BASE}`);
  console.log(`judge: ${JUDGE_MODEL}\n`);
  await pool(queue, 3, gradeQuestion);
}

await runCalibration();
save();

const rows = Object.values(store.rows);
console.log(
  `\ndone: ${rows.length}/${questions.length} rows, ` +
    `${rows.filter((r) => r.error).length} errored, ` +
    `${rows.filter((r) => r.invented).length} with invented claims, ` +
    `${rows.filter((r) => r.sendReady).length} send-ready`,
);
