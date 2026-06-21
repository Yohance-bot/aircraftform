import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";

import { site } from "../data/site.js";

// Three.js is heavy — load it as a separate chunk so the page paints instantly.
const HeroScene = lazy(() => import("../components/three/HeroScene.jsx"));

function SceneLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-60 w-60 animate-floaty rounded-full bg-aero-400/40 blur-3xl" />
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden sky-gradient">
      {/* soft decorative orbs */}
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-aero-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-aero-400/30 blur-3xl" />

      <div className="relative mx-auto grid min-h-[88vh] max-w-7xl grid-cols-1 items-center gap-6 px-4 pb-12 pt-24 sm:px-6 lg:min-h-screen lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pt-20">
        {/* 3D drone — sits behind text on mobile, beside it on desktop */}
        <div className="relative order-1 h-[40vh] sm:h-[46vh] lg:order-2 lg:h-[78vh]">
          <div className="pointer-events-none absolute inset-0">
            <Suspense fallback={<SceneLoading />}>
              <HeroScene />
            </Suspense>
          </div>
        </div>

        {/* manifesto */}
        <div className="relative order-2 lg:order-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-aero-200 bg-white/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-aero-700 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-bob rounded-full bg-aero-500" />
            Aeromodelling · {site.city}
          </span>

          <h1 className="mt-5 display text-[clamp(2.8rem,9vw,6.5rem)] text-ink">
            BUILD IT.
            <br />
            FLY IT.
            <br />
            <span className="bg-gradient-to-r from-aero-500 to-aero-700 bg-clip-text text-transparent">
              OWN THE SKY.
            </span>
          </h1>

          <p className="mt-6 max-w-md text-balance text-base text-slate-600 sm:text-lg">
            From your first paper glider to a ₹40,000 FPV racing drone — AMC
            Airmodelcrafts is where India learns to build, fly and never look
            down.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/shop"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            >
              Shop the hangar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to={{ pathname: "/", hash: "#workshops" }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-7 py-3.5 text-sm font-bold text-ink backdrop-blur transition-colors hover:border-aero-300 hover:text-aero-700"
            >
              Explore workshops
            </Link>
          </div>

          <dl className="mt-10 flex gap-8">
            {[
              { k: "68+", v: "Products in stock" },
              { k: "4", v: "Worlds to explore" },
              { k: "12+", v: "Years flying" },
            ].map((s) => (
              <div key={s.v}>
                <dt className="font-display text-2xl font-black text-ink">{s.k}</dt>
                <dd className="text-xs font-medium text-slate-500">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-aero-700/70 lg:flex">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Scroll</span>
        <ChevronDown className="h-5 w-5 animate-bob" />
      </div>
    </section>
  );
}
