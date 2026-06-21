import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import SiteNav from "./SiteNav.jsx";
import SiteFooter from "./SiteFooter.jsx";

/** Scrolls to top on route change, or to the hash target when present. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      // wait a frame for the target section to mount
      const id = hash.replace("#", "");
      const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      const t = setTimeout(tryScroll, 60);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    return undefined;
  }, [pathname, hash]);
  return null;
}

export default function StoreLayout({ children }) {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <ScrollManager />
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
