import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * This project is configured to spend exactly $0.
 * Every model in the chain must be a `:free` OpenRouter model; anything else
 * throws rather than silently charging the key.
 */
export function assertFreeModel(id: string): void {
  if (!id.trim().endsWith(":free")) {
    throw new Error(
      `Refusing to use non-free model "${id}". This project only runs :free models.`,
    );
  }
}

const primary =
  process.env.OPENROUTER_DRAFTER_MODEL ?? "nvidia/nemotron-3.5-super-vl:free";

const fallbacks = (
  process.env.FALLBACK_MODELS ??
  "baidu/ernie-5.5-flash-preview:free,inclusionai/ling-3.2-flash:free"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const DRAFTER_CHAIN: string[] = [primary, ...fallbacks];

DRAFTER_CHAIN.forEach(assertFreeModel);

let client: ReturnType<typeof createOpenRouter> | null = null;

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and add your key.",
    );
  }
  if (!client) client = createOpenRouter({ apiKey });
  return client;
}

export function modelFor(id: string) {
  assertFreeModel(id);
  return getClient()(id);
}
