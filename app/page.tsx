import { HomeProducts } from "@/components/home-products";
import { SiteHeader } from "@/components/site-header";

const perks = [
  { title: "Trusted vendors", text: "Every product comes from a vendor managed by our team." },
  { title: "Live stock", text: "Availability is checked again when you check out." },
  { title: "Simple orders", text: "Fill your cart, check out, and track your orders." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <section className="relative overflow-hidden bg-zinc-950 text-white">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-fuchsia-600/30 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Now open for orders
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              Everything your vendors sell,{" "}
              <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
                in one place.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-300">
              Browse the catalog, add items to your cart and order in a few clicks.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#products" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-indigo-100">
                Browse products
              </a>
              <a href="/contact" className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Contact us
              </a>
            </div>
          </div>
          <ul className="grid gap-3 lg:col-span-2">
            {perks.map((perk) => (
              <li key={perk.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="font-semibold">{perk.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{perk.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <main id="products" className="mx-auto w-full max-w-6xl flex-1 scroll-mt-16 px-4 py-14">
        <div className="mb-8 flex items-end justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Catalog</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">Our products</h2>
          </div>
        </div>
        <HomeProducts />
      </main>
      <footer className="bg-zinc-950 py-8 text-center text-sm text-zinc-400">
        © Vender Management System
      </footer>
    </>
  );
}