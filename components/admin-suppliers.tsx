"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type Supplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  productCount: number;
};
type Page = { items: Supplier[]; page: number; total: number; totalPages: number };

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";
const empty = { name: "", contactPerson: "", email: "", phone: "", address: "", isActive: true };

export function AdminSuppliers() {
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    try {
      const response = await apiFetch(`/api/admin/suppliers?${params}`);
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setData(await response.json());
    } catch {
      setError("Could not load suppliers.");
    }
  }, [page, search, status]);

  useEffect(() => {
    // Fetch on mount and when the filters or page change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function reset() {
    setEditing(null);
    setForm(empty);
    setFieldErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await apiFetch(editing ? `/api/admin/suppliers/${editing.id}` : "/api/admin/suppliers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const failure = await readFailure(response);
        setError(failure.message);
        setFieldErrors(failure.fields);
        return;
      }
      setNotice(editing ? "Supplier updated." : "Supplier added.");
      reset();
      await load();
    } catch {
      setError("Could not save the supplier.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(supplier: Supplier) {
    if (!window.confirm(`Remove "${supplier.name}"? Suppliers used by products are deactivated instead.`)) return;
    setNotice(null);
    const response = await apiFetch(`/api/admin/suppliers/${supplier.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError((await readFailure(response)).message);
      return;
    }
    setError(null);
    setNotice((await response.json()).result === "deactivated" ? "Supplier deactivated (products still use it)." : "Supplier deleted.");
    await load();
  }

  const field = (key: "name" | "contactPerson" | "email" | "phone" | "address", label: string, type = "text") => (
    <label className="text-sm font-medium">{label}
      <input className={inputClass} type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      {fieldErrors[key] ? <span className="text-xs text-red-600">{fieldErrors[key]}</span> : null}
    </label>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add supplier"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("name", "Name")}
          {field("contactPerson", "Contact person")}
          {field("email", "Email", "email")}
          {field("phone", "Phone", "tel")}
        </div>
        {field("address", "Address")}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Active
        </label>
        <div className="flex gap-2">
          <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
            {saving ? "Saving…" : editing ? "Save changes" : "Add supplier"}
          </button>
          {editing ? <button type="button" onClick={reset} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">Cancel</button> : null}
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }} className="flex flex-wrap gap-2">
        <input className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" placeholder="Search name, contact or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">Search</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>{["Name", "Contact", "Email", "Phone", "Products", "Status", ""].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={7}>Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td className="px-4 py-3 text-zinc-500" colSpan={7}>No suppliers found.</td></tr>
            ) : (
              data.items.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2">{s.contactPerson ?? "—"}</td>
                  <td className="px-4 py-2">{s.email ?? "—"}</td>
                  <td className="px-4 py-2">{s.phone ?? "—"}</td>
                  <td className="px-4 py-2">{s.productCount}</td>
                  <td className="px-4 py-2">{s.isActive ? "Active" : "Inactive"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setEditing(s);
                        setFieldErrors({});
                        setForm({ name: s.name, contactPerson: s.contactPerson ?? "", email: s.email ?? "", phone: s.phone ?? "", address: s.address ?? "", isActive: s.isActive });
                      }}
                      className="mr-3 text-indigo-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(s)} className="text-red-600 hover:underline">Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>{data.total} supplier{data.total === 1 ? "" : "s"}</span>
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
