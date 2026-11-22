import { randomUUID } from "node:crypto";
import { Output, generateText } from "ai";
import { captureAiGeneration } from "@/instrumentation";
import { DRAFTER_CHAIN, modelFor } from "./ai";
import { stripDocAnnotations } from "./annotations";
import { assertsAbsence, evidenceBacksAbsence } from "./claims";
import { buildDocBundle, getProduct } from "./docs";
import { hasUsableEvidence, verifyEvidence } from "./evidence";
import { HOLDING_TEMPLATE, checkHoldingReply } from "./holding";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { DraftSchema, type DraftObject } from "./schema";
import type { DraftResponse } from "./types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b|rate.?limit|timed? ?out|overloaded|no object generated/i.test(
    message,
  );
}

async function callWithFallback(
  prompt: string,
  traceId: string,
): Promise<{
  object: DraftObject;
  modelId: string;
}> {
  let lastError: unknown;
  const input = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  for (const modelId of DRAFTER_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const generationStarted = Date.now();
      try {
        const { output, usage } = await generateText({
          model: modelFor(modelId),
          output: Output.object({
            schema: DraftSchema,
            name: "draft_result",
            description:
              "One shopper reply, a merchant note, and verbatim evidence quotes.",
          }),
          system: SYSTEM_PROMPT,
          prompt,
          temperature: 0,
          maxRetries: 0,
        });
        captureAiGeneration({
          traceId,
          model: modelId,
          input,
          outputChoices: [
            { role: "assistant", content: JSON.stringify(output) },
          ],
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          latency: (Date.now() - generationStarted) / 1000,
        });
        return { object: output as DraftObject, modelId };
      } catch (error) {
        captureAiGeneration({
          traceId,
          model: modelId,
          input,
          outputChoices: [],
          inputTokens: 0,
          outputTokens: 0,
          latency: (Date.now() - generationStarted) / 1000,
        });
        lastError = error;
        if (!isRetryable(error) || attempt === 1) break;
        await sleep(1200 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All free models failed. Try again in a minute.");
}

export type DraftInput = {
  productId: string;
  message: string;
};

export async function generateDraft({
  productId,
  message,
}: DraftInput): Promise<DraftResponse> {
  const product = getProduct(productId);
  if (!product) throw new Error(`Unknown product: ${productId}`);
  if (!message.trim()) throw new Error("The shopper message is empty.");

  const started = Date.now();
  const docText = buildDocBundle(product);
  const prompt = buildUserPrompt(product, message);

  const traceId = randomUUID();
  const { object, modelId } = await callWithFallback(prompt, traceId);

  const evidence = verifyEvidence(object.evidence ?? [], docText);
  let verdict = object.verdict;
  let draft = stripDocAnnotations((object.draft ?? "").trim());
  let merchantNote = stripDocAnnotations((object.merchantNote ?? "").trim());
  let downgraded = false;

  const downgrade = (reason: string) => {
    verdict = "flagged";
    downgraded = true;
    draft = HOLDING_TEMPLATE;
    merchantNote = [merchantNote, reason].filter(Boolean).join(" ");
  };

  // 1. The model may not certify its own grounding.
  if (verdict === "answered" && !hasUsableEvidence(evidence)) {
    downgrade(
      "Draft rejected automatically: no claim could be matched to the product document.",
    );
  }

  // 2. No negative answers without a negative statement on the page.
  if (
    verdict === "answered" &&
    assertsAbsence(draft) &&
    !evidenceBacksAbsence(evidence)
  ) {
    downgrade(
      "Draft rejected automatically: it stated a negative the product page does not make.",
    );
  }

  // 3. A flagged reply must contain no facts.
  if (verdict === "flagged") {
    const check = checkHoldingReply(draft);
    if (!check.ok) {
      draft = HOLDING_TEMPLATE;
      downgraded = true;
      merchantNote = [merchantNote, "Holding reply replaced with the standard wording."]
        .filter(Boolean)
        .join(" ");
    }
  }

  return {
    verdict,
    draft,
    merchantNote,
    evidence,
    productId: product.id,
    productTitle: product.title,
    downgraded,
    model: modelId,
    ms: Date.now() - started,
  };
}
