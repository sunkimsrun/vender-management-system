import { InventoryOverview } from "@/components/inventory-overview";

// Content renders only after the in-memory session is restored on the client, so it can't be an instant shell.
export const instant = false;

export default function AdminOverviewPage() {
  return <InventoryOverview />;
}
