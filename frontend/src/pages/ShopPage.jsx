import { useSearchParams } from "react-router-dom";

import StoreLayout from "../components/site/StoreLayout.jsx";
import ShopExperience from "../components/site/ShopExperience.jsx";
import { shopFilters } from "../data/categories.js";

export default function ShopPage() {
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
    <StoreLayout>
      <div className="sky-gradient-soft">
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-28 sm:px-6 lg:px-8 lg:pt-32">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-aero-600">
            The hangar
          </p>
          <h1 className="mt-3 display text-[clamp(2.4rem,6vw,4rem)] text-ink">
            Shop all products
          </h1>
          <p className="mt-3 max-w-xl text-slate-600">
            Every plane, drone, glider, kit and component we stock — straight
            from the AMC Airmodelcrafts catalogue.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <ShopExperience
          key={initialCategory}
          initialCategory={initialCategory}
          onCategoryChange={handleCategoryChange}
        />
      </div>
    </StoreLayout>
  );
}
