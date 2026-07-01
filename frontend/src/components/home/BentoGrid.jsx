import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import heroImg from "../../assets/images/home/hero.jpg";
import certificatesImg from "../../assets/images/home/certificates.jpg";
import workshop2Img from "../../assets/images/home/workshop-2.jpg";

gsap.registerPlugin(ScrollTrigger);

export default function BentoGrid() {
  const sectionRef = useRef(null);
  const tileRefs = useRef([]);

  useEffect(() => {
    const bgTween = gsap.to("main", {
      "--page-bg": "#0f1923",
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top center",
        end: "bottom center",
        scrub: true,
      },
    });

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      gsap.set(tileRefs.current, { opacity: 1, y: 0 });
      return () => bgTween.scrollTrigger?.kill();
    }

    gsap.set(tileRefs.current, { opacity: 0, y: 40 });
    const fadeIn = gsap.to(tileRefs.current, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: "power2.out",
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 75%",
      },
    });

    return () => {
      fadeIn.scrollTrigger?.kill();
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
        ref={(el) => (tileRefs.current[0] = el)}
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
        ref={(el) => (tileRefs.current[1] = el)}
        className="group relative col-span-1 row-span-1 overflow-hidden"
      >
        <img
          src={certificatesImg}
          alt="Ryan International certificates"
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </div>

      <div
        ref={(el) => (tileRefs.current[2] = el)}
        className="group relative col-span-1 row-span-1 overflow-hidden"
      >
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
