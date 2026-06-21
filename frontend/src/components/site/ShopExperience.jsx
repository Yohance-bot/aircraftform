import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import ProductCard from "./ProductCard.jsx";
import { products } from "../../data/products.js";
import { shopFilters } from "../../data/categories.js";

const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "name", label: "Name (A–Z)" },
];

export default function ShopExperience({
  initialCategory = "all",
  onCategoryChange,
}) {
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState("featured");
  const [query, setQuery] = useState("");

  function pickCategory(id) {
    setCategory(id);
    onCategoryChange?.(id);
  }

  const filtered = useMemo(() => {
    let list = products;
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [category, sort, query]);

  return (
    <div>
      {/* controls */}
      <div className="flex flex-col gap-4">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {shopFilters.map((f) => {
            const active = f.id === category;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => pickCategory(f.id)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-aero-300 hover:text-aero-700"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-slate-400 focus:border-aero-400 focus:outline-none focus:ring-2 focus:ring-aero-200"
            />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-sm text-slate-500">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </span>
            <label className="relative inline-flex items-center">
              <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-semibold text-ink focus:border-aero-400 focus:outline-none focus:ring-2 focus:ring-aero-200"
                aria-label="Sort products"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* grid */}
      {filtered.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p, i) => (
            <ProductCard key={p.id} product={p} priority={i < 4} />
          ))}
        </div>
      ) : (
        <div className="mt-16 rounded-2xl border border-dashed border-slate-300 py-20 text-center">
          <p className="font-display text-xl font-bold text-ink">No products found</p>
          <p className="mt-2 text-sm text-slate-500">
            Try a different category or search term.
          </p>
        </div>
      )}
    </div>
  );
}
