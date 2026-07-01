import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";

import heroImg from "../../assets/images/home/hero.jpg";
import certificatesImg from "../../assets/images/home/certificates.jpg";
import workshop2Img from "../../assets/images/home/workshop-2.jpg";

gsap.registerPlugin(ScrollTrigger, Flip);

export default function BentoGrid() {
  const sectionRef = useRef(null);
  const tileARef = useRef(null);
  const overlayTextRef = useRef(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const bgTween = gsap.to("main", {
      "--page-bg": "#0f1923",
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top center",
        end: "bottom center",
        scrub: true,
      },
    });

    if (prefersReduced) {
      return () => bgTween.scrollTrigger?.kill();
    }

    let played = false;
    const st = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top center",
      onEnter: () => {
        if (played) return;
        played = true;
        runZoom();
      },
    });

    function runZoom() {
      const tile = tileARef.current;
      const overlay = overlayTextRef.current;
      gsap.delayedCall(1.2, () => {
        const state = Flip.getState(tile);
        gsap.set(tile, {
          position: "fixed",
          inset: 0,
          zIndex: 70,
          width: "100vw",
          height: "100vh",
        });
        Flip.from(state, {
          duration: 0.9,
          ease: "power2.inOut",
          onComplete: () => {
            gsap.to(overlay, { opacity: 1, duration: 0.5 });
            gsap.delayedCall(1.8, () => {
              gsap.to(overlay, {
                opacity: 0,
                duration: 0.4,
                onComplete: () => {
                  const backState = Flip.getState(tile);
                  gsap.set(tile, {
                    position: "static",
                    inset: "auto",
                    zIndex: "auto",
                    width: "100%",
                    height: "100%",
                  });
                  Flip.from(backState, { duration: 0.9, ease: "power2.inOut" });
                },
              });
            });
          },
        });
      });
    }

    return () => {
      st.kill();
      bgTween.scrollTrigger?.kill();
    };
  }, []);

  return (
    <section
      id="bento"
      ref={sectionRef}
      className="relative grid h-[90vh] w-full grid-cols-3 grid-rows-2 gap-1 bg-black p-1"
    >
      <div
        ref={tileARef}
        className="group relative col-span-2 row-span-2 overflow-hidden"
      >
        <img
          src={heroImg}
          alt="Students holding colorful gliders"
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </div>

      <div
        ref={overlayTextRef}
        className="pointer-events-none fixed inset-0 z-[71] flex items-center justify-center opacity-0"
      >
        <span className="text-[clamp(2rem,6vw,4.5rem)] font-extrabold text-white drop-shadow-lg">
          12+ years of flight
        </span>
      </div>

      <div className="group relative col-span-1 row-span-1 overflow-hidden">
        <img
          src={certificatesImg}
          alt="Ryan International certificates"
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </div>

      <div className="group relative col-span-1 row-span-1 overflow-hidden">
        <img
          src={workshop2Img}
          alt="Cambridge School outdoor group workshop"
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </div>
    </section>
  );
}
