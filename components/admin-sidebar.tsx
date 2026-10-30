"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_SIDEBAR_LINKS = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin", label: "Manage users" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/stock", label: "Stock" },
];

export function AdminSidebar({ links = ADMIN_SIDEBAR_LINKS }: { links?: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <aside className="border-b border-zinc-200 bg-white md:w-56 md:shrink-0 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-900">
      <nav aria-label="Admin" className="flex flex-row gap-1 p-3 md:flex-col">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm ${
                active
                  ? "bg-indigo-600 font-medium text-white shadow-sm"
                  : "text-zinc-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
