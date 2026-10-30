"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string;
  price: number;
  costPrice: number | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  reorderThreshold: number;
  isActive: boolean;
  imageUrl: string | null;
};
type Lookup = { id: string; name: string };
type Page = { products: Product[]; page: number; total: number; totalPages: number };

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";
const card = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

const emptyForm = {
  name: "", sku: "", description: "", price: "", costPrice: "", categoryId: "", supplierId: "",
  reorderThreshold: "5", initialQuantity: "0", isActive: true,
};

function stockBadge(p: Product) {
  if (p.quantity <= 0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Out</span>;
  if (p.quantity <= p.reorderThreshold) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Low</span>;
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">In stock</span>;
}

export function AdminProducts() {
  const [data, setData] = useState<Page | null>(null);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [stock, setStock] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10", sort, order });
    if (search) params.set("q", search);
    if (categoryId) params.set("categoryId", categoryId);
    if (supplierId) params.set("supplierId", supplierId);
    if (stock) params.set("stock", stock);
    try {
      const response = await apiFetch(`/api/admin/products?${params}`);
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setData(await response.json());
    } catch {
      setError("Could not load products.");
    }
  }, [page, search, categoryId, supplierId, stock, sort, order]);

  useEffect(() => {
    // Fetch on mount and whenever the filters, sorting or page change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiFetch("/api/admin/lookups");
        if (!response.ok) return;
        const lookups = await response.json();
        setCategories(lookups.categories);
        setSuppliers(lookups.suppliers);
      } catch {
        // Filters simply stay empty; the list itself reports its own errors.
      }
    })();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setImage(null);
    setRemoveImage(false);
    setFileKey((k) => k + 1);
    setFieldErrors({});
    setEditing(null);
    setShowForm(false);
  }

  function startEdit(product: Product) {
    setEditing(product);
    setShowForm(true);
    setNotice(null);
    setError(null);
    setFieldErrors({});
    setImage(null);
    setRemoveImage(false);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      description: product.description,
      price: String(product.price),
      costPrice: product.costPrice === null ? "" : String(product.costPrice),
      categoryId: product.categoryId ?? "",
      supplierId: product.supplierId ?? "",
      reorderThreshold: String(product.reorderThreshold),
      initialQuantity: "0",
      isActive: product.isActive,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const body = new FormData();
      for (const key of ["name", "sku", "description", "price", "costPrice", "categoryId", "supplierId", "reorderThreshold"] as const) {
        body.set(key, form[key]);
      }
      body.set("isActive", String(form.isActive));
      if (!editing) body.set("initialQuantity", form.initialQuantity);
      if (image) body.set("image", image);
      if (removeImage) body.set("removeImage", "true");
      const response = await apiFetch(editing ? `/api/admin/products/${editing.id}` : "/api/admin/products", {
        method: editing ? "PATCH" : "POST",
        body,
      });
      if (!response.ok) {
        const failure = await readFailure(response);
        setError(failure.message);
        setFieldErrors(failure.fields);
        return;
      }
      setNotice(editing ? "Product updated." : "Product added.");
      resetForm();
      await load();
    } catch {
      setError("Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Remove "${product.name}"? Products with stock history are deactivated instead of deleted.`)) return;
    setNotice(null);
    const response = await apiFetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError((await readFailure(response)).message);
      return;
    }
    setError(null);
    setNotice((await response.json()).result === "deactivated" ? "Product deactivated (it has stock history)." : "Product deleted.");
    await load();
  }

  const set = (key: keyof typeof emptyForm) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const err = (key: string) => (fieldErrors[key] ? <span className="text-xs text-red-600">{fieldErrors[key]}</span> : null);
  const filterClass = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        {!showForm ? (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Add product
          </button>
        ) : null}
      </div>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}

      {showForm ? (
        <form onSubmit={submit} className={`${card} space-y-3`}>
          <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add new product"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Name
              <input className={inputClass} value={form.name} onChange={(e) => set("name")(e.target.value)} />
              {err("name")}
            </label>
            <label className="text-sm font-medium">SKU
              <input className={inputClass} value={form.sku} onChange={(e) => set("sku")(e.target.value)} />
              {err("sku")}
            </label>
            <label className="text-sm font-medium">Selling price
              <input className={inputClass} type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price")(e.target.value)} />
              {err("price")}
            </label>
            <label className="text-sm font-medium">Cost price
              <input className={inputClass} type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set("costPrice")(e.target.value)} />
              {err("costPrice")}
            </label>
            <label className="text-sm font-medium">Category
              <select className={inputClass} value={form.categoryId} onChange={(e) => set("categoryId")(e.target.value)}>
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {err("categoryId")}
            </label>
            <label className="text-sm font-medium">Supplier
              <select className={inputClass} value={form.supplierId} onChange={(e) => set("supplierId")(e.target.value)}>
                <option value="">None</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {err("supplierId")}
            </label>
            <label className="text-sm font-medium">Reorder threshold
              <input className={inputClass} type="number" min="0" step="1" value={form.reorderThreshold} onChange={(e) => set("reorderThreshold")(e.target.value)} />
              {err("reorderThreshold")}
            </label>
            {editing ? (
              <div className="text-sm font-medium">Current stock
                <p className="mt-1 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-600 dark:bg-zinc-800">
                  {editing.quantity} <span className="text-xs">(changed through stock movements only)</span>
                </p>
              </div>
            ) : (
              <label className="text-sm font-medium">Initial stock
                <input className={inputClass} type="number" min="0" step="1" value={form.initialQuantity} onChange={(e) => set("initialQuantity")(e.target.value)} />
                {err("initialQuantity")}
              </label>
            )}
          </div>
          <label className="block text-sm font-medium">Description
            <textarea className={inputClass} rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)} />
            {err("description")}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive")(e.target.checked)} />
            Active (visible on the home page)
          </label>
          <label className="block text-sm font-medium">Image (PNG, JPEG or WebP, max 2 MB)
            <input key={fileKey} type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          </label>
          {editing?.imageUrl ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} />
              Remove current image
            </label>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
              {saving ? "Saving…" : editing ? "Save changes" : "Add product"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}
        className="flex flex-wrap items-center gap-2"
      >
        <input className={`${filterClass} w-56`} placeholder="Search name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={filterClass} value={categoryId} onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={filterClass} value={supplierId} onChange={(e) => { setPage(1); setSupplierId(e.target.value); }}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={filterClass} value={stock} onChange={(e) => { setPage(1); setStock(e.target.value); }}>
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className={filterClass} value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
          <option value="created_at">Sort: Newest</option>
          <option value="name">Sort: Name</option>
          <option value="price">Sort: Price</option>
          <option value="quantity">Sort: Quantity</option>
        </select>
        <select className={filterClass} value={order} onChange={(e) => { setPage(1); setOrder(e.target.value); }}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
        <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">Search</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              {["Image", "Name", "SKU", "Category", "Supplier", "Price", "Stock", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={9}>Loading…</td></tr>
            ) : data.products.length === 0 ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={9}>No products found.</td></tr>
            ) : (
              data.products.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} className="h-10 w-10 rounded object-cover" />
                    ) : null}
                  </td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-zinc-500">{p.sku ?? "—"}</td>
                  <td className="px-4 py-2">{p.categoryName ?? "—"}</td>
                  <td className="px-4 py-2">{p.supplierName ?? "—"}</td>
                  <td className="px-4 py-2">${p.price.toFixed(2)}</td>
                  <td className="px-4 py-2">{p.quantity} {stockBadge(p)}</td>
                  <td className="px-4 py-2">{p.isActive ? "Active" : "Inactive"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button onClick={() => startEdit(p)} className="mr-3 text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => remove(p)} className="text-red-600 hover:underline">Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>{data.total} product{data.total === 1 ? "" : "s"}</span>
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
