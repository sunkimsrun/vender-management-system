import "server-only";

import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { getDatabasePool } from "@/lib/db";

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function toNote(row: RowDataPacket): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const COLUMNS = "id, title, content, created_at, updated_at";

// Every query is scoped by user_id, so ownership is enforced by the database lookup itself.
export async function listNotes(userId: string): Promise<Note[]> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
    [userId],
  );
  return rows.map(toNote);
}

export async function getNote(userId: string, id: string): Promise<Note | null> {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    `SELECT ${COLUMNS} FROM notes WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId],
  );
  return rows[0] ? toNote(rows[0]) : null;
}

export async function createNote(
  userId: string,
  input: { title: string; content: string },
): Promise<Note> {
  const id = randomUUID();
  await getDatabasePool().execute(
    "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)",
    [id, userId, input.title, input.content],
  );
  return (await getNote(userId, id))!;
}

export async function updateNote(
  userId: string,
  id: string,
  input: { title?: string; content?: string },
): Promise<Note | null> {
  await getDatabasePool().execute(
    `UPDATE notes SET title = COALESCE(?, title), content = COALESCE(?, content)
     WHERE id = ? AND user_id = ?`,
    [input.title ?? null, input.content ?? null, id, userId],
  );
  return getNote(userId, id);
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const [result] = await getDatabasePool().execute<import("mysql2").ResultSetHeader>(
    "DELETE FROM notes WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  return result.affectedRows > 0;
}
