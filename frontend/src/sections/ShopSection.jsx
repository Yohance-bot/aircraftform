import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import Reveal from "../components/site/Reveal.jsx";
import ShopExperience from "../components/site/ShopExperience.jsx";

export default function ShopSection() {
  return (
    <section id="shop" className="bg-aero-50/40">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-aero-600">
                The full hangar
              </p>
              <h2 className="mt-3 display text-[clamp(2rem,5vw,3.4rem)] text-ink">
                Shop everything.
              </h2>
            </div>
            <Link
              to="/shop"
              className="group inline-flex items-center gap-2 self-start rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-ink transition-colors hover:border-aero-300 hover:text-aero-700 sm:self-auto"
            >
              Open full shop
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>

        <div className="mt-10">
          <ShopExperience />
        </div>
      </div>
    </section>
  );
}
