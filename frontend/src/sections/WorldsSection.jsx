import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import Reveal from "../components/site/Reveal.jsx";
import ProductCard from "../components/site/ProductCard.jsx";
import { categories } from "../data/categories.js";
import { products } from "../data/products.js";

function topProducts(categoryId, n = 4) {
  return products
    .filter((p) => p.category === categoryId)
    .sort((a, b) => b.price - a.price)
    .slice(0, n);
}

function WorldBlock({ category, index }) {
  const flip = index % 2 === 1;
  const picks = topProducts(category.id);
  const num = String(index + 1).padStart(2, "0");

  return (
    <section
      id={category.anchor}
      className={index % 2 === 1 ? "bg-aero-50/60" : "bg-white"}
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* media */}
          <Reveal className={flip ? "lg:order-2" : ""}>
            <div className="relative">
              <div
                className="absolute -inset-4 rounded-[2rem] opacity-20 blur-2xl"
                style={{ background: category.accent }}
              />
              <div className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-white shadow-lift">
                <div className={`absolute inset-0 bg-gradient-to-br ${category.tone} opacity-10`} />
                <img
                  src={category.image}
                  alt={category.name}
                  loading="lazy"
                  className="h-full w-full object-contain p-10"
                />
                <span className="absolute left-6 top-6 font-display text-6xl font-black text-ink/10">
                  {num}
                </span>
              </div>
            </div>
          </Reveal>

          {/* copy */}
          <Reveal delay={0.1} className={flip ? "lg:order-1" : ""}>
            <span
              className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: category.accent }}
            >
              {category.kicker}
            </span>
            <h2 className="mt-5 display text-[clamp(2.2rem,5vw,3.8rem)] text-ink">
              {category.headline}
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              {category.blurb}
            </p>
            <Link
              to={`/?category=${category.id}#shop`}
              className="group mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            >
              Shop {category.name}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        {/* product rail */}
        <Reveal delay={0.15}>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {picks.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={index === 0 && i < 2} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function WorldsSection() {
  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8 lg:pt-28">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-aero-600">
            Four worlds, one hangar
          </p>
          <h2 className="mt-3 max-w-2xl display text-[clamp(2rem,5vw,3.4rem)] text-ink">
            Pick your altitude.
          </h2>
          <p className="mt-4 max-w-xl text-slate-600">
            Whether you're chasing podiums or building your very first glider,
            scroll in — every world is its own kind of fun.
          </p>
        </Reveal>
      </div>
      {categories.map((c, i) => (
        <WorldBlock key={c.id} category={c} index={i} />
      ))}
    </div>
  );
}
