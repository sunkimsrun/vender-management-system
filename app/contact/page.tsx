import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-3xl font-bold tracking-tight">Contact us</h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Questions about our products or vendors? Reach out and we will get back to you.
          </p>
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-indigo-50 p-4 text-sm dark:bg-zinc-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">@</span>
            <a href="mailto:support@example.com" className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
              support@example.com
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
