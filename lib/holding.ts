/**
 * A holding reply is sent when the document cannot answer the question.
 * It must contain zero facts, so we validate it in code rather than trusting
 * the model. If it fails, we fall back to a fixed template.
 */
export const HOLDING_TEMPLATE =
  "Thanks for reaching out. Let me check that with the team and I'll come back to you shortly.";

const APPROVED = /(check|confirm|look into|get back|come back|follow up|ask the team)/i;

const FACT_MARKERS =
  /\d|\$|%|\b(ingredients?|contains?|lanolin|coconut|shea|beeswax|retinol|paraben|niacinamide|tocopherol|almond|oat|fragrance|sulfate|silicone|vegan|cruelty|shipping|refund|returns?|stock|size|ml|grams?)\b/i;

export type HoldingCheck = { ok: true } | { ok: false; reason: string };

export function checkHoldingReply(draft: string): HoldingCheck {
  const text = draft.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.split(/\s+/).length > 60) return { ok: false, reason: "too long" };
  if (/\d/.test(text)) return { ok: false, reason: "contains a number" };
  if (FACT_MARKERS.test(text)) return { ok: false, reason: "contains a product fact" };
  if (!APPROVED.test(text)) return { ok: false, reason: "no holding phrase" };
  if (/[\[\]{}]/.test(text)) return { ok: false, reason: "contains a placeholder" };
  return { ok: true };
}
