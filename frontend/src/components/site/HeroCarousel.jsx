import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { heroSlides } from "../../data/heroSlides.js";

const INTERVAL = 6000;
const TRANSITION = { duration: 0.7, ease: [0.32, 0.72, 0, 1] };

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState(1);
  const timer = useRef(null);
  const touchStart = useRef(null);

  const count = heroSlides.length;
  const slide = heroSlides[index];

  const go = useCallback(
    (dir) => {
      setDirection(dir);
      setIndex((prev) => (prev + dir + count) % count);
    },
    [count],
  );

  const goTo = useCallback(
    (i) => {
      setDirection(i > index ? 1 : -1);
      setIndex(i);
    },
    [index],
  );

  useEffect(() => {
    if (paused) return undefined;
    timer.current = setInterval(() => go(1), INTERVAL);
    return () => clearInterval(timer.current);
  }, [paused, go]);

  // preload next image
  useEffect(() => {
    const next = (index + 1) % count;
    const img = new Image();
    img.src = heroSlides[next].image;
  }, [index, count]);

  function onTouchStart(e) {
    touchStart.current = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (touchStart.current == null) return;
    const diff = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(diff) > 50) go(diff < 0 ? 1 : -1);
    touchStart.current = null;
  }

  function onKeyDown(e) {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  }

  const variants = {
    enter: (d) => ({ opacity: 0, scale: 1.06, x: d > 0 ? "3%" : "-3%" }),
    center: { opacity: 1, scale: 1, x: 0 },
    exit: (d) => ({ opacity: 0, scale: 1.02, x: d > 0 ? "-3%" : "3%" }),
  };

  return (
    <section
      className="relative w-full overflow-hidden bg-ink"
      style={{ height: "clamp(50vh, 85vh, 92vh)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured products"
    >
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={slide.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={TRANSITION}
          className="absolute inset-0"
        >
          <Link
            to={slide.link}
            className="block h-full w-full"
            aria-label={slide.alt}
          >
            <img
              src={slide.image}
              alt={slide.alt}
              className="h-full w-full object-cover object-top"
              draggable={false}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
          </Link>
        </motion.div>
      </AnimatePresence>

      {/* gradient vignette for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />

      {/* prev / next arrows */}
      <button
        type="button"
        onClick={() => go(-1)}
        className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white/80 backdrop-blur transition-all hover:bg-black/50 hover:text-white sm:left-5 sm:p-3"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white/80 backdrop-blur transition-all hover:bg-black/50 hover:text-white sm:right-5 sm:p-3"
        aria-label="Next slide"
      >
        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

      {/* pagination dots */}
      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2 sm:bottom-7">
        {heroSlides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            className={`group relative h-2.5 rounded-full transition-all duration-500 ${
              i === index ? "w-9 bg-white" : "w-2.5 bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Go to slide ${i + 1}: ${s.alt}`}
            aria-current={i === index ? "true" : undefined}
          >
            {i === index && !paused && (
              <span
                className="absolute inset-0 origin-left rounded-full bg-white/60"
                style={{
                  animation: `hero-progress ${INTERVAL}ms linear`,
                }}
              />
            )}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes hero-progress {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </section>
  );
}
