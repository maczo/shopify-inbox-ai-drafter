import { NextResponse } from "next/server";
import { flushPostHogAi } from "@/instrumentation";
import { generateDraft } from "@/lib/drafter";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { productId, message } = (body ?? {}) as {
    productId?: unknown;
    message?: unknown;
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

  try {
    const result = await generateDraft({
      productId: productId.trim(),
      message: message.trim(),
    });
    await flushPostHogAi();
    return NextResponse.json(result);
  } catch (error) {
    await flushPostHogAi();
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
