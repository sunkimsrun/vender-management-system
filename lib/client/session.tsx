"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiFetch, logout, type CurrentUser, type Role } from "@/lib/client/api";

type SessionState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; user: CurrentUser };

const SessionContext = createContext<CurrentUser | null>(null);

export const SessionProvider = SessionContext.Provider;

export function useCurrentUser(): CurrentUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useCurrentUser must be used inside a protected layout");
  return user;
}

// Loads the signed-in user. Failing to restore a session sends the visitor to the login page.
export function useSession(loginPath: string) {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await apiFetch("/api/me");
        if (cancelled) return;
        if (response.status === 401) {
          router.replace(loginPath);
          return;
        }
        if (!response.ok) {
          setState({ status: "error" });
          return;
        }
        const data = await response.json();
        setState({ status: "ready", user: data.user });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, loginPath, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    router.replace(loginPath);
  }, [router, loginPath]);

  return { state, retry, signOut };
}

export type { Role };
