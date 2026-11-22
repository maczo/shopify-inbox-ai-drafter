/**
 * The document is annotated with bracketed notes so the model cannot miss a
 * relationship the page implies but does not spell out:
 *
 *   Caprylic/Capric Triglyceride [coconut-derived: Caprylic/Capric Triglyceride]
 *   Tocopherol [also known as: vitamin E]
 *
 * Those notes are for the model only. They must never reach a shopper, so every
 * model output is stripped before it leaves the server.
 */
const ANNOTATION = /\s*\[(?:coconut-derived|also known as):[^\]]*\]/gi;

export function stripDocAnnotations(text: string): string {
  return text.replace(ANNOTATION, "");
}
