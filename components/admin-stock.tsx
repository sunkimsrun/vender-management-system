"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type Movement = {
  id: string;
  productName: string;
  type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  quantityChange: number;
  previousQuantity: number | null;
  resultingQuantity: number | null;
  reason: string | null;
  reference: string | null;
  userEmail: string | null;
  createdAt: string;
};
type Page = { items: Movement[]; page: number; total: number; totalPages: number };
type Lookups = { products: { id: string; name: string; quantity: number }[]; users: { id: string; email: string }[] };

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";
const filterClass = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export function AdminStock() {
  const [lookups, setLookups] = useState<Lookups>({ products: [], users: [] });
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [productId, setProductId] = useState("");
  const [type, setType] = useState("STOCK_IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const [fProduct, setFProduct] = useState("");
  const [fType, setFType] = useState("");
  const [fUser, setFUser] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [page, setPage] = useState(1);

  const loadLookups = useCallback(async () => {
    try {
      const response = await apiFetch("/api/admin/stock/lookups");
      if (response.ok) setLookups(await response.json());
    } catch {
      // The movement list reports its own errors.
    }
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (fProduct) params.set("productId", fProduct);
    if (fType) params.set("type", fType);
    if (fUser) params.set("userId", fUser);
    if (fFrom) params.set("from", fFrom);
    if (fTo) params.set("to", fTo);
    try {
      const response = await apiFetch(`/api/admin/stock?${params}`);
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setData(await response.json());
    } catch {
      setError("Could not load stock movements.");
    }
  }, [page, fProduct, fType, fUser, fFrom, fTo]);

  useEffect(() => {
    // Fetch on mount and when the filters or page change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLookups();
  }, [loadLookups]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await apiFetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, type, quantity: quantity === "" ? undefined : Number(quantity), reason }),
      });
      if (!response.ok) {
        const failure = await readFailure(response);
        setError(failure.message);
        setFieldErrors(failure.fields);
        return;
      }
      const { movement } = await response.json();
      setNotice(`Recorded. Stock is now ${movement.resultingQuantity}.`);
      setQuantity("");
      setReason("");
      await Promise.all([load(), loadLookups()]);
    } catch {
      setError("Could not record the movement.");
    } finally {
      setSaving(false);
    }
  }

  const current = lookups.products.find((p) => p.id === productId);
  const err = (key: string) => (fieldErrors[key] ? <span className="text-xs text-red-600">{fieldErrors[key]}</span> : null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stock management</h1>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Record movement</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Product
            <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Choose a product</option>
              {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.quantity} in stock)</option>)}
            </select>
            {err("productId")}
          </label>
          <label className="text-sm font-medium">Type
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="STOCK_IN">Stock in (add)</option>
              <option value="STOCK_OUT">Stock out (remove)</option>
              <option value="ADJUSTMENT">Adjustment (set counted quantity)</option>
            </select>
            {err("type")}
          </label>
          <label className="text-sm font-medium">
            {type === "ADJUSTMENT" ? "New counted quantity" : "Quantity"}
            <input className={inputClass} type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            {current ? <span className="text-xs text-zinc-500">Current stock: {current.quantity}</span> : null}
            {err("quantity")}
          </label>
          <label className="text-sm font-medium">Reason / reference{type === "ADJUSTMENT" ? " (required)" : ""}
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
            {err("reason")}
          </label>
        </div>
        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
          {saving ? "Recording…" : "Record movement"}
        </button>
        <p className="text-xs text-zinc-500">Movements cannot be edited or deleted. Correct a mistake with an adjustment.</p>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select className={filterClass} value={fProduct} onChange={(e) => { setPage(1); setFProduct(e.target.value); }}>
          <option value="">All products</option>
          {lookups.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={filterClass} value={fType} onChange={(e) => { setPage(1); setFType(e.target.value); }}>
          <option value="">All types</option>
          <option value="STOCK_IN">Stock in</option>
          <option value="STOCK_OUT">Stock out</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
        <select className={filterClass} value={fUser} onChange={(e) => { setPage(1); setFUser(e.target.value); }}>
          <option value="">All users</option>
          {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm">From <input type="date" className={filterClass} value={fFrom} max={fTo || undefined} onChange={(e) => { setPage(1); setFFrom(e.target.value); }} /></label>
        <label className="flex items-center gap-1 text-sm">To <input type="date" className={filterClass} value={fTo} min={fFrom || undefined} onChange={(e) => { setPage(1); setFTo(e.target.value); }} /></label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>{["Date", "Product", "Type", "Change", "Before → After", "Reason", "User"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={7}>Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={7}>No movements found.</td></tr>
            ) : (
              data.items.map((m) => (
                <tr key={m.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="whitespace-nowrap px-4 py-2">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 font-medium">{m.productName}</td>
                  <td className="px-4 py-2">{m.type.replace("_", " ")}</td>
                  <td className={`px-4 py-2 font-medium ${m.quantityChange >= 0 ? "text-indigo-600" : "text-rose-500"}`}>
                    {m.quantityChange > 0 ? "+" : ""}{m.quantityChange}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{m.previousQuantity ?? "—"} → {m.resultingQuantity ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-500">{m.reason ?? "—"}{m.reference ? <span className="block text-xs">{m.reference}</span> : null}</td>
                  <td className="px-4 py-2 text-zinc-500">{m.userEmail ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>{data.total} movement{data.total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="rounded-lg border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700">Previous</button>
            <span>Page {data.page} of {data.totalPages}</span>
            <button disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)} className="rounded-lg border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700">Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
