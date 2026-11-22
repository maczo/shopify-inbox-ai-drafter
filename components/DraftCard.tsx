"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { stripDocAnnotations } from "@/lib/annotations";
import type { DraftResponse } from "@/lib/types";

const analyticsEnabled = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
    process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function DraftCard({
  result,
  loading,
  error,
  elapsed,
  onRegenerate,
  onChangeDraft,
  draftText,
}: {
  result: DraftResponse | null;
  loading: boolean;
  error: string | null;
  elapsed: number;
  onRegenerate: () => void;
  draftText: string;
  onChangeDraft: (value: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draftText);
      if (analyticsEnabled && result) {
        posthog.capture("draft_copied", {
          product_id: result.productId,
          verdict: result.verdict,
        });
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-stone-400" />
          Reading the product page…
          <span className="ml-auto font-mono text-xs text-stone-400">
            {Math.floor(elapsed / 1000)}s
          </span>
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="h-3 w-11/12 animate-pulse rounded bg-stone-100" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-stone-100" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-stone-100" />
          <div className="h-3 w-6/12 animate-pulse rounded bg-stone-100" />
        </div>
        {elapsed > 8000 && (
          <p className="mt-5 text-xs text-stone-400">
            Free models can take a little longer when they are busy. Still working.
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-medium text-red-800">Draft failed</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={onRegenerate}
          className="mt-4 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-900"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8">
        <div className="mx-auto max-w-sm text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-stone-100 text-stone-400">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4v-4Z" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-stone-700">
            Your draft will appear here
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            Pick the product the shopper is asking about, paste their message, and
            the drafter will answer only from that product page.
          </p>
        </div>
      </div>
    );
  }

  const flagged = result.verdict === "flagged";
  const verified = result.evidence.filter((e) => e.ok);
  const unverified = result.evidence.filter((e) => !e.ok);

  return (
    <div className="animate-fade-up space-y-4">
      <div
        className={`rounded-2xl border p-5 ${
          flagged ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${
              flagged ? "bg-amber-500" : "bg-emerald-600"
            }`}
          >
            {flagged ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M12 8v5" strokeLinecap="round" />
                <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                <path d="m5 12.5 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div className="min-w-0">
            <p
              className={`text-sm font-semibold ${
                flagged ? "text-amber-900" : "text-emerald-900"
              }`}
            >
              {flagged
                ? "Outside the product page — needs your input"
                : "Answered from the product page"}
            </p>
            <p
              className={`mt-0.5 text-xs ${
                flagged ? "text-amber-800/80" : "text-emerald-800/80"
              }`}
            >
              {flagged
                ? "The page doesn’t cover part of this. A holding reply is drafted below; nothing was invented."
                : "Every claim below is backed by a quote from the page."}
            </p>
          </div>
          {result.downgraded && (
            <span className="ml-auto shrink-0 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800">
              safety check
            </span>
          )}
        </div>

        {result.merchantNote && (
          <p
            className={`mt-4 border-t pt-3 text-sm leading-relaxed ${
              flagged
                ? "border-amber-200 text-amber-900"
                : "border-emerald-200 text-emerald-900"
            }`}
          >
            <span className="font-medium">Note for you: </span>
            {result.merchantNote}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-stone-900">
              {flagged ? "Holding reply" : "Draft reply"}
            </p>
            <p className="text-xs text-stone-500">
              {result.productTitle} · {result.productId}
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-2 py-1 font-mono text-[11px] text-stone-500">
            {wordCount(draftText)} words
          </span>
        </div>

        <textarea
          value={draftText}
          onChange={(e) => onChangeDraft(e.target.value)}
          rows={Math.min(10, Math.max(4, Math.ceil(draftText.length / 70)))}
          className="block w-full resize-y bg-transparent px-5 py-4 text-[15px] leading-relaxed text-stone-800 outline-none placeholder:text-stone-400"
          aria-label="Draft reply, editable"
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-4 py-3">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800"
          >
            {copied ? "Copied" : "Copy reply"}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Regenerate
          </button>
          <span className="ml-auto font-mono text-[11px] text-stone-400">
            {result.model.split("/").pop()} · {(result.ms / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {result.evidence.length > 0 && (
        <details className="group rounded-2xl border border-stone-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-stone-700">
            <svg
              className="h-3.5 w-3.5 text-stone-400 transition group-open:rotate-90"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path d="M7 5l6 5-6 5V5z" />
            </svg>
            Grounded in {verified.length} quote{verified.length === 1 ? "" : "s"}
            {unverified.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                {unverified.length} unverified
              </span>
            )}
          </summary>
          <ul className="space-y-2 border-t border-stone-100 px-5 py-4">
            {result.evidence.map((item, index) => (
              <li
                key={`${item.field}-${index}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  item.ok
                    ? "border-stone-200 bg-stone-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      item.ok ? "text-stone-500" : "text-amber-700"
                    }`}
                  >
                    {item.field || "Document"}
                  </span>
                  <span
                    className={`ml-auto text-[11px] ${
                      item.ok ? "text-emerald-600" : "text-amber-700"
                    }`}
                  >
                    {item.ok ? "verified in page" : "not found in page"}
                  </span>
                </div>
                <p className="font-mono text-[12.5px] leading-relaxed text-stone-700">
                  “{stripDocAnnotations(item.quote)}”
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
