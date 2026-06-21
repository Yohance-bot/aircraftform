import { Check } from "lucide-react";

import Reveal from "../components/site/Reveal.jsx";
import CountUp from "../components/site/CountUp.jsx";
import { stats, trustPoints } from "../data/stats.js";

export default function SocialProof() {
  return (
    <section id="story" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-20">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-aero-600">
              Our story
            </p>
            <h2 className="mt-3 display text-[clamp(2rem,5vw,3.4rem)] text-ink">
              A generation of pilots, trained.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              What started as a hobbyist's workbench has grown into one of
              India's most loved aeromodelling communities. From classrooms to
              flying fields, we've put a flying machine in the hands of thousands.
            </p>
            <ul className="mt-8 space-y-3">
              {trustPoints.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aero-100 text-aero-700">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="text-slate-700">{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {stats.map((s) => (
                <div
                  key={s.id}
                  className="rounded-3xl border border-slate-200 bg-gradient-to-b from-aero-50 to-white p-7 text-center shadow-sm"
                >
                  <div className="font-display text-[clamp(2.4rem,6vw,3.6rem)] font-black leading-none">
                    <span className="bg-gradient-to-br from-aero-500 to-aero-700 bg-clip-text text-transparent">
                      <CountUp value={s.value} suffix={s.suffix} />
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-600">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
