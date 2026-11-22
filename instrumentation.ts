import { PostHog } from "posthog-node";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken && process.env.NODE_ENV !== "production") {
  console.warn(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}

if (!host && process.env.NODE_ENV !== "production") {
  console.warn(
    "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
  );
}

const posthog =
  projectToken && host
    ? new PostHog(projectToken, {
        host,
        flushAt: 1,
        flushInterval: 0,
        requestTimeout: 2_000,
        fetchRetryCount: 0,
      })
    : null;

export const posthogAiSessionId = `draft-process-${crypto.randomUUID()}`;

export function captureAiGeneration(properties: {
  traceId: string;
  model: string;
  input: unknown;
  outputChoices: unknown[];
  inputTokens: number;
  outputTokens: number;
  latency: number;
}): void {
  try {
    posthog?.capture({
      distinctId: posthogAiSessionId,
      event: "$ai_generation",
      properties: {
        "$ai_trace_id": properties.traceId,
        "$ai_session_id": posthogAiSessionId,
        "$ai_model": properties.model,
        "$ai_provider": "openrouter",
        "$ai_input": properties.input,
        "$ai_output_choices": properties.outputChoices,
        "$ai_input_tokens": properties.inputTokens,
        "$ai_output_tokens": properties.outputTokens,
        "$ai_latency": properties.latency,
      },
    });
  } catch {
    // Analytics must not affect draft generation.
  }
}

export async function flushPostHogAi(): Promise<void> {
  await posthog?.flush().catch(() => undefined);
}

export async function register() {}
