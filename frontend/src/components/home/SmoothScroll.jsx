import { createContext, useContext, useEffect, useRef, useState } from "react";
import Lenis from "@studio-freight/lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const LenisContext = createContext(null);

/** Access the shared Lenis instance (null if reduced-motion/not mounted yet). */
export function useLenis() {
  return useContext(LenisContext);
}

/**
 * Wraps the homepage in a Lenis smooth-scroll instance, synced to the GSAP
 * ticker so ScrollTrigger stays perfectly in step with the smoothed scroll.
 * Exposes the instance via context so nav links can drive the same easing
 * engine instead of fighting it with native `scrollIntoView`.
 * No-ops entirely when the user prefers reduced motion.
 */
export default function SmoothScroll({ children }) {
  const lenisRef = useRef(null);
  const [lenis, setLenis] = useState(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return undefined;

    const instance = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      smoothWheel: true,
    });
    lenisRef.current = instance;
    setLenis(instance);

    const onTick = (time) => instance.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    instance.on("scroll", ScrollTrigger.update);

    return () => {
      gsap.ticker.remove(onTick);
      instance.destroy();
      lenisRef.current = null;
      setLenis(null);
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
