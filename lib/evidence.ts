import type { Evidence, VerifiedEvidence } from "./types";

/** Collapse whitespace and case so quotes survive line-wrap differences. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Checks each quote is a real substring of the document bundle.
 * A quote shorter than 4 characters is treated as unverifiable — otherwise
 * something like "50" would match everywhere.
 */
export function verifyEvidence(
  evidence: Evidence[],
  docText: string,
): VerifiedEvidence[] {
  const haystack = normalize(docText);
  return evidence.map((item) => {
    const needle = normalize(item.quote ?? "");
    const longEnough = needle.length >= 4;
    return {
      ...item,
      ok: longEnough && haystack.includes(needle),
    };
  });
}

export function hasUsableEvidence(evidence: VerifiedEvidence[]): boolean {
  return evidence.some((e) => e.ok);
}
