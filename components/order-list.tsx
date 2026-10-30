"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type Order = {
  id: string;
  total: number;
  createdAt: string;
  items: { productName: string; unitPrice: number; quantity: number }[];
};

export function OrderList() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiFetch("/api/orders");
        if (!response.ok) {
          setError((await readFailure(response)).message);
          return;
        }
        setOrders((await response.json()).orders);
      } catch {
        setError("Could not load your orders.");
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {orders === null && !error ? <p className="text-sm text-zinc-500">Loading…</p> : null}
      {orders && orders.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No orders yet. <Link href="/" className="underline">Browse products</Link>
        </p>
      ) : null}
      {orders?.map((order) => (
        <section key={order.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-zinc-500">{new Date(order.createdAt).toLocaleString()}</span>
            <span className="font-semibold">${order.total.toFixed(2)}</span>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between py-1.5">
                <span>{item.productName} × {item.quantity}</span>
                <span className="text-zinc-500">${(item.unitPrice * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
