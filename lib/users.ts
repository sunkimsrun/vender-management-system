import "server-only";

import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";

export type Role = "USER" | "STAFF" | "ADMIN";

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
};

export async function emailExists(email: string): Promise<boolean> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    "SELECT 1 FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  return rows.length > 0;
}

export async function listUsers(): Promise<PublicUser[]> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    "SELECT id, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 200",
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export type UserCredentials = { id: string; role: Role; passwordHash: string };

export async function findPublicUserById(id: string): Promise<PublicUser | null> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    "SELECT id, email, role, created_at FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// Internal use only: includes the password hash and must never be sent to clients.
export async function findCredentialsByEmail(
  email: string,
): Promise<UserCredentials | null> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    "SELECT id, role, password_hash FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, role: row.role, passwordHash: row.password_hash };
}

// Public registration always uses USER; admins may pick USER or STAFF for accounts they create.
export async function createUser(
  email: string,
  passwordHash: string,
  role: "USER" | "STAFF" = "USER",
): Promise<PublicUser> {
  const id = randomUUID();
  await getDatabasePool().execute(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
    [id, email, passwordHash, role],
  );

  return { id, email, role, createdAt: new Date().toISOString() };
}

// Only reachable from the invite-code-gated registration route (ADMIN_INVITE_CODE -> ADMIN, STAFF_INVITE_CODE -> STAFF).
export async function createAdminUser(
  email: string,
  passwordHash: string,
): Promise<PublicUser> {
  const id = randomUUID();
  await getDatabasePool().execute(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'ADMIN')",
    [id, email, passwordHash],
  );

  return { id, email, role: "ADMIN", createdAt: new Date().toISOString() };
}

// Admin management covers USER and STAFF accounts only, so admins cannot be edited, demoted or deleted here.
// The role can only ever be set to USER or STAFF; ADMIN can't be granted through this API.
export async function updateManagedUser(
  id: string,
  input: { email?: string; passwordHash?: string; role?: "USER" | "STAFF" },
): Promise<PublicUser | null> {
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE users SET email = COALESCE(?, email), password_hash = COALESCE(?, password_hash), role = COALESCE(?, role)
     WHERE id = ? AND role IN ('USER', 'STAFF')`,
    [input.email ?? null, input.passwordHash ?? null, input.role ?? null, id],
  );
  if (result.affectedRows === 0) return null;

  if (input.passwordHash || input.role) {
    // Password and role changes sign the user out everywhere so the new access applies immediately.
    await getDatabasePool().execute("DELETE FROM refresh_tokens WHERE user_id = ?", [id]);
  }
  return findPublicUserById(id);
}

export async function deleteManagedUser(id: string): Promise<boolean> {
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM users WHERE id = ? AND role IN ('USER', 'STAFF')",
    [id],
  );
  return result.affectedRows > 0;
}

export function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "ER_DUP_ENTRY"
  );
}
