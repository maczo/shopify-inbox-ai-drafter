import { NextResponse } from "next/server";
import { matchProduct } from "@/lib/match";

export const runtime = "nodejs";

/**
 * Deterministic product detection. No model call, no cost, no latency.
 * Returns null when it is not confident — the merchant picks instead.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ match: null });
  }

  const { message } = (body ?? {}) as { message?: unknown };
  if (typeof message !== "string" || message.trim().length < 3) {
    return NextResponse.json({ match: null });
  }

  const match = matchProduct(message);
  return NextResponse.json({ match });
}
