"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickerProduct = {
  id: string;
  title: string;
  type: string;
  vendor: string;
  price: string;
  size: string;
  handle: string;
};

type Props = {
  products: PickerProduct[];
  value: string;
  onChange: (id: string) => void;
  detected: { productId: string; confidence: number; reason: string } | null;
};

export function ProductPicker({ products, value, onChange, detected }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      `${p.title} ${p.type} ${p.id} ${p.vendor}`.toLowerCase().includes(q),
    );
  }, [products, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-left transition hover:border-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20"
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-stone-900">
              {selected.title}
            </span>
            <span className="block truncate text-xs text-stone-500">
              {selected.id} · {selected.type} · {selected.size} · ${selected.price}
            </span>
          </span>
        ) : (
          <span className="text-sm text-stone-400">Choose a product…</span>
        )}
        <svg
          className={`h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {detected && detected.productId === value && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Auto-detected · {detected.confidence}% · {detected.reason}
        </p>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5">
            <div className="border-b border-stone-100 p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search 40 products…"
                className="w-full rounded-lg bg-stone-50 px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-900/10"
              />
            </div>
            <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-stone-400">
                  No product matches “{query}”.
                </li>
              )}
              {filtered.map((product) => {
                const active = product.id === value;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(product.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition ${
                        active ? "bg-stone-900 text-white" : "hover:bg-stone-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {product.title}
                        </span>
                        <span
                          className={`block truncate text-xs ${
                            active ? "text-stone-300" : "text-stone-500"
                          }`}
                        >
                          {product.type} · {product.size} · ${product.price}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-mono text-[11px] ${
                          active ? "text-stone-300" : "text-stone-400"
                        }`}
                      >
                        {product.id}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
