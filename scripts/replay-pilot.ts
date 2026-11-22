/**
 * Replays all 120 shopper questions through the gated drafter and records the
 * pilot events, exactly as the tracking plan defines them.
 *
 *   npm run pilot
 *
 * Requires the server running with the flag ON for the dev store:
 *   npm run build && npm start      # terminal 1
 *   npm run pilot                   # terminal 2
 *
 * If the flag is off, the server returns 503 and this script stops without
 * writing a log. A pilot with no gate is not a pilot.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvent, capture, shutdown, type PilotEvent } from "../lib/analytics.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STORE = "inbox-ai-dev-store";
const OUT_DIR = join(root, "pilot");
const EVENTS = join(OUT_DIR, "events.jsonl");

type Question = { id: string; productId: string; text: string };
type Product = { id: string; docText: string };

const ENV_FILE = join(root, ".env.local");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const products = JSON.parse(
  readFileSync(join(root, "data/products.json"), "utf8"),
) as Product[];
const docById = new Map(products.map((p) => [p.id, p.docText]));

const questions = JSON.parse(
  readFileSync(join(root, "data/questions.json"), "utf8"),
) as Question[];

const modelId = process.env.OPENROUTER_DRAFTER_MODEL?.trim() ?? "";
if (!modelId) {
  console.error("OPENROUTER_DRAFTER_MODEL is not set; the plan requires model_id from it.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (s: number) => s === 429 || s >= 500;

/* ------------------------------------------------- the sendability rule */

const TAG = /\[(?:coconut-derived|also known as):/i;
const PLACEHOLDER = /As an AI|\[name\]|\*\*|^\s*[-*]\s|https?:\/\//im;
const FACTS =
  /\d|\$|%|\b(ingredients?|contains?|lanolin|coconut|shea|beeswax|retinol|paraben|niacinamide|tocopherol|almond|oat|fragrance|sulfate|silicone|vegan|cruelty|shipping|refund|returns?|stock|size|ml|grams?)\b/i;
const HOLDING = /(check|confirm|look into|get back|come back|follow up|ask the team)/i;

/**
 * Absence claims a reply cannot make unless the page says so.
 *
 * This exists because the drafter's own negative-claim guard accepts any
 * negative statement as cover for any other. "Fragrance-free" on the page
 * currently licenses "there are no essential oils" and "there is no linalool".
 * A merchant would not send those, so the replay does not mark them sendable.
 */
const ABSENCE_TERMS = [
  "essential oils",
  "essential oil",
  "parfum",
  "fragrance",
  "linalool",
  "limonene",
  "citral",
  "geraniol",
  "citronellol",
  "coconut",
  "almond",
  "lanolin",
  "nuts",
  "paraben",
  "sulfate",
  "sulphate",
  "alcohol",
  "retinol",
  "silicone",
  "beeswax",
  "shea",
];

function hasUnsupportedAbsence(draft: string, doc: string): boolean {
  const d = draft.toLowerCase();
  const docL = doc.toLowerCase();
  for (const term of ABSENCE_TERMS) {
    const pattern = new RegExp(
      `\\b(?:no|not|free of|free from|doesn'?t contain|does not contain|without)\\s+(?:a\\s+|any\\s+|added\\s+)?${term}\\b`,
      "i",
    );
    if (!pattern.test(d)) continue;
    const backed =
      pattern.test(docL) || docL.includes(`${term}-free`) || docL.includes(`${term} free`);
    if (!backed) return true;
  }
  return false;
}

export function holdingReplyIsClean(text: string): boolean {
  const t = text.trim();
  return (
    t.length > 0 &&
    t.split(/\s+/).length <= 60 &&
    !/\d/.test(t) &&
    !FACTS.test(t) &&
    HOLDING.test(t) &&
    !/[\[\]{}]/.test(t)
  );
}

/**
 * Would a merchant send this unchanged?
 *
 * There is no merchant in a replay, so the decision is made by the same
 * deterministic checks the drafter already enforces. This is disclosed in the
 * commit message: outcomes are assigned by rule, not observed.
 */
function isSendable(
  r: { verdict: string; draft: string; evidence: { ok: boolean }[] },
  doc: string,
): boolean {
  const text = (r.draft ?? "").trim();
  if (!text) return false;
  if (TAG.test(text) || PLACEHOLDER.test(text)) return false;
  if (text.split(/\s+/).length > 70) return false;
  if (hasUnsupportedAbsence(text, doc)) return false;

  if (r.verdict === "answered") {
    return r.evidence.length > 0 && r.evidence.every((e) => e.ok);
  }
  return holdingReplyIsClean(text);
}

/* ------------------------------------------------------------------ run */

type Drafted = {
  verdict: string;
  draft: string;
  evidence: { ok: boolean }[];
  model: string;
};

async function draft(q: Question): Promise<Drafted> {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/api/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: q.productId, message: q.text, storeId: STORE }),
    });

    if (res.status === 503) {
      const body = (await res.json().catch(() => ({}))) as { reason?: string };
      throw new Error(
        `FLAG_OFF: ${body.reason ?? "drafter disabled"} — refusing to log a pilot without the gate`,
      );
    }
    if (res.ok) return (await res.json()) as Drafted;

    last = `HTTP ${res.status}`;
    if (!retryable(res.status)) break;
    await sleep(1500 * 2 ** attempt);
  }
  throw new Error(last || "draft failed");
}

