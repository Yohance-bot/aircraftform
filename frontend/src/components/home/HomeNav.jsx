import { useEffect, useState } from "react";

import { useLenis } from "./SmoothScroll.jsx";

const LINKS = [
  { label: "About", href: "#about" },
  { label: "Programs", href: "#programs" },
  { label: "Gallery", href: "#gallery" },
  { label: "Register", href: "#register" },
];

export default function HomeNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const lenis = useLenis();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goTo(e, href) {
    e.preventDefault();
    setOpen(false);
    const el = document.querySelector(href);
    if (!el) return;
    if (lenis) {
      lenis.scrollTo(el, { offset: -8, duration: 1.4 });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[60] transition-colors duration-500 ${
        scrolled || open ? "bg-black/85 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#hero" onClick={(e) => goTo(e, "#hero")} className="flex items-center">
          <img
            src="/aeromodelling%20logo.gif"
            alt="AMC Airmodelcrafts"
            className="h-10 w-auto sm:h-11"
          />
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={(e) => goTo(e, l.href)}
              className="rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            className="hidden items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 sm:inline-flex"
          >
            Shop Products →
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <span className="text-2xl leading-none">{open ? "×" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/10 bg-black/95 px-5 pb-6 pt-2 lg:hidden">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={(e) => goTo(e, l.href)}
              className="block rounded-xl px-3 py-3 text-base font-semibold text-white/90"
            >
              {l.label}
            </a>
          ))}
          <a
            href="/"
            className="mt-2 block rounded-xl bg-white px-3 py-3 text-center text-sm font-bold text-black"
          >
            Shop Products →
          </a>
        </div>
      )}
    </header>
  );
}
