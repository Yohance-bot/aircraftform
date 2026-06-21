import { Link } from "react-router-dom";
import {
  Sun,
  GraduationCap,
  Radio,
  Wrench,
  Trophy,
  Boxes,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

import Reveal from "../components/site/Reveal.jsx";
import { workshops } from "../data/workshops.js";
import { whatsappLink } from "../data/site.js";

const ICONS = { Sun, GraduationCap, Radio, Wrench, Trophy, Boxes };

function ctaFor(w) {
  if (w.cta?.to) {
    return { type: "link", to: w.cta.to, label: w.cta.label };
  }
  return {
    type: "wa",
    href: whatsappLink(`Hi AMC Airmodelcrafts! I'm interested in: ${w.title}.`),
    label: w.cta?.label || "Enquire",
  };
}

export default function WorkshopsSection() {
  const featured = workshops.find((w) => w.featured) || workshops[0];
  const rest = workshops.filter((w) => w.id !== featured.id);
  const FeaturedIcon = ICONS[featured.icon] || Sun;

  return (
    <section id="workshops" className="sky-gradient-soft">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-aero-600">
            Workshops & EdTech
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-2xl display text-[clamp(2rem,5vw,3.4rem)] text-ink">
              We don't just sell flight. We teach it.
            </h2>
            <p className="max-w-md text-slate-600">
              For over a decade, AMC has run camps, school programs and pilot
              training across India. Hands-on, build-it-yourself, unforgettable.
            </p>
          </div>
        </Reveal>

        {/* featured */}
        <Reveal delay={0.05}>
          <div className="mt-12 overflow-hidden rounded-[2rem] bg-gradient-to-br from-aero-500 to-aero-700 text-white shadow-sky">
            <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.3fr_1fr] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em]">
                  <FeaturedIcon className="h-4 w-4" />
                  Most popular
                </span>
                <h3 className="mt-4 display text-[clamp(1.8rem,4vw,3rem)]">
                  {featured.title}
                </h3>
                <p className="mt-3 max-w-lg text-aero-50/90">{featured.blurb}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Chip>{featured.audience}</Chip>
                  <Chip>{featured.duration}</Chip>
                </div>
                <Link
                  to={featured.cta.to}
                  className="group mt-7 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-aero-700 transition-transform hover:-translate-y-0.5"
                >
                  {featured.cta.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="relative hidden lg:block">
                <div className="aspect-square rounded-3xl bg-white/10 backdrop-blur">
                  <Sun className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 text-white/90" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* grid */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((w, i) => {
            const Icon = ICONS[w.icon] || Boxes;
            const cta = ctaFor(w);
            return (
              <Reveal key={w.id} delay={0.05 * i}>
                <div className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7 transition-all hover:-translate-y-1 hover:border-aero-300 hover:shadow-sky">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-aero-50 text-aero-600">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-ink">{w.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <MiniChip>{w.audience}</MiniChip>
                    <MiniChip>{w.duration}</MiniChip>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">
                    {w.blurb}
                  </p>
                  {cta.type === "link" ? (
                    <Link
                      to={cta.to}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-aero-700"
                    >
                      {cta.label}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  ) : (
                    <a
                      href={cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-aero-700"
                    >
                      {cta.label}
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </a>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Chip({ children }) {
  return (
    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
      {children}
    </span>
  );
}

function MiniChip({ children }) {
  return (
    <span className="rounded-full bg-aero-50 px-2.5 py-1 text-[11px] font-semibold text-aero-700">
      {children}
    </span>
  );
}
