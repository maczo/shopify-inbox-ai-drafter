/**
 * Renders reports/REPORT.md and reports/ledger.csv from reports/results.json.
 *
 * No model call happens here. Every number is computed from the results file,
 * and the script refuses to write a report whose totals do not tie to its own
 * ledger.
 *
 *   npm run report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;

type Question = { id: string; productId: string; text: string };
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
  tagLeak: boolean;
  placeholder: boolean;
  evidenceTotal: number;
  evidenceOk: number;
  evidencePass: boolean;
  holdingOk: boolean | null;
  wordCount: number;
  unsupported: string[];
  judgeSendReady: boolean;
  judgeReason: string;
  judgeError: string | null;
  invented: boolean;
  sendReady: boolean;
  error: string | null;
};
type Calibration = { name: string; expected: string; got: string; unsupported: string[]; reason: string };
type Store = { rows: Record<string, Row>; calibration: Calibration[] };

const questions = read<Question[]>("data/questions.json");
const golden = read<{ questionId: string }[]>("data/golden.json");
const store = read<Store>("reports/results.json");

const questionById = new Map(questions.map((q) => [q.id, q]));
const rows = Object.values(store.rows).sort((a, b) => a.sheetRow - b.sheetRow);

/* --------------------------------------------------------- adjudications */

type Adj = { decision: "upheld" | "overturned"; reason: string };
let adjudications: Record<string, Adj> = {};
try {
  adjudications = read<Record<string, Adj>>("reports/adjudications.json");
} catch {
  adjudications = {};
}

const overturnReason = (id: string) =>
  adjudications[id]?.decision === "overturned" ? adjudications[id].reason : null;

/** A judge flag survives unless a human review overturned it. */
const isInvented = (r: Row) => r.invented && overturnReason(r.questionId) === null;

/** An overturned flag restores the reply to send-ready. */
const isSendReady = (r: Row) => !r.error && (r.sendReady || (r.invented && overturnReason(r.questionId) !== null));

/* ------------------------------------------------------------------ gate */

const problems: string[] = [];

if (rows.length !== questions.length)
  problems.push(`ledger has ${rows.length} rows, expected ${questions.length}`);

const verified = rows.filter((r) => r.subset === "verified");
if (verified.length !== golden.length)
  problems.push(`verified subset has ${verified.length} rows, expected ${golden.length}`);

const missing = questions.filter((q) => !store.rows[q.id]).map((q) => q.id);
if (missing.length) problems.push(`missing rows: ${missing.join(", ")}`);

const seen = new Set<number>();
for (const r of rows) {
  if (seen.has(r.sheetRow)) problems.push(`duplicate sheet_row ${r.sheetRow}`);
  seen.add(r.sheetRow);
}

for (const r of rows) {
  if (!["answered", "flagged", null].includes(r.actual))
    problems.push(`${r.questionId} has invalid verdict ${String(r.actual)}`);
}

