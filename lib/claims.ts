/**
 * Negative-claim guard.
 *
 * The absence rule says the drafter must never turn a missing fact into a
 * negative answer. A weak model can still try ("we don't ship there", "it's
 * paraben-free"). If the draft asserts a negative, at least one verified quote
 * must itself contain a negative statement from the page.
 */
import type { VerifiedEvidence } from "./types";

const NEGATIVE_CLAIM =
  /\b(free of|free from|fragrance[- ]free|paraben[- ]free|nut[- ]free|vegan|cruelty[- ]free|gluten[- ]free)\b|(doesn'?t|does not|don'?t|do not|isn'?t|is not)\s+(contain|include|have|offer|ship|deliver|test)\b|\b(not|never)\s+(tested|available|offered|included|recommended|sold)\b|\bno\s+(parabens?|fragrance|lanolin|coconut|nuts?|tree nuts?|retinol|alcohol|sulfates?|sulphates?|essential oils)\b/i;

const NEGATIVE_IN_DOC =
  /\b(free of|free from|fragrance[- ]free|paraben[- ]free|nut[- ]free|vegan|cruelty[- ]free|not tested|never tested|no added|without)\b|\bnot\s+(contain|include|tested|available|offered)\b|\bno\s+(parabens?|fragrance|lanolin|coconut|nuts?|retinol|alcohol|sulfates?)\b/i;

export function assertsAbsence(draft: string): boolean {
  return NEGATIVE_CLAIM.test(draft);
}

export function evidenceBacksAbsence(evidence: VerifiedEvidence[]): boolean {
  return evidence.some((item) => item.ok && NEGATIVE_IN_DOC.test(item.quote));
}
