export type Role = "USER" | "STAFF" | "ADMIN";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type ApiFailure = {
  message: string;
  fields: Record<string, string>;
  status: number;
};

// The access token lives only in this module's memory: never in storage or cookies,
// so page scripts can't persist it and a reload simply triggers a cookie-based refresh.
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

const NETWORK_FAILURE: ApiFailure = {
  message: "Unable to reach the server. Check your connection and try again.",
  fields: {},
  status: 0,
};

export async function readFailure(response: Response): Promise<ApiFailure> {
  let message = "Something went wrong. Please try again.";
  let fields: Record<string, string> = {};
  try {
    const body = await response.json();
    if (typeof body?.error?.message === "string") message = body.error.message;
    if (body?.error?.fields && typeof body.error.fields === "object") {
      fields = body.error.fields;
    }
  } catch {
    // Non-JSON error bodies fall back to the generic message.
  }
  return { message, fields, status: response.status };
}

// Returns the parsed success body, or a safe failure object.
export async function postJson<T = unknown>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; failure: ApiFailure }> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, failure: await readFailure(response) };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, failure: NETWORK_FAILURE };
  }
}

// Concurrent callers share one request: refresh tokens rotate, so parallel use would look like reuse.
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch("/api/auth/refresh", { method: "POST" });
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const data = await response.json();
      accessToken = typeof data.accessToken === "string" ? data.accessToken : null;
      return accessToken !== null;
    } catch {
      accessToken = null;
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function login(email: string, password: string): Promise<ApiFailure | null> {
  const result = await postJson<{ accessToken: string }>("/api/auth/login", {
    email,
    password,
  });
  if (!result.ok) return result.failure;
  accessToken = result.data.accessToken;
  return null;
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // The local token is dropped regardless; the server session expires on its own.
  }
  accessToken = null;
}

// Sends the access token; on a 401 it refreshes once and retries once, never more.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!accessToken && !(await refreshSession())) {
    return new Response(null, { status: 401 });
  }

  const send = () =>
    fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    });

  let response = await send();
  if (response.status === 401) {
    if (!(await refreshSession())) return response;
    response = await send();
  }
  return response;
}
