/**
 * PostHog capture for the pilot event log, via posthog-node as the tracking
 * plan specifies.
 *
 * Every payload matches the plan exactly:
 *   event, question_id, product_id, timestamp, draft_text, sent_text, model_id,
 *   $feature/inbox-ai-reply-drafter
 *
 * Every capture also carries the store group, because the plan requires the
 * group on every call and the ship-or-stop memo segments by it.
 */
import { PostHog } from "posthog-node";

export type PilotEventName =
  | "ai_draft_created"
  | "ai_draft_sent_unchanged"
  | "ai_draft_sent_edited"
  | "ai_draft_discarded";

export type PilotEvent = {
  event: PilotEventName;
  question_id: string;
  product_id: string;
  timestamp: string;
  draft_text: string;
  sent_text: string | null;
  model_id: string;
  "$feature/inbox-ai-reply-drafter": true;
};

export function buildEvent(input: {
  event: PilotEventName;
  questionId: string;
  productId: string;
  draftText: string;
  sentText: string | null;
  modelId: string;
  timestamp?: string;
}): PilotEvent {
  return {
    event: input.event,
    question_id: input.questionId,
    product_id: input.productId,
    timestamp: input.timestamp ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    draft_text: input.draftText,
    sent_text: input.sentText,
    model_id: input.modelId,
    "$feature/inbox-ai-reply-drafter": true,
  };
}

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY?.trim();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: (process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/, ""),
      // The replay is a batch; flush per event so a failure is attributable.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/**
 * Sends one event immediately and reports whether PostHog accepted it, so the
 * replay fails loudly instead of writing a log that claims delivery it never got.
 */
export async function capture(
  event: PilotEvent,
  store: string,
): Promise<{ ok: boolean; error?: string }> {
  const ph = getClient();
  if (!ph) return { ok: false, error: "POSTHOG_API_KEY missing" };

  const { event: name, ...properties } = event;

  try {
    await ph.captureImmediate({
      distinctId: `pilot:${store}`,
      event: name,
      properties,
      groups: { store },
      timestamp: new Date(event.timestamp),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "capture failed",
    };
  }
}

export async function shutdown(): Promise<void> {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
