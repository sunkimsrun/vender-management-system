"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { login, logout, apiFetch, postJson } from "@/lib/client/api";

export type AuthMode = "login" | "register" | "admin-login" | "admin-register";

const COPY: Record<AuthMode, {
  title: string;
  subtitle: string;
  submit: string;
  altText: string;
  altLabel: string;
  altHref: string;
}> = {
  login: {
    title: "Sign in",
    subtitle: "Welcome back. Enter your details to continue.",
    submit: "Sign in",
    altText: "No account yet?",
    altLabel: "Create one",
    altHref: "/register",
  },
  register: {
    title: "Create an account",
    subtitle: "Use at least 9 characters for your password.",
    submit: "Create account",
    altText: "Already registered?",
    altLabel: "Sign in",
    altHref: "/login",
  },
  "admin-login": {
    title: "Admin sign in",
    subtitle: "Administrator access only.",
    submit: "Sign in as admin",
    altText: "Have an invite code?",
    altLabel: "Register as admin",
    altHref: "/admin/register",
  },
  "admin-register": {
    title: "Admin registration",
    subtitle: "An invite code from the system owner is required.",
    submit: "Create admin account",
    altText: "Already an admin?",
    altLabel: "Sign in",
    altHref: "/admin/login",
  },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const copy = COPY[mode];
  const isRegister = mode === "register" || mode === "admin-register";
  const isAdmin = mode === "admin-login" || mode === "admin-register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!EMAIL_PATTERN.test(email.trim())) found.email = "Enter a valid email address";
    if (!password) found.password = "Password is required";
    else if (isRegister &&     password.length < 9) {
          found.password = "Password must be at least 9 characters";
    }
    if (isRegister && confirm !== password) found.confirm = "Passwords do not match";
    if (mode === "admin-register" && !inviteCode.trim()) {
      found.inviteCode = "Invite code is required";
    }
    return found;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setFormError(null);
    setSuccess(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      if (isRegister) {
        const path = mode === "admin-register" ? "/api/admin/register" : "/api/auth/register";
        const body = mode === "admin-register"
          ? { email, password, inviteCode }
          : { email, password };
        const result = await postJson(path, body);
        if (!result.ok) {
          setErrors(result.failure.fields);
          setFormError(result.failure.message);
          return;
        }
        setPassword("");
        setConfirm("");
        setInviteCode("");
        setSuccess("Account created. You can now sign in.");
        return;
      }

      const failure = await login(email, password);
      if (failure) {
        setFormError(failure.status === 401 ? "Invalid email or password" : failure.message);
        return;
      }

      if (mode === "admin-login") {
        // The role is checked by the server on every admin call; this only picks the right page.
        const me = await apiFetch("/api/me");
        const role = me.ok ? (await me.json()).user?.role : null;
        if (role !== "ADMIN") {
          await logout();
          setFormError("Invalid email or password");
          return;
        }
        router.replace("/admin");
        return;
      }
      // Each role has its own dashboard; the server still authorizes every request.
      const me = await apiFetch("/api/me");
      const role = me.ok ? (await me.json()).user?.role : null;
      router.replace(role === "ADMIN" ? "/admin" : "/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title={copy.title} subtitle={copy.subtitle}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError ? <Alert kind="error">{formError}</Alert> : null}
        {success ? (
          <Alert kind="success">
            {success}{" "}
            <Link href={isAdmin ? "/admin/login" : "/login"} className="font-medium underline">
              Go to sign in
            </Link>
          </Alert>
        ) : null}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          value={password}
          onChange={setPassword}
          error={errors.password}
          hint={isRegister ? "At least 9 characters." : undefined}
        />
        {isRegister ? (
          <Field
            label="Confirm password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            error={errors.confirm}
          />
        ) : null}
        {mode === "admin-register" ? (
          <Field
            label="Invite code"
            name="inviteCode"
            type="password"
            autoComplete="off"
            value={inviteCode}
            onChange={setInviteCode}
            error={errors.inviteCode}
          />
        ) : null}

        <Button type="submit" loading={loading}>
          {loading ? "Please wait…" : copy.submit}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        {copy.altText}{" "}
        <Link href={copy.altHref} className="font-medium text-zinc-900 underline dark:text-zinc-100">
          {copy.altLabel}
        </Link>
      </p>
      {!isAdmin ? (
        <p className="mt-2 text-center text-xs text-zinc-500">
          <Link href="/admin/login" className="underline">
            Administrator? Sign in here
          </Link>
        </p>
      ) : (
        <p className="mt-2 text-center text-xs text-zinc-500">
          <Link href="/login" className="underline">
            Back to user sign in
          </Link>
        </p>
      )}
    </Card>
  );
}
