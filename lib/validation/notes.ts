import { z } from "zod";

export const noteIdSchema = z.uuid();

const title = z.string({ error: "Title is required" }).trim().min(1, "Title is required").max(200, "Title is too long");
const content = z.string({ error: "Content is required" }).max(10_000, "Content is too long");

export const createNoteSchema = z.object({ title, content });

export const updateNoteSchema = z
  .object({ title: title.optional(), content: content.optional() })
  .refine((v) => v.title !== undefined || v.content !== undefined, "Nothing to update");
