import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import galleryCollage from "../../assets/images/home/gallery-collage.jpg";
import workshop1 from "../../assets/images/home/workshop-1.jpg";
import workshop2 from "../../assets/images/home/workshop-2.jpg";
import kitProduct from "../../assets/images/home/kit-product.jpg";
import certificates from "../../assets/images/home/certificates.jpg";

gsap.registerPlugin(ScrollTrigger);

const PANELS = [
  {
    width: "60vw",
    type: "image",
    src: galleryCollage,
    label: "Inside the Classroom",
  },
  {
    width: "35vw",
    type: "image",
    src: workshop1,
    label: "Cambridge School, Bengaluru",
    tallCrop: true,
  },
  {
    width: "50vw",
    type: "stat",
    dark: true,
    stat: "500+",
    caption: "Students trained across Bengaluru's top schools.",
  },
  {
    width: "45vw",
    type: "image",
    src: workshop2,
    label: "The moment they fly it themselves",
  },
  {
    width: "40vw",
    type: "image",
    src: kitProduct,
    label: "Duo Blast Glider Kit — ₹299",
  },
  {
    width: "55vw",
    type: "image",
    src: certificates,
    label: "Ryan International — District Champions",
  },
  {
    width: "40vw",
    type: "words",
    dark: true,
    words: ["BUILD.", "FLY.", "REPEAT."],
  },
];

export default function HorizontalGallery() {
  const wrapperRef = useRef(null);
  const trackRef = useRef(null);
  const imgRefs = useRef([]);
  const [scrolling, setScrolling] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (isMobile || prefersReduced) {
      gsap.set(imgRefs.current, { scale: 1 });
      return undefined;
    }

    const track = trackRef.current;
    gsap.set(imgRefs.current, { scale: 1.1 });

    // scrub:true (not a number) keeps this 1:1 with scroll position — Lenis
    // already supplies the eased/lagged feel on the input side, so stacking
    // ScrollTrigger's own catch-up lag on top only adds perceptible latency.
    const st = ScrollTrigger.create({
      trigger: wrapperRef.current,
      start: "top top",
      end: () => `+=${track.scrollWidth - window.innerWidth}`,
      pin: true,
      scrub: true,
      onUpdate: (self) => {
        setScrolling(self.progress > 0.005);
        gsap.set(track, {
          x: -(self.progress * (track.scrollWidth - window.innerWidth)),
        });
      },
    });

    const imageTweens = imgRefs.current
      .filter(Boolean)
      .map((img) =>
        gsap.to(img, {
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: img,
            containerAnimation: st.animation,
            start: "left 90%",
            end: "left 30%",
            scrub: true,
          },
        }),
      );

    return () => {
      imageTweens.forEach((tw) => tw.scrollTrigger?.kill());
      st.kill();
    };
  }, [isMobile]);

  return (
    <section
      id="gallery"
      ref={wrapperRef}
      className="horizontal-wrapper relative h-screen w-full overflow-hidden bg-black"
    >
      <div
        ref={trackRef}
        className="horizontal-track flex h-full w-full flex-col md:h-full md:w-max md:flex-row md:flex-nowrap"
      >
        {PANELS.map((panel, i) => (
          <div
            key={i}
            style={{ width: isMobile ? "100vw" : panel.width }}
            className="relative h-screen flex-shrink-0 overflow-hidden md:h-full"
          >
            {panel.type === "image" && (
              <>
                <img
                  ref={(el) => (imgRefs.current[i] = el)}
                  src={panel.src}
                  alt={panel.label}
                  loading="lazy"
                  className={`h-full w-full object-cover ${panel.tallCrop ? "object-center" : ""}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <span className="absolute bottom-6 left-6 text-lg font-semibold text-white sm:text-xl">
                  {panel.label}
                </span>
              </>
            )}

            {panel.type === "stat" && (
              <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a0a] px-8 text-center">
                <span className="text-[clamp(4rem,12vw,8rem)] font-black text-white">
                  {panel.stat}
                </span>
                <p className="mt-2 max-w-sm text-lg text-white/70">
                  {panel.caption}
                </p>
              </div>
            )}

            {panel.type === "words" && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0a0a0a]">
                {panel.words.map((w) => (
                  <span
                    key={w}
                    className="text-[clamp(2.5rem,7vw,5rem)] font-black text-brand-500"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        className={`pointer-events-none absolute inset-y-0 left-4 z-10 hidden items-center transition-opacity duration-500 md:flex ${
          scrolling ? "opacity-0" : "opacity-70"
        }`}
      >
        <span className="animate-pulse text-3xl text-white">←</span>
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 right-4 z-10 hidden items-center transition-opacity duration-500 md:flex ${
          scrolling ? "opacity-0" : "opacity-70"
        }`}
      >
        <span className="animate-pulse text-3xl text-white">→</span>
      </div>
    </section>
  );
}
