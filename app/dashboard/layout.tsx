import { AppShell } from "@/components/app-shell";

// Content renders only after the in-memory session is restored on the client, so it can't be an instant shell.
export const instant = false;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      title="Dashboard"
      loginPath="/login"
      requiredRoles={["USER", "STAFF"]}
      links={[
        { href: "/", label: "Home" },
        { href: "/contact", label: "Contact" },
      ]}
      sidebarLinks={[
        { href: "/dashboard", label: "User account" },
        { href: "/dashboard/cart", label: "My cart" },
        { href: "/dashboard/orders", label: "My orders" },
      ]}
    >
      {children}
    </AppShell>
  );
}
