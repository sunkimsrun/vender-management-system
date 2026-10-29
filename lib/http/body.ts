import { HttpError } from "@/lib/http/errors";

const MAX_BODY_BYTES = 32 * 1024;

export async function readJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new HttpError("BAD_REQUEST", "Request body too large");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError("BAD_REQUEST", "Invalid JSON body");
  }
}
