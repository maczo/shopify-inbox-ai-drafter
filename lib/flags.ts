/**
 * PostHog feature flag check for the reply drafter pilot.
 *
 * Contract (Shopify Inbox AI Drafter Pilot Tracking Plan v1.0):
 *   key            inbox-ai-reply-drafter
 *   group type     store
 *   group key      inbox-ai-dev-store  -> 100%
 *   everyone else  -> 0%
 *   enforced_where "server: checked on every draft request; client only hides UI"
 *
 * Safety default: anything that is not an explicit "enabled" from PostHog is
 * treated as OFF. A network failure, a missing key, a malformed response or an
 * unknown store must never unlock the drafter.
 */

export const FLAG_KEY = "inbox-ai-reply-drafter";
export const PILOT_GROUP_TYPE = "store";
export const PILOT_STORE = "inbox-ai-dev-store";

const CACHE_MS = 60_000;
const TIMEOUT_MS = 10_000;

type CacheEntry = { on: boolean; at: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FlagDecision>>();

export type FlagDecision = {
  on: boolean;
  store: string;
  reason: string;
};

function host(): string {
  return (process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/, "");
}

function apiKey(): string | null {
  const key = process.env.POSTHOG_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

async function evaluate(store: string): Promise<FlagDecision> {
  const key = apiKey();
  if (!key) {
    return { on: false, store, reason: "POSTHOG_API_KEY missing — failing closed" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${host()}/flags/?v=2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        distinct_id: `pilot:${store}`,
        groups: { [PILOT_GROUP_TYPE]: store },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { on: false, store, reason: `posthog HTTP ${res.status} — failing closed` };
    }

    const json = (await res.json()) as {
      flags?: Record<string, { enabled?: boolean }>;
    };
    const on = json.flags?.[FLAG_KEY]?.enabled === true;

    // Only cache a positive or an explicit negative; never cache a failure.
    cache.set(store, { on, at: Date.now() });
    return { on, store, reason: on ? "enabled for store group" : "not enabled for store" };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "posthog timed out — failing closed"
        : "posthog unreachable — failing closed";
    return { on: false, store, reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Evaluates the flag for one store. PostHog decides per store, not per person,
 * so the store group is sent on every evaluation. Concurrent callers for the
 * same store share one network request.
 */
export async function isDrafterEnabled(store: string): Promise<FlagDecision> {
  if (!store) {
    return { on: false, store, reason: "no store in request — failing closed" };
  }

  const cached = cache.get(store);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { on: cached.on, store, reason: "cached" };
  }

  const pending = inflight.get(store);
  if (pending) return pending;

  const promise = evaluate(store).finally(() => inflight.delete(store));
  inflight.set(store, promise);
  return promise;
}
