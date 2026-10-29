import { connection } from "next/server";

import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { readJsonBody } from "@/lib/http/body";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { deleteNote, getNote, updateNote } from "@/lib/notes";
import { noteIdSchema, updateNoteSchema } from "@/lib/validation/notes";

type Context = { params: Promise<{ id: string }> };

// A note that is missing and a note owned by someone else look identical (404),
// so IDs cannot be used to discover other users' data.
const NOT_FOUND = () => new HttpError("NOT_FOUND", "Note not found");

async function resolveId(context: Context): Promise<string> {
  const parsed = noteIdSchema.safeParse((await context.params).id);
  if (!parsed.success) throw NOT_FOUND();
  return parsed.data;
}

function fail(error: unknown, action: string) {
  if (!(error instanceof HttpError)) logServerError(action, error);
  return jsonError(error);
}

export async function GET(request: Request, context: Context) {
  await connection();
  try {
    const user = await requireAuth(request);
    const note = await getNote(user.id, await resolveId(context));
    if (!note) throw NOT_FOUND();
    return jsonOk({ note });
  } catch (error) {
    return fail(error, "Get note");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireAuth(request);
    const id = await resolveId(context);
    const parsed = updateNoteSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return validationError(parsed.error);
    const note = await updateNote(user.id, id, parsed.data);
    if (!note) throw NOT_FOUND();
    return jsonOk({ note });
  } catch (error) {
    return fail(error, "Update note");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireAuth(request);
    if (!(await deleteNote(user.id, await resolveId(context)))) throw NOT_FOUND();
    return jsonOk({ success: true });
  } catch (error) {
    return fail(error, "Delete note");
  }
}
