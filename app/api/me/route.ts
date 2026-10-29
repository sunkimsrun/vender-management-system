import { connection } from "next/server";

import { requireAuth } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { HttpError } from "@/lib/http/errors";
import { logServerError } from "@/lib/http/log";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireAuth(request);
    return jsonOk({ user });
  } catch (error) {
    if (!(error instanceof HttpError)) logServerError("current user", error);
    const response = jsonError(error);
    if (error instanceof HttpError && error.status === 401) {
      response.headers.set("WWW-Authenticate", "Bearer");
    }
    return response;
  }
}
