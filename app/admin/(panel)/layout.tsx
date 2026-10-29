import { AppShell } from "@/components/app-shell";

// Content renders only after the in-memory session is restored on the client, so it can't be an instant shell.
export const instant = false;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      title="Admin"
      loginPath="/admin/login"
      requiredRole="ADMIN"
      links={[{ href: "/admin", label: "Users" }]}
    >
      {children}
    </AppShell>
  );
}
