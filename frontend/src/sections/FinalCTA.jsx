import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import Reveal from "../components/site/Reveal.jsx";
import { WhatsappIcon } from "../components/site/SocialIcons.jsx";
import { whatsappLink } from "../data/site.js";

export default function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-ink">
      <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-aero-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-aero-600/20 blur-3xl" />
      <div className="relative mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="display text-[clamp(2.4rem,7vw,5rem)] text-white">
            Ready for takeoff?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-slate-300">
            Build your first glider, fly your first drone, or sign your kid up
            for the camp they'll never stop talking about.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/shop"
              className="group inline-flex items-center gap-2 rounded-full bg-aero-500 px-8 py-4 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-aero-400"
            >
              Start shopping
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/camp"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              Join the summer camp
            </Link>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              <WhatsappIcon className="h-4 w-4" />
              WhatsApp us
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
