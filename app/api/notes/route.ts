import { connection } from "next/server";

import { requireAuth } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";
import { readJsonBody } from "@/lib/http/body";
import { jsonError, jsonOk, validationError } from "@/lib/http/responses";
import { createNote, listNotes } from "@/lib/notes";
import { createNoteSchema } from "@/lib/validation/notes";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireAuth(request);
    return jsonOk({ notes: await listNotes(user.id) });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("list notes", error);
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const parsed = createNoteSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return validationError(parsed.error);
    return jsonOk({ note: await createNote(user.id, parsed.data) }, 201);
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("create note", error);
    return jsonError(error);
  }
}
