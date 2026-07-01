import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const PILLARS = [
  {
    num: "01",
    title: "School STEM Workshops",
    desc: "We bring aeromodelling directly to your school. Students build and fly gliders, RC planes and simple drones in a single hands-on session. Aligned with NEP 2020's focus on experiential learning.",
  },
  {
    num: "02",
    title: "Summer Flying Camps",
    desc: "5-day intensive camps in Bengaluru. Students progress from paper planes to rubber-powered aircraft to RC builds. Age groups: 8-12 and 13-17.",
  },
  {
    num: "03",
    title: "FPV & Drone Training",
    desc: "From simulator practice to real flight. Learn throttle control, obstacle navigation, and basic drone maintenance. Certification on completion.",
  },
  {
    num: "04",
    title: "RC Plane Building Programs",
    desc: "Multi-session deep dives into balsa construction, covering wing theory, motor mounting, and maiden flight. For students who want to go further.",
  },
  {
    num: "05",
    title: "Events & Competitions",
    desc: "We organise and participate in inter-school aeromodelling competitions, science fairs, and STEM expos across Bengaluru and beyond.",
  },
];

export default function WhatWeOffer() {
  const sectionRef = useRef(null);
  const rowRefs = useRef([]);

  useEffect(() => {
    const bgTween = gsap.to("main", {
      "--page-bg": "#1a1208",
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

    rowRefs.current.forEach((row, i) => {
      if (!row) return;
      const numEl = row.querySelector(".pillar-num");
      const contentEl = row.querySelector(".pillar-content");
      gsap.set(contentEl, { opacity: 0, x: 40 });

      const counter = { val: 0 };
      ScrollTrigger.create({
        trigger: row,
        start: "top 80%",
        onEnter: () => {
          gsap.to(counter, {
            val: i + 1,
            duration: 0.6,
            delay: i * 0.15,
            ease: "power1.out",
            onUpdate: () => {
              numEl.textContent = String(Math.floor(counter.val)).padStart(2, "0");
            },
          });
          gsap.to(contentEl, {
            opacity: 1,
            x: 0,
            duration: 0.7,
            delay: i * 0.15,
            ease: "power2.out",
          });
        },
        once: true,
      });
    });

    return () => bgTween.scrollTrigger?.kill();
  }, []);

  return (
    <section id="programs" ref={sectionRef} className="w-full px-5 py-28 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-14 text-sm uppercase tracking-[0.3em] text-white/50">
          What We Offer
        </h2>
        {PILLARS.map((p, i) => (
          <div
            key={p.num}
            ref={(el) => (rowRefs.current[i] = el)}
            className="group flex items-start gap-6 border-b border-white/10 py-8 transition-all duration-300 hover:py-10 sm:gap-10"
          >
            <span className="pillar-num w-16 flex-shrink-0 text-[clamp(2rem,4vw,3rem)] font-black text-white/25 sm:w-24">
              00
            </span>
            <div className="pillar-content">
              <h3 className="relative inline-block text-[clamp(1.3rem,2.5vw,2rem)] font-bold text-white">
                {p.title}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-brand-500 transition-all duration-500 group-hover:w-full" />
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-white/60 sm:text-base">
                {p.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
