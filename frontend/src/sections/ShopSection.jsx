import { useSearchParams } from "react-router-dom";

import Reveal from "../components/site/Reveal.jsx";
import ShopExperience from "../components/site/ShopExperience.jsx";
import { shopFilters } from "../data/categories.js";

export default function ShopSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("category") || "all";
  const initialCategory = shopFilters.some((f) => f.id === raw) ? raw : "all";

  function handleCategoryChange(id) {
    if (id === "all") {
      searchParams.delete("category");
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ category: id }, { replace: true });
    }
  }

  return (
    <section id="shop" className="bg-aero-50/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-aero-600">
              The full hangar
            </p>
            <h2 className="mt-3 display text-[clamp(2rem,5vw,3.4rem)] text-ink">
              Shop everything.
            </h2>
          </div>
        </Reveal>

        <div className="mt-10">
          <ShopExperience
            key={initialCategory}
            initialCategory={initialCategory}
            onCategoryChange={handleCategoryChange}
          />
        </div>
      </div>
    </section>
  );
}
