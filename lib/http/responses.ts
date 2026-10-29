import type { ZodError } from "zod";

import { HttpError } from "@/lib/http/errors";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: NO_STORE },
    );
  }

  // Unknown errors are never echoed to the client.
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500, headers: NO_STORE },
  );
}

// Only field names and our own schema messages are returned; never raw Zod internals or input values.
export function validationError(error: ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "body";
    fields[field] ??= issue.message;
  }

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fields,
      },
    },
    { status: 400, headers: NO_STORE },
  );
}

export function notImplemented(): Response {
  return jsonError(new HttpError("NOT_IMPLEMENTED", "Not implemented yet"));
}
