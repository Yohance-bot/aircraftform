import { Link } from "react-router-dom";
import { MapPin, Phone, Mail, ArrowUpRight } from "lucide-react";

import Logo from "./Logo.jsx";
import {
  InstagramIcon,
  FacebookIcon,
  YoutubeIcon,
  WhatsappIcon,
} from "./SocialIcons.jsx";
import { site, whatsappLink } from "../../data/site.js";
import { categories } from "../../data/categories.js";

const shopLinks = categories.map((c) => ({
  label: c.name,
  to: `/?category=${c.id}#shop`,
}));

const companyLinks = [
  { label: "Workshops & EdTech", to: "/#workshops" },
  { label: "Summer Camp", to: "/camp" },
  { label: "All products", to: "/#shop" },
];

export default function SiteFooter() {
  return (
    <footer className="bg-ink text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo variant="light" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-slate-400">
              {site.manifesto} RC planes, drones, kits and the workshops that
              teach the next generation of pilots — now flying out of Bengaluru.
            </p>
            <div className="mt-6 flex gap-3">
              <SocialButton href={site.social.instagram} label="Instagram">
                <InstagramIcon />
              </SocialButton>
              <SocialButton href={site.social.facebook} label="Facebook">
                <FacebookIcon />
              </SocialButton>
              <SocialButton href={site.social.youtube} label="YouTube">
                <YoutubeIcon />
              </SocialButton>
              <SocialButton href={whatsappLink()} label="WhatsApp">
                <WhatsappIcon />
              </SocialButton>
            </div>
          </div>

          <FooterCol title="Shop" links={shopLinks} />
          <FooterCol title="Company" links={companyLinks} />

          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Visit / Contact
            </h4>
            <ul className="mt-5 space-y-4 text-sm">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-aero-400" />
                <span className="text-slate-400">
                  {site.contact.addressLine1}
                  <br />
                  {site.contact.addressLine2}
                  <br />
                  {site.contact.addressCity}
                </span>
              </li>
              <li>
                <a
                  href={`tel:+${site.contact.phoneRaw}`}
                  className="flex items-center gap-3 text-slate-400 transition-colors hover:text-white"
                >
                  <Phone className="h-4 w-4 shrink-0 text-aero-400" />
                  {site.contact.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${site.contact.email}`}
                  className="flex items-center gap-3 text-slate-400 transition-colors hover:text-white"
                >
                  <Mail className="h-4 w-4 shrink-0 text-aero-400" />
                  {site.contact.email}
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-aero-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-aero-400"
                >
                  Chat on WhatsApp
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}. Made in {site.city} for
            pilots everywhere.
          </p>
          <p className="flex items-center gap-4">
            <span>Open the WhatsApp Business App every 14 days to stay synced.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h4>
      <ul className="mt-5 space-y-3 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              to={l.to.startsWith("/#") ? { pathname: "/", hash: l.to.slice(1) } : l.to}
              className="text-slate-400 transition-colors hover:text-white"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialButton({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-300 transition-all hover:-translate-y-0.5 hover:bg-aero-500 hover:text-white"
    >
      {children}
    </a>
  );
}
