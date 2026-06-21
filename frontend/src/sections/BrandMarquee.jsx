import { Plane } from "lucide-react";

const WORDS = [
  "RC PLANES",
  "FPV DRONES",
  "GLIDERS",
  "DIY KITS",
  "ROCKETS",
  "TRANSMITTERS",
  "BALSA & FOAM",
  "WORKSHOPS",
  "SUMMER CAMPS",
  "STEM",
];

export default function BrandMarquee() {
  const row = [...WORDS, ...WORDS];
  return (
    <div className="border-y border-slate-200 bg-ink py-4">
      <div className="mask-fade-x flex overflow-hidden">
        <ul className="flex shrink-0 animate-marquee items-center gap-8 pr-8">
          {row.map((w, i) => (
            <li key={i} className="flex items-center gap-8">
              <span className="font-display text-lg font-extrabold uppercase tracking-tight text-white/90">
                {w}
              </span>
              <Plane className="h-4 w-4 -rotate-45 text-aero-400" />
            </li>
          ))}
        </ul>
        <ul aria-hidden className="flex shrink-0 animate-marquee items-center gap-8 pr-8">
          {row.map((w, i) => (
            <li key={i} className="flex items-center gap-8">
              <span className="font-display text-lg font-extrabold uppercase tracking-tight text-white/90">
                {w}
              </span>
              <Plane className="h-4 w-4 -rotate-45 text-aero-400" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
