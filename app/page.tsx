import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-16 text-center dark:bg-zinc-950">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Auth System</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Secure sign-in with short-lived access tokens and rotating refresh sessions.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Create account
        </Link>
      </div>
      <Link href="/admin/login" className="text-xs text-zinc-500 underline">
        Administrator sign in
      </Link>
    </main>
  );
}
