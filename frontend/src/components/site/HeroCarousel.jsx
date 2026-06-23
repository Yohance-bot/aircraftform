import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { heroSlides } from "../../data/heroSlides.js";

const INTERVAL = 6000;
const TRANSITION = { duration: 0.7, ease: [0.32, 0.72, 0, 1] };

function Dots({ index, paused, onSelect }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {heroSlides.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(i)}
          className={`group relative h-2 rounded-full transition-all duration-500 ${
            i === index ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
          }`}
          aria-label={`Go to slide ${i + 1}: ${s.alt}`}
          aria-current={i === index ? "true" : undefined}
        >
          {i === index && !paused && (
            <span
              className="absolute inset-0 origin-left rounded-full bg-white/60"
              style={{ animation: `hero-progress ${INTERVAL}ms linear` }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState(1);
  const timer = useRef(null);
  const touchStart = useRef(null);
  const reduceMotion = useReducedMotion();

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

  const variants = reduceMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (d) => ({ opacity: 0, scale: 1.04, x: d > 0 ? "2%" : "-2%" }),
        center: { opacity: 1, scale: 1, x: 0 },
        exit: (d) => ({ opacity: 0, scale: 1.01, x: d > 0 ? "-2%" : "2%" }),
      };

  return (
    <section
      className="relative w-full bg-ink md:flex md:h-[85vh] md:max-h-[920px] md:min-h-[520px] md:items-center md:justify-center"
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
      {/* Mobile: full poster, no crop */}
      <div className="relative w-full md:hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={slide.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={TRANSITION}
          >
            <Link to={slide.link} aria-label={slide.alt}>
              <img
                src={slide.image}
                alt={slide.alt}
                width={1448}
                height={1086}
                className="block h-auto w-full"
                draggable={false}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop: full-width poster centred in the viewport */}
      <div className="relative hidden h-full w-full overflow-hidden md:block">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={slide.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={TRANSITION}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Link
              to={slide.link}
              className="flex h-full w-full items-center justify-center"
              aria-label={slide.alt}
            >
              <img
                src={slide.image}
                alt={slide.alt}
                width={1448}
                height={1086}
                className="h-auto w-full max-h-full object-contain"
                draggable={false}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            </Link>
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
      </div>

      {/* Arrows — desktop/tablet only; mobile uses swipe */}
      <button
        type="button"
        onClick={() => go(-1)}
        className="absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/30 p-3 text-white/80 backdrop-blur transition-all hover:bg-black/50 hover:text-white md:block"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/30 p-3 text-white/80 backdrop-blur transition-all hover:bg-black/50 hover:text-white md:block"
        aria-label="Next slide"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Dots — below poster on mobile, overlaid on desktop */}
      <div className="bg-ink px-4 py-3 md:absolute md:inset-x-0 md:bottom-6 md:bg-transparent md:py-0">
        <Dots index={index} paused={paused} onSelect={goTo} />
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
