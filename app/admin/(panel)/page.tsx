import { AdminUsers } from "@/components/admin-users";

// Content renders only after the in-memory session is restored on the client, so it can't be an instant shell.
export const instant = false;

export default function AdminPage() {
  return <AdminUsers />;
}
