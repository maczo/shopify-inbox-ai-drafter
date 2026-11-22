import { NextResponse } from "next/server";
import { generateDraft } from "@/lib/drafter";
import { isDrafterEnabled } from "@/lib/flags";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { productId, message, storeId } = (body ?? {}) as {
    productId?: unknown;
    message?: unknown;
    storeId?: unknown;
  };

  if (typeof productId !== "string" || !productId.trim()) {
    return NextResponse.json({ error: "Pick a product first." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Paste the shopper's message first." },
      { status: 400 },
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: "That message is too long (2000 characters max)." },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------- the gate
  //
  // The tracking plan is explicit: the flag is checked on the server on every
  // draft request, and hiding the UI in the browser is not enough on its own.
  // No store, no flag, or a PostHog failure all mean OFF: no model call, and
  // no draft written.
  const store = typeof storeId === "string" ? storeId.trim() : "";
  const decision = await isDrafterEnabled(store);

  if (!decision.on) {
    return NextResponse.json(
      {
        error:
          "The AI reply drafter is not enabled for this store. No draft was generated.",
        flag: { key: "inbox-ai-reply-drafter", store: decision.store, on: false },
        reason: decision.reason,
      },
      { status: 503 },
    );
  }

  try {
    const result = await generateDraft({
      productId: productId.trim(),
      message: message.trim(),
    });
    return NextResponse.json(result);
  } catch (error) {
    const text =
      error instanceof Error ? error.message : "Something went wrong.";
    const isMissingKey = text.includes("OPENROUTER_API_KEY");
    const isUnknownProduct = text.startsWith("Unknown product");
    return NextResponse.json(
      { error: text },
      { status: isMissingKey || isUnknownProduct ? 400 : 502 },
    );
  }
}
