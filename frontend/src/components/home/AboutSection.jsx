import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SplitType from "split-type";

gsap.registerPlugin(ScrollTrigger);

const PARAGRAPHS = [
  "AMC Airmodelcrafts has been Bengaluru's home for hands-on aeromodelling since 2012. What started as a passion project has grown into one of India's most active school aeromodelling programs — reaching 500+ students across 50+ schools.",
  "Every workshop is built around doing, not watching. Students design, cut, assemble and fly their own aircraft in a single session. No prior experience needed. No kits left unfinished.",
  "From paper gliders to FPV racing drones — we meet every student exactly where their curiosity is.",
];

export default function AboutSection() {
  const sectionRef = useRef(null);
  const quoteRef = useRef(null);
  const paraRefs = useRef([]);

  useEffect(() => {
    const bgTween = gsap.to("main", {
      "--page-bg": "#111827",
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
    if (prefersReduced) return () => bgTween.scrollTrigger?.kill();

    const split = new SplitType(quoteRef.current, { types: "words" });
    gsap.set(split.words, { opacity: 0, y: 20 });
    gsap.to(split.words, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      stagger: 0.06,
      ease: "power2.out",
      scrollTrigger: {
        trigger: quoteRef.current,
        start: "top 80%",
      },
    });

    gsap.set(paraRefs.current, { opacity: 0, y: 24 });
    gsap.to(paraRefs.current, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      stagger: 0.15,
      ease: "power2.out",
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 65%",
      },
    });

    return () => {
      bgTween.scrollTrigger?.kill();
      split.revert();
    };
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      className="w-full px-5 py-28 sm:px-10 lg:px-16"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-20">
        <p
          ref={quoteRef}
          className="text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-[1.2] text-gray-300"
        >
          "We don't just teach aerodynamics. We give kids something to hold,
          build, and launch themselves."
        </p>
        <div className="flex flex-col gap-6">
          {PARAGRAPHS.map((text, i) => (
            <p
              key={i}
              ref={(el) => (paraRefs.current[i] = el)}
              className="text-base leading-relaxed text-white/75 sm:text-lg"
            >
              {text}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
