import { AppShell } from "@/components/app-shell";

// Content renders only after the in-memory session is restored on the client, so it can't be an instant shell.
export const instant = false;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      title="Admin"
      loginPath="/admin/login"
      requiredRole="ADMIN"
      links={[
        { href: "/", label: "Home" },
        { href: "/contact", label: "Contact" },
      ]}
      sidebarLinks={[
        { href: "/admin/overview", label: "Overview" },
        { href: "/admin", label: "Manage users" },
        { href: "/admin/products", label: "Products" },
        { href: "/admin/categories", label: "Categories" },
        { href: "/admin/suppliers", label: "Suppliers" },
        { href: "/admin/stock", label: "Stock" },
      ]}
    >
      {children}
    </AppShell>
  );
}
