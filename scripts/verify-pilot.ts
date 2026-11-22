/**
 * Validates pilot/events.jsonl against the tracking plan and the completeness
 * rule before anything is committed.
 *
 *   npm run pilot:verify
 *
 * Hard failures (schema, one event per question, counts) exit non-zero and the
 * log must not be committed. The pilot-window check is reported separately,
 * because the run date is an environmental fact, not a data defect.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;

type Question = { id: string; productId: string; text: string };

const plan = read<{
  $defs: {
    feature_flag: { properties: { key: { const: string } } };
    pilot_event: { required: string[] };
  };
  properties: {
    metrics: { properties: { unedited_send_rate: { properties: { target: { const: string } } } } };
  };
}>("Shopify Inbox AI Drafter Pilot Tracking Plan.json");

const questions = read<Question[]>("data/questions.json");
const byId = new Map(questions.map((q) => [q.id, q]));

const EVENTS_PATH = join(root, "pilot/events.jsonl");
if (!existsSync(EVENTS_PATH)) {
  console.error("pilot/events.jsonl not found — run `npm run pilot` first.");
  process.exit(1);
}

const events = readFileSync(EVENTS_PATH, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as Record<string, unknown>);

const REQUIRED = [
  "event",
  "question_id",
  "product_id",
  "timestamp",
  "draft_text",
  "sent_text",
  "model_id",
  "$feature/inbox-ai-reply-drafter",
];

const EVENTS = [
  "ai_draft_created",
  "ai_draft_sent_unchanged",
  "ai_draft_sent_edited",
  "ai_draft_discarded",
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const WINDOW_START = Date.parse("2026-11-27T00:00:00Z");
const WINDOW_END = Date.parse("2026-12-02T23:59:59Z");

const errors: string[] = [];

/* -------------------------------------------------------------- schema */

events.forEach((e, i) => {
  const where = `event ${i + 1} (${String(e.question_id ?? "?")} / ${String(e.event ?? "?")})`;

  for (const key of REQUIRED) {
    if (!(key in e)) errors.push(`${where}: missing ${key}`);
  }
  for (const key of Object.keys(e)) {
    if (!REQUIRED.includes(key)) errors.push(`${where}: unexpected property ${key}`);
  }

  if (!EVENTS.includes(e.event as (typeof EVENTS)[number])) {
    errors.push(`${where}: event name not in the plan`);
  }
  if (!/^Q-\d{3}$/.test(String(e.question_id ?? ""))) {
    errors.push(`${where}: question_id pattern`);
  }
  if (!/^DSP-\d{3}$/.test(String(e.product_id ?? ""))) {
    errors.push(`${where}: product_id pattern`);
  }
  if (!ISO.test(String(e.timestamp ?? "")) || Number.isNaN(Date.parse(String(e.timestamp)))) {
    errors.push(`${where}: timestamp is not ISO 8601 UTC with Z`);
  }
  if (typeof e.draft_text !== "string" || e.draft_text.length < 1) {
    errors.push(`${where}: draft_text empty`);
  }
  if (typeof e.model_id !== "string" || e.model_id.length < 1) {
    errors.push(`${where}: model_id empty`);
  }
  if (e["$feature/inbox-ai-reply-drafter"] !== true) {
    errors.push(`${where}: $feature/inbox-ai-reply-drafter is not true`);
  }

  const isCreatedOrDiscarded =
    e.event === "ai_draft_created" || e.event === "ai_draft_discarded";
  if (isCreatedOrDiscarded && e.sent_text !== null) {
    errors.push(`${where}: sent_text must be null`);
  }
  if (!isCreatedOrDiscarded && (typeof e.sent_text !== "string" || e.sent_text.length < 1)) {
    errors.push(`${where}: sent_text must be a string`);
  }

  const q = byId.get(String(e.question_id));
  if (q && q.productId !== e.product_id) {
    errors.push(`${where}: product_id does not match the question row (${q.productId})`);
  }
});

/* --------------------------------------------------------- completeness */

const created = events.filter((e) => e.event === "ai_draft_created");
const unchanged = events.filter((e) => e.event === "ai_draft_sent_unchanged");
const edited = events.filter((e) => e.event === "ai_draft_sent_edited");
const discarded = events.filter((e) => e.event === "ai_draft_discarded");

if (created.length !== 120) {
  errors.push(`completeness: ai_draft_created = ${created.length}, expected 120`);
}

const createdIds = created.map((e) => String(e.question_id));
if (new Set(createdIds).size !== createdIds.length) {
  errors.push("completeness: duplicate question_id on ai_draft_created");
}
const expectedIds = questions.map((q) => q.id);
for (const id of expectedIds) {
  if (!createdIds.includes(id)) errors.push(`completeness: no ai_draft_created for ${id}`);
}

const outcomes = unchanged.length + edited.length + discarded.length;
if (outcomes !== created.length) {
  errors.push(
    `completeness: unchanged ${unchanged.length} + edited ${edited.length} + discarded ${discarded.length} = ${outcomes}, expected ${created.length}`,
  );
}

// Exactly one outcome per question, and the same draft text on both events.
for (const id of createdIds) {
  const mine = events.filter((e) => e.question_id === id && e.event !== "ai_draft_created");
  if (mine.length !== 1) errors.push(`completeness: ${id} has ${mine.length} outcome events`);
  const c = created.find((e) => e.question_id === id);
  if (c && mine[0] && c.draft_text !== mine[0].draft_text) {
    errors.push(`${id}: draft_text differs between created and outcome`);
  }
}

/* ------------------------------------------------------------- window */

const outside = events.filter((e) => {
  const t = Date.parse(String(e.timestamp));
  return t < WINDOW_START || t > WINDOW_END;
});
const firstTs = events.length ? String(events.map((e) => e.timestamp).sort()[0]) : "n/a";
const lastTs = events.length ? String(events.map((e) => e.timestamp).sort().at(-1)) : "n/a";

/* ------------------------------------------------------------- report */

const rate = created.length ? unchanged.length / created.length : 0;
const lines: string[] = [];
lines.push("Pilot event log verification");
lines.push("===========================");
lines.push("");
lines.push(`events                : ${events.length}`);
lines.push(`ai_draft_created      : ${created.length}`);
lines.push(`ai_draft_sent_unchanged: ${unchanged.length}`);
lines.push(`ai_draft_sent_edited  : ${edited.length}`);
lines.push(`ai_draft_discarded    : ${discarded.length}`);
lines.push(`unedited send rate    : ${(rate * 100).toFixed(1)}% (target >= 60%)`);
lines.push("");
lines.push(`flag                  : $feature/${plan.$defs.feature_flag.properties.key.const} = true on every event`);
lines.push(`timestamps            : ${firstTs} .. ${lastTs}`);
lines.push("");
lines.push("pilot window           : 2026-11-27T00:00:00Z .. 2026-12-02T23:59:59Z");
lines.push(
  `window check           : ${
    outside.length === 0
      ? "PASS"
      : `DEVIATION - ${outside.length} events fall outside the window (recorded at true capture time, not adjusted)`
  }`,
);
lines.push("");
lines.push(`schema + completeness  : ${errors.length === 0 ? "PASS" : `FAIL (${errors.length})`}`);
if (errors.length) {
  for (const e of errors.slice(0, 40)) lines.push("  - " + e);
}

const text = lines.join("\n");
writeFileSync(join(root, "pilot/verification.txt"), text + "\n");
console.log(text);

if (errors.length > 0) {
  console.error("\nRefusing to accept this log. Fix the errors above before committing.");
  process.exit(1);
}
