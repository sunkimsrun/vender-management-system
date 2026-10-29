import "server-only";

import { HttpError } from "@/lib/http/errors";
import type { PublicUser, Role } from "@/lib/users";

// Call after requireAuth(). The role comes from the database, not from the client.
export function requireRole(user: PublicUser, ...allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    throw new HttpError("FORBIDDEN", "You do not have permission to do this");
  }
}
