import "server-only";

// Logs only the error type and driver code. Messages and stacks are omitted on purpose:
// database errors can embed query values such as emails.
export function logServerError(context: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const code =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown }).code
      : undefined;

  console.error(
    `[server-error] ${context}: ${name}${typeof code === "string" ? ` (${code})` : ""}`,
  );
}
