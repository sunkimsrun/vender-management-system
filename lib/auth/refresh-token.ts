import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { getAuthConfig } from "@/lib/env";
import { getDatabasePool } from "@/lib/db";
import type { Role } from "@/lib/users";

// 256 bits of entropy, so a fast SHA-256 hash is sufficient (unlike low-entropy passwords).
function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Starts a new session family (used at login).
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  await getDatabasePool().execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))`,
    [
      randomUUID(),
      userId,
      hashRefreshToken(token),
      randomUUID(),
      getAuthConfig().refreshTokenTtlSeconds,
    ],
  );
  return token;
}

export type RotationResult =
  | { status: "ok"; userId: string; role: Role; token: string }
  | { status: "invalid" }
  | { status: "reuse_detected" };

export async function rotateRefreshToken(
  rawToken: string,
): Promise<RotationResult> {
  const connection = await getDatabasePool().getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT rt.id, rt.user_id, rt.family_id, u.role,
              rt.revoked_at IS NOT NULL AS revoked,
              rt.replaced_by_token_id IS NOT NULL AS rotated,
              rt.expires_at <= NOW(3) AS expired
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ?
       FOR UPDATE OF rt`,
      [hashRefreshToken(rawToken)],
    );
    const current = rows[0];

    if (!current) {
      await connection.rollback();
      return { status: "invalid" };
    }

    // A rotated token being presented again means it may have been stolen:
    // revoke the whole family so neither the thief nor the user keeps a session.
    if (current.rotated) {
      await connection.execute(
        "UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE family_id = ? AND revoked_at IS NULL",
        [current.family_id],
      );
      await connection.commit();
      return { status: "reuse_detected" };
    }

    if (current.revoked || current.expired) {
      await connection.rollback();
      return { status: "invalid" };
    }

    const newId = randomUUID();
    const newToken = generateRefreshToken();

    await connection.execute(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))`,
      [
        newId,
        current.user_id,
        hashRefreshToken(newToken),
        current.family_id,
        getAuthConfig().refreshTokenTtlSeconds,
      ],
    );
    await connection.execute(
      "UPDATE refresh_tokens SET revoked_at = NOW(3), replaced_by_token_id = ? WHERE id = ?",
      [newId, current.id],
    );

    await connection.commit();
    return {
      status: "ok",
      userId: current.user_id,
      role: current.role,
      token: newToken,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

// Revokes the whole session family of the given token. Safe to call with unknown or already-revoked tokens.
export async function revokeRefreshSession(rawToken: string): Promise<void> {
  await getDatabasePool().execute(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(3)
     WHERE revoked_at IS NULL
       AND family_id = (
         SELECT family_id FROM (
           SELECT family_id FROM refresh_tokens WHERE token_hash = ?
         ) AS session
       )`,
    [hashRefreshToken(rawToken)],
  );
}
