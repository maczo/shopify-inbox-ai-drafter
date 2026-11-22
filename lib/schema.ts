import { z } from "zod";

export const DraftSchema = z.object({
  verdict: z
    .enum(["answered", "flagged"])
    .describe(
      "answered when every part of the shopper message can be answered from the product document; flagged when any part cannot.",
    ),
  draft: z
    .string()
    .describe(
      "The single reply the merchant will send. Plain text, no markdown, no placeholders. When verdict is flagged this must be a neutral holding reply containing no facts.",
    ),
  merchantNote: z
    .string()
    .describe(
      "Merchant-facing note. Explain exactly what the document does not cover, and list any part of the question that WAS answerable.",
    ),
  evidence: z
    .array(
      z.object({
        quote: z
          .string()
          .describe("Exact text copied from the product document, character for character."),
        field: z
          .string()
          .describe("The document label the quote came from, e.g. Price, Ingredients, Usage."),
      }),
    )
    .describe("Every factual claim in the draft must be backed by a verbatim quote."),
});

export type DraftObject = z.infer<typeof DraftSchema>;
