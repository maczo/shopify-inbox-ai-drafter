"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftResponse } from "@/lib/types";
import { DraftCard } from "./DraftCard";
import { ProductPicker, type PickerProduct } from "./ProductPicker";

const EXAMPLES = [
  {
    label: "Ingredient · answers",
    productId: "DSP-005",
    text: "does this have lanolin in it? I react to wool stuff and I'm not sure what lanolin is exactly, so just checking before I buy the tin",
  },
  {
    label: "Coconut · answers",
    productId: "DSP-004",
    text: "does this have coconut in it? i have a coconut allergy and i can't tell from the label",
  },
  {
    label: "Pregnancy · flags",
    productId: "DSP-014",
    text: "is it safe to use while pregnant? my doctor said to check every product with me first, and I can't find anything about this on the listing",
  },
  {
    label: "Shipping · flags",
    productId: "DSP-036",
    text: "Do you ship to Canada? And if so how long does shipping usually take? Trying to get a gift there by early December",
  },
];

export function Workspace({ products }: { products: PickerProduct[] }) {
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const [detected, setDetected] = useState<
    { productId: string; confidence: number; reason: string } | null
  >(null);

  const [result, setResult] = useState<DraftResponse | null>(null);
  const [draftText, setDraftText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const resultRef = useRef<HTMLDivElement>(null);

  // Auto-detect the product from the message, unless the merchant has chosen.
  useEffect(() => {
    if (manual) return;
    const text = message.trim();
    if (text.length < 3) {
      setDetected(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          match: { productId: string; confidence: number; reason: string } | null;
        };
        if (data.match) {
          setProductId(data.match.productId);
          setDetected(data.match);
        } else {
          setDetected(null);
        }
      } catch {
        /* aborted or offline — leave the picker to the merchant */
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [message, manual]);

  // A draft belongs to one message + product pair.
  useEffect(() => {
    setResult(null);
    setDraftText("");
    setError(null);
  }, [productId, message]);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(id);
  }, [loading]);

  const draft = useCallback(async () => {
    if (!productId || !message.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setDraftText("");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, message }),
      });
      const data = (await res.json()) as DraftResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Draft failed.");
      setResult(data);
      setDraftText(data.draft);
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed.");
    } finally {
      setLoading(false);
    }
  }, [productId, message, loading]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void draft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  function pickProduct(id: string) {
    setManual(true);
    setDetected(null);
    setProductId(id);
  }

  function loadExample(example: (typeof EXAMPLES)[number]) {
    setManual(true);
    setDetected(null);
    setProductId(example.productId);
    setMessage(example.text);
  }

  function clearAll() {
    setProductId("");
    setMessage("");
    setManual(false);
    setDetected(null);
    setResult(null);
    setDraftText("");
    setError(null);
  }

  const canDraft = Boolean(productId && message.trim()) && !loading;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900 text-[13px] font-semibold text-white">
              SI
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-stone-900">
                Shopify Inbox AI Drafter
              </h1>
              <p className="text-xs text-stone-500">
                Grounded in the product page. Nothing else.
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs sm:flex">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              $0 · free models
            </span>
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-500">
              {products.length} products
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl items-start gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] lg:py-8">
        <section className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-stone-900">
                <span className="mr-1.5 font-mono text-xs text-stone-400">1</span>
                Product
              </h2>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-stone-400 transition hover:text-stone-700"
              >
                Clear
              </button>
            </div>

            <ProductPicker
              products={products}
              value={productId}
              onChange={pickProduct}
              detected={detected}
            />

            <p className="mt-2.5 text-xs leading-relaxed text-stone-500">
              The drafter only ever sees this one product page.
              {!manual && !productId && (
                <span className="text-stone-400">
                  {" "}
                  Name a product in the message and it will be detected.
                </span>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-stone-900">
                <span className="mr-1.5 font-mono text-xs text-stone-400">2</span>
                Shopper message
              </h2>
              <span className="font-mono text-[11px] text-stone-400">
                {message.length}/2000
              </span>
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
              rows={5}
              placeholder="Paste the message exactly as the shopper sent it…"
              className="block w-full resize-y rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm leading-relaxed text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-900/10"
            />

            <div className="mt-3 flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => loadExample(example)}
                  className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-white"
                >
                  {example.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void draft()}
              disabled={!canDraft}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {loading ? "Drafting…" : "Draft reply"}
              {!loading && (
                <span className="font-mono text-[11px] text-stone-400">⌘↵</span>
              )}
            </button>

            {!productId && message.trim().length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                No product detected — pick one above.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-100/60 p-4">
            <p className="text-xs leading-relaxed text-stone-500">
              <span className="font-medium text-stone-700">How it decides.</span>{" "}
              A question is answered only when the page states the fact. Anything
              the page doesn’t cover is flagged to you, with a neutral holding
              reply. No discounts, no policies, no guesses.
            </p>
          </div>
        </section>

        <section ref={resultRef} className="min-w-0">
          <DraftCard
            result={result}
            loading={loading}
            error={error}
            elapsed={elapsed}
            draftText={draftText}
            onChangeDraft={setDraftText}
            onRegenerate={() => void draft()}
          />
        </section>
      </main>
    </div>
  );
}
