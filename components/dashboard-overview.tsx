"use client";

import { useCurrentUser } from "@/lib/client/session";

export function DashboardOverview() {
  const user = useCurrentUser();

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-500">Your account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-zinc-500">Email</dt>
            <dd className="break-all text-sm font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Role</dt>
            <dd className="text-sm font-medium">{user.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Member since</dt>
            <dd className="text-sm font-medium">
              {new Date(user.createdAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
