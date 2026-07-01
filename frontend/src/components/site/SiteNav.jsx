import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ShoppingBag, MessageCircle } from "lucide-react";

import Logo from "./Logo.jsx";
import { navLinks, site, whatsappLink } from "../../data/site.js";

function toProp(to) {
  // Support "/#anchor" hash links as router-aware locations.
  if (to.startsWith("/#")) return { pathname: "/", hash: to.slice(1) };
  return to;
}

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? "border-b border-slate-200/70 bg-white/85 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((l) => (
            <Link
              key={l.label}
              to={toProp(l.to)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-aero-50 hover:text-aero-700"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-aero-50 hover:text-aero-700 sm:inline-flex"
            aria-label={`WhatsApp ${site.contact.phoneDisplay}`}
          >
            <MessageCircle className="h-5 w-5" />
          </a>
          <Link
            to="/#shop"
            className="hidden items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 sm:inline-flex"
          >
            <ShoppingBag className="h-4 w-4" />
            Shop
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-aero-50 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="lg:hidden">
          <div className="space-y-1 px-4 pb-6 pt-2 sm:px-6">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                to={toProp(l.to)}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-base font-semibold text-slate-800 hover:bg-aero-50 hover:text-aero-700"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex gap-3 px-1 pt-3">
              <Link
                to="/#shop"
                onClick={() => setOpen(false)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white"
              >
                <ShoppingBag className="h-4 w-4" />
                Shop all
              </Link>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-aero-200 bg-aero-50 px-5 py-3 text-sm font-bold text-aero-700"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
