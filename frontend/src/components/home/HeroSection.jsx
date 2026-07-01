import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import SplitType from "split-type";

export default function HeroSection() {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const headingRef = useRef(null);
  const labelRef = useRef(null);
  const subRef = useRef(null);
  const ctaRef = useRef(null);
  const [posterOnly, setPosterOnly] = useState(false);

  // On slow mobile connections, if the video hasn't started playing within
  // 3s, fall back to the poster image permanently.
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile) return undefined;
    const video = videoRef.current;
    let settled = false;
    const markReady = () => {
      settled = true;
    };
    video?.addEventListener("playing", markReady);
    const timer = setTimeout(() => {
      if (!settled) setPosterOnly(true);
    }, 3000);
    return () => {
      clearTimeout(timer);
      video?.removeEventListener("playing", markReady);
    };
  }, []);

  useEffect(() => {
    document.body.style.setProperty("--page-bg", "#0a0a0a");

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced) {
      gsap.set(
        [labelRef.current, headingRef.current, subRef.current, ctaRef.current],
        { opacity: 1, y: 0 },
      );
      return undefined;
    }

    const split = new SplitType(headingRef.current, { types: "chars" });

    gsap.set(split.chars, { opacity: 0, y: 60, rotateX: -40 });
    gsap.set([labelRef.current, subRef.current, ctaRef.current], {
      opacity: 0,
      y: 20,
    });

    const tl = gsap.timeline({ delay: 0.2 });
    tl.to(labelRef.current, { opacity: 1, y: 0, duration: 0.5 })
      .to(
        split.chars,
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          duration: 0.8,
          stagger: 0.025,
          ease: "power3.out",
        },
        0.3,
      )
      .to(subRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" })
      .to(ctaRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.3");

    return () => {
      tl.kill();
      split.revert();
    };
  }, []);

  return (
    <section
      id="hero"
      ref={rootRef}
      className="relative flex h-screen w-full items-end overflow-hidden"
    >
      <div className="absolute inset-0 h-full w-full">
        {!posterOnly ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster="/videos/hero-poster.jpg"
            onError={() => setPosterOnly(true)}
          >
            <source src="/videos/hero-reel.mp4" type="video/mp4" />
          </video>
        ) : (
          <img
            src="/videos/hero-poster.jpg"
            alt="AMC Airmodelcrafts students with gliders"
            className="absolute inset-0 h-full w-full object-cover object-[center_top]"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.7) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full px-5 pb-24 sm:px-10 sm:pb-28 lg:px-16">
        <p
          ref={labelRef}
          className="text-xs uppercase tracking-[0.3em] text-white/70"
        >
          Bengaluru · Since 2012
        </p>
        <h1
          ref={headingRef}
          className="mt-4 max-w-[700px] text-[clamp(2.2rem,6vw,4.5rem)] font-extrabold leading-[1.1] text-white"
        >
          Where India learns to build, fly and never look down.
        </h1>
        <p ref={subRef} className="mt-4 max-w-[500px] text-base text-white/80">
          Hands-on aeromodelling workshops, summer camps, school STEM programs
          and drone training — for curious minds of every age.
        </p>
        <div ref={ctaRef} className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="#programs"
            className="rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
          >
            Explore Our Programs
          </a>
          <a
            href="/"
            className="rounded-full border border-white/70 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            Shop Products →
          </a>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2 text-white/70">
        <span className="text-[11px] uppercase tracking-[0.2em]">
          Scroll to explore
        </span>
        <span className="animate-bounce text-lg">↓</span>
      </div>
    </section>
  );
}
