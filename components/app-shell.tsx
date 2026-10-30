"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin-sidebar";
import { Alert } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/client/session";
import type { Role } from "@/lib/client/api";

export function AppShell({ title, loginPath, requiredRole, requiredRoles, links, sidebarLinks, children }: {
  title: string;
  loginPath: string;
  requiredRole?: Role;
  requiredRoles?: Role[];
  links: { href: string; label: string }[];
  sidebarLinks?: { href: string; label: string }[];
  children: ReactNode;
}) {
  const { state, retry, signOut } = useSession(loginPath);

  if (state.status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Loading…
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <Alert kind="error">Could not load your session.</Alert>
        <button onClick={retry} className="text-sm underline">
          Try again
        </button>
      </main>
    );
  }

  const { user } = state;

  // Convenience only: every admin API call is authorized again on the server.
  if ((requiredRole && user.role !== requiredRole) || (requiredRoles && !requiredRoles.includes(user.role))) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your account does not have permission to view this area.
        </p>
        <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} className="text-sm underline">
          Go to your dashboard
        </Link>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 px-2.5 py-1 text-sm font-semibold text-white shadow-sm">{title}</span>
            <nav className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-500 sm:inline">{user.email}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <div className={sidebarLinks ? "mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row" : "flex flex-1 flex-col"}>
        {sidebarLinks ? <AdminSidebar links={sidebarLinks} /> : null}
        <main className="w-full flex-1 px-4 py-8 md:px-8">
          <SessionProvider value={user}>{children}</SessionProvider>
        </main>
      </div>
    </div>
  );
}
