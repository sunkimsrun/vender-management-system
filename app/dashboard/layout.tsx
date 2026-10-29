import { AppShell } from "@/components/app-shell";

// Content renders only after the in-memory session is restored on the client, so it can't be an instant shell.
export const instant = false;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      title="Dashboard"
      loginPath="/login"
      requiredRole="USER"
      links={[{ href: "/dashboard", label: "Dashboard" }]}
    >
      {children}
    </AppShell>
  );
}