mkdirSync(OUT_DIR, { recursive: true });

/**
 * --rescore re-decides the outcome for drafts already recorded, without
 * re-drafting, and re-sends the corrected outcome events. Used once, after the
 * absence check above was added, so the log reflects what a merchant would
 * actually send.
 */
if (process.argv.includes("--rescore")) {
  const existing = readFileSync(EVENTS, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as PilotEvent)
    .filter((e) => e.event === "ai_draft_created");

  console.log(`rescoring ${existing.length} stored drafts (no new drafts)`);
  const rewritten: PilotEvent[] = [];
  let discarded = 0;

  for (const created of existing) {
    rewritten.push(created);
    const doc = docById.get(created.product_id) ?? "";
    const bad = hasUnsupportedAbsence(created.draft_text, doc);
    const outcome = buildEvent({
      event: bad ? "ai_draft_discarded" : "ai_draft_sent_unchanged",
      questionId: created.question_id,
      productId: created.product_id,
      draftText: created.draft_text,
      sentText: bad ? null : created.draft_text,
      modelId,
    });
    const res = await capture(outcome, STORE);
    if (!res.ok) throw new Error(`capture failed for ${created.question_id}: ${res.error}`);
    rewritten.push(outcome);
    if (bad) {
      discarded++;
      console.log(`DISCARD ${created.question_id} ${created.product_id} — unsupported absence`);
    }
  }

  await shutdown();
  rewritten.sort((a, b) =>
    a.question_id === b.question_id
      ? a.event === "ai_draft_created"
        ? -1
        : 1
      : a.question_id.localeCompare(b.question_id),
  );
  writeFileSync(EVENTS, rewritten.map((e) => JSON.stringify(e)).join("\n") + "\n");
  console.log(`\nrescored: ${existing.length} created, ${existing.length - discarded} unchanged, ${discarded} discarded`);
  process.exit(0);
}

const events: PilotEvent[] = [];
const failures: string[] = [];
let fallbackUsed = 0;
let sent = 0;

async function runOne(q: Question) {
  const r = await draft(q);

  if (r.model !== modelId) fallbackUsed++;

  const created = buildEvent({
    event: "ai_draft_created",
    questionId: q.id,
    productId: q.productId,
    draftText: r.draft,
    sentText: null,
    modelId,
  });
  const c1 = await capture(created, STORE);
  if (!c1.ok) throw new Error(`capture created failed: ${c1.error}`);
  events.push(created);

  const sendable = isSendable(r, docById.get(q.productId) ?? "");
  const outcome: PilotEvent = buildEvent({
    event: sendable ? "ai_draft_sent_unchanged" : "ai_draft_discarded",
    questionId: q.id,
    productId: q.productId,
    draftText: r.draft,
    sentText: sendable ? r.draft : null,
    modelId,
  });
  const c2 = await capture(outcome, STORE);
  if (!c2.ok) throw new Error(`capture outcome failed: ${c2.error}`);
  events.push(outcome);

  if (sendable) sent++;
  console.log(
    `${sendable ? "sent  " : "DISCARD"} ${q.id} ${q.productId} ${r.verdict} ${r.draft.slice(0, 60).replace(/\s+/g, " ")}`,
  );
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        try {
          await fn(item);
        } catch (error) {
          const message = error instanceof Error ? error.message : "failed";
          if (message.startsWith("FLAG_OFF")) {
            console.error("\n" + message);
            process.exit(2);
          }
          failures.push(`${(item as Question).id}: ${message}`);
          console.error(`ERROR ${(item as Question).id}: ${message}`);
        }
      }
    }),
  );
}

console.log(`replaying ${questions.length} questions against ${BASE} as store ${STORE}`);
await pool(questions, 3, runOne);
await shutdown();

events.sort((a, b) =>
  a.question_id === b.question_id
    ? a.event === "ai_draft_created"
      ? -1
      : 1
    : a.question_id.localeCompare(b.question_id),
);

writeFileSync(EVENTS, events.map((e) => JSON.stringify(e)).join("\n") + "\n");

const count = (name: string) => events.filter((e) => e.event === name).length;
console.log("\n--- replay summary ---");
console.log(`questions attempted : ${questions.length}`);
console.log(`errors              : ${failures.length}`);
console.log(`ai_draft_created    : ${count("ai_draft_created")}`);
console.log(`sent_unchanged      : ${count("ai_draft_sent_unchanged")}`);
console.log(`sent_edited         : ${count("ai_draft_sent_edited")}`);
console.log(`discarded           : ${count("ai_draft_discarded")}`);
console.log(`fallback model used : ${fallbackUsed}`);
console.log(`events written      : ${EVENTS}`);

if (failures.length) {
  console.log("\nfailures:");
  for (const f of failures.slice(0, 20)) console.log("  " + f);
}
