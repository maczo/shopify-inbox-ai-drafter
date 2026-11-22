/**
 * Runs the hand-verified golden set against the running app.
 *
 *   npm run dev            # in one terminal
 *   npm run eval           # in another
 *   npm run eval -- --limit=10
 *   npm run eval -- --resume
 *
 * The full 120-row sheet is NOT used here on purpose — most of its labels do
 * not match the product sheet. See docs/eval-sheet-issues.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Number.POSITIVE_INFINITY;
const resume = args.includes("--resume");
const pauseMs = Number(
  args.find((a) => a.startsWith("--pause="))?.split("=")[1] ?? 1200,
);

type Golden = {
  questionId: string;
  productId: string;
  verdict: "answered" | "flagged";
  note: string;
};

type Question = {
  id: string;
  text: string;
  productId: string;
};

type Result = {
  expected: string;
  actual: string;
  ms: number;
  evidence: number;
  draft: string;
};

const golden = JSON.parse(
  readFileSync(join(root, "data/golden.json"), "utf8"),
) as Golden[];
const questions = JSON.parse(
  readFileSync(join(root, "data/questions.json"), "utf8"),
) as Question[];
const questionById = new Map(questions.map((q) => [q.id, q]));

const cachePath = join(root, "data/eval-results.json");
const cache: Record<string, Result> =
  resume && existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, Result>)
    : {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rows = golden.slice(0, Number.isFinite(limit) ? limit : golden.length);

console.log(`evaluating ${rows.length} verified rows against ${BASE}\n`);

for (const row of rows) {
  if (resume && cache[row.questionId]) {
    const cached = cache[row.questionId];
    console.log(
      `${cached.actual === row.verdict ? "PASS" : "FAIL"} ${row.questionId} (cached)`,
    );
    continue;
  }

  const question = questionById.get(row.questionId);
  if (!question) {
    console.log(`SKIP ${row.questionId} — question not found`);
    continue;
  }

  try {
    const res = await fetch(`${BASE}/api/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: row.productId,
        message: question.text,
      }),
    });
    const data = (await res.json()) as {
      verdict?: string;
      draft?: string;
      evidence?: unknown[];
      ms?: number;
      error?: string;
    };

    if (!res.ok) {
      console.log(`FAIL ${row.questionId} — ${data.error ?? res.status}`);
      continue;
    }

    const actual = data.verdict ?? "unknown";
    cache[row.questionId] = {
      expected: row.verdict,
      actual,
      ms: data.ms ?? 0,
      evidence: data.evidence?.length ?? 0,
      draft: data.draft ?? "",
    };

    const pass = actual === row.verdict;
    console.log(
      `${pass ? "PASS" : "FAIL"} ${row.questionId}  expected=${row.verdict}  actual=${actual}  ${(data.ms ?? 0) / 1000}s`,
    );
    if (!pass) {
      console.log(`     ${question.text.slice(0, 90)}`);
      console.log(`     draft: ${(data.draft ?? "").slice(0, 110)}`);
    }
  } catch (error) {
    console.log(
      `FAIL ${row.questionId} — ${error instanceof Error ? error.message : "request failed"}`,
    );
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  await sleep(pauseMs);
}

// ---------------------------------------------------------------- summary

const scored = rows
  .map((row) => ({ row, result: cache[row.questionId] }))
  .filter((entry): entry is { row: Golden; result: Result } => Boolean(entry.result));

const passed = scored.filter((e) => e.result.actual === e.row.verdict).length;
const total = scored.length;

console.log("\n" + "-".repeat(52));
console.log(`score: ${passed}/${total} (${total ? Math.round((passed / total) * 100) : 0}%)`);

const matrix: Array<"answered" | "flagged"> = ["answered", "flagged"];
for (const expected of matrix) {
  const subset = scored.filter((e) => e.row.verdict === expected);
  const correct = subset.filter((e) => e.result.actual === expected).length;
  const wrong = subset.filter((e) => e.result.actual !== expected).length;
  console.log(`expected ${expected.padEnd(9)} correct=${correct}  wrong=${wrong}`);
}

const avgMs =
  scored.reduce((sum, e) => sum + e.result.ms, 0) / Math.max(scored.length, 1);
console.log(`avg latency: ${(avgMs / 1000).toFixed(1)}s`);

const failures = scored.filter((e) => e.result.actual !== e.row.verdict);
if (failures.length > 0) {
  console.log("\nfailures:");
  for (const failure of failures) {
    console.log(
      `  ${failure.row.questionId} expected=${failure.row.verdict} actual=${failure.result.actual}`,
    );
  }
}

console.log(`\nresults cached in data/eval-results.json`);
