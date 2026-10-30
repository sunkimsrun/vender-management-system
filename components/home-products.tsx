"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui";
import { apiFetch, readFailure, type Role } from "@/lib/client/api";

type Product = { id: string; name: string; description: string; price: number; imageUrl: string | null };

export function HomeProducts() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/products");
        if (!response.ok) throw new Error();
        setProducts((await response.json()).products);
      } catch {
        setError("Could not load products.");
      }
    })();
    (async () => {
      try {
        const response = await apiFetch("/api/me");
        if (response.ok) setRole((await response.json()).user.role);
      } catch {
        // Visitors without a session simply see the public catalog.
      }
    })();
  }, []);

  async function addToCart(product: Product) {
    setError(null);
    setNotice(null);
    setBusyId(product.id);
    try {
      const response = await apiFetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError((await readFailure(response)).message);
        return;
      }
      setNotice(`"${product.name}" was added to your cart.`);
    } catch {
      setError("Could not add to cart.");
    } finally {
      setBusyId(null);
    }
  }

  if (products === null && !error) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}
      {products?.length === 0 ? <p className="text-sm text-zinc-500">No products yet.</p> : null}
      <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {(products ?? []).map((product) => (
          <li key={product.id} className="group flex flex-col">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl font-bold text-zinc-300 dark:text-zinc-600">
                  {product.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-zinc-950/85 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
                ${product.price.toFixed(2)}
              </span>
            </div>
            <h3 className="mt-4 font-semibold">{product.name}</h3>
            <p className="mt-1 line-clamp-2 flex-1 whitespace-pre-line text-sm text-zinc-500 dark:text-zinc-400">{product.description}</p>
            {role !== "ADMIN" ? (
              <button
                onClick={() => addToCart(product)}
                disabled={busyId === product.id}
                className="mt-4 w-full rounded-full border border-zinc-900 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-900 hover:text-white disabled:opacity-60 dark:border-zinc-200 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
              >
                {busyId === product.id ? "Adding…" : "Add to cart"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
