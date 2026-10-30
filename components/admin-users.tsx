"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure } from "@/lib/client/api";

type ManagedUser = { id: string; email: string; role: string; createdAt: string };
type Editing = { mode: "create" } | { mode: "edit"; user: ManagedUser };

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950";

async function send(path: string, method: string, body?: unknown) {
  const response = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.ok) return { ok: true as const, data: await response.json() };
  return { ok: false as const, failure: await readFailure(response) };
}

export function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/admin/users");
      if (!response.ok) {
        setError(response.status === 403 ? "You do not have access to this data." : "Could not load users.");
        return;
      }
      setError(null);
      setUsers((await response.json()).users);
    } catch {
      setError("Could not load users.");
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount; the setState calls happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function remove(user: ManagedUser) {
    if (!window.confirm(`Delete ${user.email}? This also signs them out and cannot be undone.`)) return;
    setNotice(null);
    const result = await send(`/api/admin/users/${user.id}`, "DELETE");
    if (!result.ok) {
      setError(result.failure.message);
      return;
    }
    setError(null);
    setNotice("User deleted.");
    await load();
  }

  const managed = users?.filter((u) => u.role === "USER" || u.role === "STAFF") ?? [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Manage users</h1>
        <button
          onClick={() => {
            setNotice(null);
            setEditing({ mode: "create" });
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:text-white"
        >
          Add user
        </button>
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}

      {editing ? (
        <UserForm
          key={editing.mode === "edit" ? editing.user.id : "create"}
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setNotice(message);
            await load();
          }}
        />
      ) : null}

      {!error && !users ? <p className="text-sm text-zinc-500">Loading users…</p> : null}
      {users && managed.length === 0 ? <p className="text-sm text-zinc-500">No users yet. Add the first one.</p> : null}
      {managed.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {managed.map((user) => (
                <tr key={user.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="break-all px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="whitespace-nowrap px-4 py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setNotice(null);
                        setEditing({ mode: "edit", user });
                      }}
                      className="mr-3 underline"
                    >
                      Edit
                    </button>
                    <button onClick={() => remove(user)} className="text-red-600 underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function UserForm({ editing, onCancel, onSaved }: {
  editing: Editing;
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const isEdit = editing.mode === "edit";
  const [email, setEmail] = useState(isEdit ? editing.user.email : "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(isEdit ? editing.user.role : "USER");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setErrors({});
    setFormError(null);

    const body: Record<string, string> = {};
    if (!isEdit || email.trim().toLowerCase() !== editing.user.email) body.email = email;
    if (password) body.password = password;
    if (isEdit && role !== editing.user.role) body.role = role;
    if (isEdit && Object.keys(body).length === 0) {
      setFormError("Change the email, role or enter a new password.");
      return;
    }

    setSaving(true);
    const result = isEdit
      ? await send(`/api/admin/users/${editing.user.id}`, "PATCH", body)
      : await send("/api/admin/users", "POST", { email, password, role });
    setSaving(false);

    if (!result.ok) {
      setErrors(result.failure.fields);
      setFormError(result.failure.message);
      return;
    }
    await onSaved(isEdit ? "User updated." : "User created.");
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="font-medium">{isEdit ? "Edit user" : "Add user"}</h2>
      {formError ? <Alert kind="error">{formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="user-email" className="block text-sm font-medium">Email</label>
          <input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email}</p> : null}
        </div>
        <div>
          <label htmlFor="user-password" className="block text-sm font-medium">
            {isEdit ? "New password (optional)" : "Password"}
          </label>
          <input
            id="user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {errors.password ? <p className="mt-1 text-xs text-red-600">{errors.password}</p> : <p className="mt-1 text-xs text-zinc-500">At least 9 characters.</p>}
        </div>
        <div>
          <label htmlFor="user-role" className="block text-sm font-medium">Role</label>
          <select id="user-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            <option value="USER">USER (customer)</option>
            <option value="STAFF">STAFF (operational)</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-indigo-500 dark:text-white"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
          Cancel
        </button>
      </div>
    </form>
  );
}
