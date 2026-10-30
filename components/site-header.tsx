"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, logout, type CurrentUser } from "@/lib/client/api";

const linkClass =
  "rounded-lg px-3 py-1.5 font-medium transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-400";

export function SiteHeader() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiFetch("/api/me");
        if (response.ok) setUser((await response.json()).user);
      } catch {
        // Visitors without a session simply see the public links.
      }
    })();
  }, []);

  async function signOut() {
    await logout();
    setUser(null);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
            V
          </span>
          <span className="hidden sm:inline">Vender Management System</span>
        </Link>
        <nav className="flex flex-row items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/" className={linkClass}>Home</Link>
          <Link href="/contact" className={linkClass}>Contact</Link>
          {user ? (
            <>
              <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} className={linkClass}>
                Dashboard
              </Link>
              <button onClick={signOut} className={linkClass}>Log out</button>
            </>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-lg bg-indigo-600 px-4 py-1.5 font-medium text-white shadow-sm transition hover:bg-indigo-500"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
