import { ArrowUpRight } from "lucide-react";

import { discountPercent, formatPrice } from "../../lib/format.js";

const BADGE_LABELS = { new: "New", sale: "Sale" };

export default function ProductCard({ product, priority = false }) {
  const off = discountPercent(product.mrp, product.price);
  const badge = product.onSale ? "sale" : product.badge;

  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-aero-300 hover:shadow-sky focus:outline-none focus-visible:ring-2 focus-visible:ring-aero-400"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-b from-aero-50 to-white">
        {badge && (
          <span
            className={`absolute left-3 top-3 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              badge === "sale"
                ? "bg-ink text-white"
                : "bg-aero-500 text-white"
            }`}
          >
            {off > 0 && badge === "sale" ? `−${off}%` : BADGE_LABELS[badge]}
          </span>
        )}
        <img
          src={product.image}
          alt={product.name}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-contain p-5 transition-transform duration-500 ease-out group-hover:scale-110"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {product.name}
        </h3>
        <div className="mt-auto flex items-end justify-between pt-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-extrabold text-ink">
              {formatPrice(product.price)}
            </span>
            {product.onSale && (
              <span className="text-xs font-medium text-slate-400 line-through">
                {formatPrice(product.mrp)}
              </span>
            )}
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-aero-50 text-aero-600 transition-colors duration-300 group-hover:bg-aero-500 group-hover:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </a>
  );
}
