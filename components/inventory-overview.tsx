"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type Overview = {
  totals: {
    products: number;
    categories: number;
    suppliers: number;
    quantity: number;
    lowStock: number;
    outOfStock: number;
    inventoryValue: number | null;
  };
  recentMovements: { id: string; productName: string; quantityChange: number; reason: string | null; userEmail: string | null; createdAt: string }[];
  byCategory: { name: string; products: number }[];
  attention: { id: string; name: string; quantity: number; reorderThreshold: number }[];
  byType: { type: string; movements: number; units: number }[];
  topMoved: { id: string; name: string; movements: number; units: number }[];
  recentProducts: { id: string; name: string; updatedAt: string }[];
  daily: { date: string; stockIn: number; stockOut: number }[];
};

const dateInput =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" }) {
  const color =
    tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-indigo-600 dark:text-indigo-400";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Panel({ title, empty, rows }: { title: string; empty: string; rows: { key: string; left: string; right: string }[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 py-2">
              <span>{r.left}</span>
              <span className="text-zinc-500">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InventoryOverview() {
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 29 * 86_400_000)));
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await apiFetch(`/api/admin/overview?from=${from}&to=${to}`);
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setData(await response.json());
    } catch {
      setError("Could not load the overview.");
    }
  }, [from, to]);

  useEffect(() => {
    // Fetch on mount and when the date range changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const peak = Math.max(1, ...(data?.daily.flatMap((d) => [d.stockIn, d.stockOut]) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory overview</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Stock levels and recent activity.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            From <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={dateInput} />
          </label>
          <label className="flex items-center gap-1">
            To <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={dateInput} />
          </label>
        </div>
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Products" value={String(data.totals.products)} />
            <Stat label="Categories" value={String(data.totals.categories)} />
            <Stat label="Suppliers" value={String(data.totals.suppliers)} />
            <Stat label="Total quantity" value={data.totals.quantity.toLocaleString()} />
            <Stat label="Low stock" value={String(data.totals.lowStock)} tone="warn" />
            <Stat label="Out of stock" value={String(data.totals.outOfStock)} tone="danger" />
            <Stat
              label="Inventory value"
              value={data.totals.inventoryValue === null ? "N/A" : `$${data.totals.inventoryValue.toFixed(2)}`}
            />
          </div>
          <p className="-mt-3 text-xs text-zinc-500">Inventory value = quantity on hand x cost price; products without a cost price are not counted.</p>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Products by category" empty="No products yet." rows={data.byCategory.map((c) => ({ key: c.name, left: c.name, right: String(c.products) }))} />
            <Panel
              title="Low stock and out of stock"
              empty="Everything is well stocked."
              rows={data.attention.map((p) => ({
                key: p.id,
                left: p.name,
                right: p.quantity <= 0 ? "Out of stock" : `${p.quantity} left (reorder at ${p.reorderThreshold})`,
              }))}
            />
            <Panel
              title="Movements by type"
              empty="No stock movements in this period."
              rows={data.byType.map((t) => ({ key: t.type, left: t.type.replace("_", " "), right: `${t.movements} movements, ${t.units} units` }))}
            />
            <Panel
              title="Most moved products"
              empty="No stock movements in this period."
              rows={data.topMoved.map((p) => ({ key: p.id, left: p.name, right: `${p.movements} movements, ${p.units} units` }))}
            />
          </div>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold">Stock in / out per day</h2>
            {data.daily.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No stock movements in this period.</p>
            ) : (
              <div className="mt-4 flex h-40 items-end gap-1 overflow-x-auto" role="img" aria-label="Daily stock in and out chart">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex h-full min-w-6 flex-1 flex-col justify-end" title={`${d.date}: +${d.stockIn} / -${d.stockOut}`}>
                    <div className="flex flex-1 items-end gap-0.5">
                      <div className="w-1/2 rounded-t bg-indigo-500" style={{ height: `${(d.stockIn / peak) * 100}%` }} />
                      <div className="w-1/2 rounded-t bg-rose-400" style={{ height: `${(d.stockOut / peak) * 100}%` }} />
                    </div>
                    <span className="mt-1 truncate text-center text-[10px] text-zinc-500">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              <span className="text-indigo-500">■</span> In <span className="ml-2 text-rose-400">■</span> Out
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold">Recent stock movements</h2>
              {data.recentMovements.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Nothing yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {data.recentMovements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2">
                      <span>
                        {m.productName}
                        {m.reason ? <span className="text-zinc-500"> · {m.reason}</span> : null}
                        {m.userEmail ? <span className="block text-xs text-zinc-500">by {m.userEmail}</span> : null}
                      </span>
                      <span className={m.quantityChange >= 0 ? "font-medium text-indigo-600" : "font-medium text-rose-500"}>
                        {m.quantityChange > 0 ? "+" : ""}
                        {m.quantityChange}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold">Recent product updates</h2>
              {data.recentProducts.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No products yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {data.recentProducts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2">
                      <span>{p.name}</span>
                      <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