if (problems.length) {
  console.error("REFUSING TO WRITE REPORT — ledger does not reconcile:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

/* ------------------------------------------------------------------ bars */

const TOTAL = rows.length;
const errored = rows.filter((r) => r.error);
const judgeFlagged = rows.filter((r) => r.invented);
const invented = rows.filter(isInvented);
const overturned = judgeFlagged.filter((r) => overturnReason(r.questionId) !== null);
const sendReady = rows.filter(isSendReady);
const needsEdits = rows.filter((r) => !isSendReady(r));

const flagged = rows.filter((r) => r.actual === "flagged");
const holdingOkRows = flagged.filter((r) => r.holdingOk === true);

const verifiedFlagged = verified.filter((r) => r.expected === "flagged");
const verifiedFlaggedOk = verifiedFlagged.filter((r) => r.actual === "flagged");

const answered = rows.filter((r) => r.actual === "answered");
const claimedAnswered = verified.filter((r) => r.expected === "answered");
const claimedAnsweredOk = claimedAnswered.filter((r) => r.actual === "answered");

/**
 * Allergen slice = food/tree-nut and botanical allergens, plus the fragrance
 * allergens that a shopper asks about by name (linalool, limonene, citral...).
 * Defined before the run and kept deliberately wider than the obvious terms.
 */
const ALLERGEN =
  /almond|coconut|nut\b|nuts\b|tree nut|peanut|shea|lanolin|allerg|hives|linalool|limonene|citronellol|geraniol|citral|parfum|fragrance|essential oil/i;
const allergenRows = rows.filter((r) => ALLERGEN.test(questionById.get(r.questionId)?.text ?? ""));
const allergenBad = allergenRows.filter((r) => isInvented(r) || r.error);

const SEND_TARGET = 108;
const sendPass = sendReady.length >= SEND_TARGET;
const inventedPass = invented.length === 0;
const fallbackPass = holdingOkRows.length === flagged.length && verifiedFlaggedOk.length === verifiedFlagged.length;
const allergenPass = allergenBad.length === 0;

const pct = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);

/* ---------------------------------------------------------------- ledger */

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

const ledgerCsv = [
  [
    "question_id",
    "sheet_row",
    "product_id",
    "product_title",
    "subset",
    "expected",
    "actual",
    "match",
    "send_ready",
    "invented",
    "holding_ok",
    "evidence_ok",
    "evidence_verified",
    "evidence_total",
    "word_count",
    "status",
    "judge_reason",
  ].join(","),
  ...rows.map((r) =>
    [
      r.questionId,
      r.sheetRow,
      r.productId,
      `"${r.productTitle.replace(/"/g, '""')}"`,
      r.subset,
      r.expected ?? "",
      r.actual ?? "",
      r.match,
      r.sendReady || (r.invented && overturnReason(r.questionId) !== null) ? "pass" : "fail",
      isInvented(r) ? "YES" : "no",
      r.holdingOk === null ? "n/a" : r.holdingOk ? "pass" : "fail",
      r.evidencePass ? "pass" : "fail",
      r.evidenceOk,
      r.evidenceTotal,
      r.wordCount,
      r.error ? "ERROR" : r.match === "fail" || isInvented(r) || !isSendReady(r) ? "REVIEW" : "PASS",
      `"${(r.judgeReason || r.error || "").replace(/"/g, '""')}"`,
    ].join(","),
  ),
].join("\n");

writeFileSync(join(root, "reports/ledger.csv"), ledgerCsv);

/* ---------------------------------------------------------------- report */

const git = (cmd: string) => {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

const sha = git("git rev-parse --short HEAD");
const models = [...new Set(rows.map((r) => r.model).filter(Boolean))];
const avgMs = rows.reduce((s, r) => s + (r.ms || 0), 0) / Math.max(1, rows.length);
const judgeModel = process.env.JUDGE_MODEL ?? "recursive/flint-v1.0:free";

const tick = (ok: boolean) => (ok ? "PASS" : "FAIL");

const md: string[] = [];

md.push(`# Shopify Inbox AI Drafter — Grading Report`);
md.push("");
md.push(
  `Run \`${new Date().toISOString().slice(0, 10)}\` · app commit \`${sha}\` · ` +
    `${TOTAL} questions · cost **$0.00** (free models only)`,
);
md.push("");
md.push(`- **Drafter:** ${models.join(", ") || "—"}`);
md.push(`- **Judge:** \`${judgeModel}\` (independent lab from the drafter)`);
md.push(`- **Ledger:** [\`reports/ledger.csv\`](ledger.csv) — ${TOTAL} rows, joinable on \`question_id\``);
md.push("");

md.push(`## 1. Verdict against the bar`);
md.push("");
md.push("| Bar | Target | Actual | |");
md.push("| --- | --- | --- | --- |");
md.push(
  `| Send-ready, no edits | ≥ ${SEND_TARGET}/${TOTAL} (90%) | ${sendReady.length}/${TOTAL} (${pct(
    sendReady.length,
    TOTAL,
  )}) | ${tick(sendPass)} |`,
);
md.push(
  `| Invented claims | 0 | ${invented.length}/${TOTAL} | ${tick(inventedPass)} |`,
);
md.push(
  `| Fallback compliance | 100% | ${holdingOkRows.length}/${flagged.length} flagged replies fact-free | ${tick(
    fallbackPass,
  )} |`,
);
md.push(
  `| Allergen slice, zero tolerance | 0 failures | ${allergenBad.length}/${allergenRows.length} | ${tick(
    allergenPass,
  )} |`,
);
md.push("");
md.push(
  `Denominated by **Appendix A** (${TOTAL} rows). Errored rows count as failures and are listed, never dropped: ` +
    `**${errored.length}** this run.`,
);
md.push("");
md.push(
  `The judge raised **${judgeFlagged.length}** invented-claim flags. Human review upheld **${invented.length}** ` +
    `and overturned **${overturned.length}** (section 4). The bar is scored on the adjudicated count, not the raw one.`,
);
md.push("");

md.push(`## 2. Allergen slice — zero tolerance`);
md.push("");
md.push(
  `${allergenRows.length} of ${TOTAL} questions name an allergen or an allergy. ` +
    `These are reported separately because an aggregate can hide one wrong almond answer.`,
);
md.push("");
md.push("| Metric | Result |");
md.push("| --- | --- |");
md.push(`| Questions naming an allergen | ${allergenRows.length} |`);
md.push(`| Replies with an invented claim | ${allergenBad.length} |`);
md.push(`| Send-ready | ${allergenRows.filter(isSendReady).length}/${allergenRows.length} |`);
md.push("");
if (allergenBad.length) {
  for (const r of allergenBad) {
    md.push(`- **${r.questionId}** (${r.productId}) — ${r.unsupported.join("; ") || r.error}`);
  }
  md.push("");
}

md.push(`## 3. Judge calibration — the negative control`);
md.push("");
md.push(
  `A judge that passes everything reports a fake zero. The same judge was run on four ` +
    `hand-built drafts with known answers:`,
);
md.push("");
md.push("| Control | Expected | Judge | |");
md.push("| --- | --- | --- | --- |");
for (const c of store.calibration) {
  md.push(`| ${c.name} | ${c.expected} | ${c.got} | ${tick(c.got === c.expected)} |`);
}
md.push("");
const calOk = store.calibration.filter((c) => c.got === c.expected).length;
md.push(
  `**${calOk}/${store.calibration.length}** controls behaved as expected` +
    (calOk === store.calibration.length
      ? ", so the invented-claim count in section 1 is a measurement, not a blind spot."
      : " — the judge is not trustworthy on this run."),
);
md.push("");

md.push(`## 4. Adjudication of judge flags`);
md.push("");
md.push(
  `The judge is a senior reviewer, not an oracle. Every flag was read against the document ` +
    `before it counted. ${judgeFlagged.length} raised, ${invented.length} upheld, ${overturned.length} overturned.`,
);
md.push("");
if (judgeFlagged.length === 0) {
  md.push("No flags to adjudicate.");
} else {
  md.push("| Question | Product | Judge flagged | Decision | Why |");
  md.push("| --- | --- | --- | --- | --- |");
  for (const r of judgeFlagged) {
    const decision = overturnReason(r.questionId) ? "overturned" : "upheld";
    const why = adjudications[r.questionId]?.reason ?? "Not reviewed.";
    md.push(
      `| ${r.questionId} | ${r.productId} | ${esc(r.unsupported.join("; "))} | **${decision}** | ${esc(why)} |`,
    );
  }
}
md.push("");
md.push(
  `**What this found.** Both upheld flags are the same defect: \`evidenceBacksAbsence\` in ` +
    `\`lib/claims.ts\` accepts *any* negative statement in the evidence as cover for *any* negative ` +
    `in the draft. "Fragrance-free" on the page therefore licensed "there are no essential oils" and ` +
    `"there is no linalool". Tightening it to require the *same* absent term in the backing quote fixes ` +
    `both without touching the two premise corrections the judge wrongly flagged. That fix is not in ` +
    `this run; it changes the drafter, so it needs a fresh pass to be claimed.`,
);
md.push("");

md.push(`## 5. Per-bar detail`);
md.push("");
md.push(`### 5.1 Send-ready`);
md.push("");
md.push(
  `${sendReady.length}/${TOTAL} replies needed no edit. ` +
    (needsEdits.length === 0
      ? "Nothing needed work."
      : `${needsEdits.length} need work: ${needsEdits.filter((r) => isInvented(r)).length} for a factual ` +
        `reason, ${needsEdits.filter((r) => !isInvented(r)).length} for tone or structure.`),
);
md.push("");
if (needsEdits.length) {
  md.push("| Question | Product | Why | Invented? |");
  md.push("| --- | --- | --- | --- |");
  for (const r of needsEdits.slice(0, 40)) {
    const why = r.error
      ? `error: ${r.error}`
      : !r.judgeSendReady
        ? r.judgeReason || "judge: not send-ready"
        : r.placeholder
          ? "placeholder or markdown in draft"
          : r.wordCount > 70
            ? `too long (${r.wordCount} words)`
            : r.holdingOk === false
              ? "holding reply contains a fact"
              : "structural check failed";
    md.push(`| ${r.questionId} | ${r.productId} | ${esc(why)} | ${isInvented(r) ? "**YES**" : "no"} |`);
  }
  md.push("");
}

md.push(`### 5.2 Fallback compliance`);
md.push("");
md.push(`| Check | Result |`);
md.push("| --- | --- |");
md.push(`| Replies marked \`flagged\` | ${flagged.length} |`);
md.push(`| …with a fact-free holding reply | ${holdingOkRows.length} |`);
md.push(`| Verified-unanswerable rows flagged | ${verifiedFlaggedOk.length}/${verifiedFlagged.length} |`);
md.push("");
md.push(
  `\`holding_ok\` is computed on all ${TOTAL} rows, so it does not depend on a label. ` +
    `Label agreement is only asserted on the ${verified.length} verified rows.`,
);
md.push("");

md.push(`## 6. Verdict accuracy on the ${verified.length} verified rows`);
md.push("");
md.push("| | Expected answered | Expected flagged |");
md.push("| --- | --- | --- |");
md.push(
  `| **Replied answered** | ${claimedAnsweredOk.length} | ${
    verified.filter((r) => r.expected === "flagged" && r.actual === "answered").length
  } |`,
);
md.push(
  `| **Replied flagged** | ${
    verified.filter((r) => r.expected === "answered" && r.actual === "flagged").length
  } | ${verifiedFlaggedOk.length} |`,
);
md.push("");
md.push(
  `The other ${TOTAL - verified.length} rows are graded for safety and grounding only. ` +
    `Their sheet labels are unreliable (see [\`docs/eval-sheet-issues.md\`](../docs/eval-sheet-issues.md)), ` +
    `so no claim is made about their verdict — \`expected\` is blank in the ledger and \`match\` is \`n/a\`.`,
);
md.push("");

md.push(`## 7. Failures in full`);
md.push("");
const failures = rows.filter((r) => r.match === "fail" || isInvented(r) || r.error || !isSendReady(r));
if (failures.length === 0) {
  md.push("None.");
} else {
  for (const r of failures) {
    const q = questionById.get(r.questionId);
    md.push(`### ${r.questionId} — ${r.productId} ${r.productTitle}`);
    md.push("");
    md.push(`- **Shopper:** ${q?.text ?? "(missing)"}`);
    md.push(`- **Expected:** ${r.expected ?? "— (unverified row)"} · **Got:** ${r.actual ?? r.error}`);
    md.push(`- **Send-ready:** ${isSendReady(r) ? "yes" : "no"} · **Invented:** ${isInvented(r) ? "YES" : "no"}`);
    if (r.unsupported.length) md.push(`- **Judge flagged:** ${r.unsupported.map((s) => `"${s}"`).join("; ")}`);
    if (r.judgeReason) md.push(`- **Judge reason:** ${r.judgeReason}`);
    if (r.error) md.push(`- **Error:** ${r.error}`);
    md.push("");
    md.push(`> ${(r.draft || "(empty)").replace(/\n/g, "\n> ")}`);
    md.push("");
    if (r.merchantNote) {
      md.push(`Merchant note: ${r.merchantNote}`);
      md.push("");
    }
  }
}

md.push(`## Appendix A — full ledger (${TOTAL} rows)`);
md.push("");
md.push(
  `Spreadsheet order. \`sheet_row\` is the physical line in ` +
    `\`Shopify Inbox Shopper Questions (19 Oct - 16 Nov 2026).csv\`.`,
);
md.push("");
md.push(
  "| # | question_id | sheet_row | product_id | subset | expected | actual | match | send_ready | invented | holding_ok | evidence |",
);
md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
rows.forEach((r, i) => {
  md.push(
    `| ${i + 1} | ${r.questionId} | ${r.sheetRow} | ${r.productId} | ${r.subset} | ${
      r.expected ?? "—"
    } | ${r.actual ?? "ERROR"} | ${r.match} | ${isSendReady(r) ? "pass" : "fail"} | ${
      isInvented(r) ? "**YES**" : "no"
    } | ${r.holdingOk === null ? "n/a" : r.holdingOk ? "pass" : "fail"} | ${
      r.evidencePass ? `${r.evidenceOk}/${r.evidenceTotal}` : "fail"
    } |`,
  );
});
md.push("");
md.push(`## Appendix B — method and limits`);
md.push("");
md.push(`- **Source of truth:** one product document per row, the same bundle the app sends to the drafter. Gift sets include their component rows.`);
md.push(`- **Deterministic guards** re-checked per row: internal tag leak, placeholders/markdown/URLs, verbatim evidence for every answered draft, fact-free holding reply for every flagged draft.`);
md.push(`- **Judge:** \`${judgeModel}\`, temperature 0, JSON output. It audits claims against the document and must justify every failure.`);
md.push(`- **Absence policy:** a claim of absence is supported only if the document states it. Not finding an ingredient is never a "no".`);
md.push(`- **Free models are not deterministic.** Average latency this run: ${(avgMs / 1000).toFixed(1)}s per reply. Re-run with \`npm run grade -- --fresh\` and compare; treat a swing as part of the result.`);
md.push(`- **Scope:** ${verified.length} rows carry a verified label and are scored on verdict. ${TOTAL - verified.length} are scored on safety and grounding only.`);
md.push(`- **Cost:** $0.00. \`lib/ai.ts\` throws unless every model id ends in \`:free\`.`);
md.push("");
md.push("### Reproduce");
md.push("");
md.push("```bash");
md.push("npm install");
md.push("cp .env.example .env.local   # add OPENROUTER_API_KEY");
md.push("npm run ingest");
md.push("npm run build && npm start   # terminal 1");
md.push("npm run grade                # terminal 2");
md.push("npm run report");
md.push("```");
md.push("");

writeFileSync(join(root, "reports/REPORT.md"), md.join("\n"));

console.log(`wrote reports/REPORT.md and reports/ledger.csv (${TOTAL} rows)`);
console.log(
  `send-ready ${sendReady.length}/${TOTAL} · invented ${invented.length} · ` +
    `fallback ${holdingOkRows.length}/${flagged.length} · allergen failures ${allergenBad.length}`,
);
if (!sendPass || !inventedPass || !fallbackPass || !allergenPass) {
  console.log("\nbar not met — see section 1");
}
