"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type Category = { id: string; name: string; description: string | null; productCount: number };
type Page = { items: Category[]; page: number; total: number; totalPages: number };

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";

export function AdminCategories() {
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (search) params.set("q", search);
    try {
      const response = await apiFetch(`/api/admin/categories?${params}`);
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setData(await response.json());
    } catch {
      setError("Could not load categories.");
    }
  }, [page, search]);

  useEffect(() => {
    // Fetch on mount and when the search or page changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function reset() {
    setEditing(null);
    setName("");
    setDescription("");
    setFieldErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await apiFetch(editing ? `/api/admin/categories/${editing.id}` : "/api/admin/categories", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) {
        const failure = await readFailure(response);
        setError(failure.message);
        setFieldErrors(failure.fields);
        return;
      }
      setNotice(editing ? "Category updated." : "Category added.");
      reset();
      await load();
    } catch {
      setError("Could not save the category.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    setNotice(null);
    const response = await apiFetch(`/api/admin/categories/${category.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError((await readFailure(response)).message);
      return;
    }
    setError(null);
    setNotice("Category deleted.");
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add category"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Name
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            {fieldErrors.name ? <span className="text-xs text-red-600">{fieldErrors.name}</span> : null}
          </label>
          <label className="text-sm font-medium">Description
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
            {fieldErrors.description ? <span className="text-xs text-red-600">{fieldErrors.description}</span> : null}
          </label>
        </div>
        <div className="flex gap-2">
          <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
            {saving ? "Saving…" : editing ? "Save changes" : "Add category"}
          </button>
          {editing ? (
            <button type="button" onClick={reset} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">Cancel</button>
          ) : null}
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }} className="flex gap-2">
        <input className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" placeholder="Search categories" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">Search</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>{["Name", "Description", "Products", ""].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={4}>Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={4}>No categories found.</td></tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-zinc-500">{c.description ?? "—"}</td>
                  <td className="px-4 py-2">{c.productCount}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button onClick={() => { setEditing(c); setName(c.name); setDescription(c.description ?? ""); setFieldErrors({}); }} className="mr-3 text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => remove(c)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>{data.total} categor{data.total === 1 ? "y" : "ies"}</span>
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
