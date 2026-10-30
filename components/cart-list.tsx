"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type CartItem = { productId: string; name: string; price: number; imageUrl: string | null; quantity: number };

export function CartList() {
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  async function buy() {
    setBuying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/orders", { method: "POST" });
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setNotice("Order placed. Thank you!");
      setItems([]);
    } catch {
      setError("Could not place the order.");
    } finally {
      setBuying(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/cart");
      if (!response.ok) {
        setError("Could not load your cart.");
        return;
      }
      setError(null);
      setItems((await response.json()).items);
    } catch {
      setError("Could not load your cart.");
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount; state is set after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function change(item: CartItem, method: "PATCH" | "DELETE", quantity?: number) {
    const response = await apiFetch(`/api/cart/${item.productId}`, {
      method,
      headers: quantity === undefined ? undefined : { "Content-Type": "application/json" },
      body: quantity === undefined ? undefined : JSON.stringify({ quantity }),
    });
    if (!response.ok) {
      setError((await readFailure(response)).message);
      return;
    }
    setError(null);
    setItems((await response.json()).items);
  }

  const total = (items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My cart</h1>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? (
        <Alert kind="success">
          {notice} <Link href="/dashboard/orders" className="underline">View my orders</Link>
        </Alert>
      ) : null}

      {items === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Your cart is empty. <Link href="/" className="underline">Browse products</Link>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {items.map((item) => (
              <li key={item.productId} className="flex flex-wrap items-center gap-4 p-4">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-zinc-500">${item.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    aria-label={`Decrease quantity of ${item.name}`}
                    disabled={item.quantity <= 1}
                    onClick={() => change(item, "PATCH", item.quantity - 1)}
                    className="h-8 w-8 rounded-lg border border-zinc-300 disabled:opacity-40 dark:border-zinc-700"
                  >
                    −
                  </button>
                  <span className="w-6 text-center">{item.quantity}</span>
                  <button
                    aria-label={`Increase quantity of ${item.name}`}
                    disabled={item.quantity >= 99}
                    onClick={() => change(item, "PATCH", item.quantity + 1)}
                    className="h-8 w-8 rounded-lg border border-zinc-300 disabled:opacity-40 dark:border-zinc-700"
                  >
                    +
                  </button>
                </div>
                <p className="w-24 text-right font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                <button onClick={() => change(item, "DELETE")} className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-4"><p className="text-lg font-semibold">Total: ${total.toFixed(2)}</p><button onClick={buy} disabled={buying} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{buying ? "Placing order..." : "Checkout"}</button></div>
        </>
      )}
    </div>
  );
}
