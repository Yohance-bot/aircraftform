import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";

import { events, eventCategories } from "../../data/events.js";

gsap.registerPlugin(ScrollTrigger);

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_FORMAT = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
});
const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eventFallsOn(event, day) {
  const start = parseISO(event.date);
  const end = event.endDate ? parseISO(event.endDate) : start;
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return d >= start && d <= end;
}

/** Sorted, upcoming-first list; falls back to showing everything if the
 * "today" clock has drifted past all seeded events. */
function useUpcomingEvents() {
  return useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => parseISO(a.date) - parseISO(b.date),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = sorted.filter((e) => {
      const end = e.endDate ? parseISO(e.endDate) : parseISO(e.date);
      return end >= today;
    });
    return upcoming.length > 0 ? upcoming : sorted;
  }, []);
}

export default function EventsCalendar() {
  const sectionRef = useRef(null);
  const calendarCardRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef({});
  const upcoming = useUpcomingEvents();

  const [viewDate, setViewDate] = useState(() =>
    upcoming[0] ? parseISO(upcoming[0].date) : new Date(),
  );
  const [activeId, setActiveId] = useState(upcoming[0]?.id ?? null);

  useEffect(() => {
    const bgTween = gsap.to("main", {
      "--page-bg": "#0b1420",
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

    gsap.set([calendarCardRef.current, listRef.current], { opacity: 0, y: 30 });
    const reveal = gsap.to([calendarCardRef.current, listRef.current], {
      opacity: 1,
      y: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: "power2.out",
      scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
    });

    return () => {
      bgTween.scrollTrigger?.kill();
      reveal.scrollTrigger?.kill();
    };
  }, []);

  function goMonth(delta) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function selectEvent(event) {
    setActiveId(event.id);
    setViewDate(parseISO(event.date));
    itemRefs.current[event.id]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  function selectDay(day, dayEvents) {
    if (dayEvents.length === 0) return;
    selectEvent(dayEvents[0]);
  }

  const monthLabel = MONTH_FORMAT.format(viewDate);

  const grid = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      const dayEvents = events.filter((e) => eventFallsOn(e, day));
      cells.push({ day, dayEvents, isToday: isSameDay(day, today) });
    }
    return cells;
  }, [viewDate]);

  return (
    <section
      id="events"
      ref={sectionRef}
      className="w-full px-5 py-28 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.3em] text-white/50">
          What's Coming Up
        </p>
        <h2 className="mt-3 max-w-2xl text-[clamp(1.8rem,4vw,3rem)] font-extrabold leading-[1.15] text-white">
          Workshops, camps &amp; competitions on the calendar.
        </h2>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          {/* Calendar grid */}
          <div
            ref={calendarCardRef}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{monthLabel}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  aria-label="Previous month"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  aria-label="Next month"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-7 gap-y-2 text-center">
              {WEEKDAYS.map((w, i) => (
                <span
                  key={`${w}-${i}`}
                  className="text-[11px] font-semibold uppercase tracking-wide text-white/35"
                >
                  {w}
                </span>
              ))}

              {grid.map((cell, i) => {
                if (!cell) return <span key={`empty-${i}`} />;
                const { day, dayEvents, isToday } = cell;
                const hasEvents = dayEvents.length > 0;
                const isActive = dayEvents.some((e) => e.id === activeId);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => selectDay(day, dayEvents)}
                    disabled={!hasEvents}
                    title={dayEvents.map((e) => e.title).join(", ")}
                    className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm transition-colors sm:h-10 sm:w-10 ${
                      isActive
                        ? "bg-brand-500 font-bold text-white"
                        : hasEvents
                          ? "font-semibold text-white hover:bg-white/10"
                          : "text-white/40"
                    } ${isToday && !isActive ? "ring-1 ring-white/40" : ""}`}
                  >
                    {day.getDate()}
                    {hasEvents && !isActive && (
                      <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-400" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-5">
              {Object.entries(eventCategories).map(([key, cat]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/50"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.label}
                </span>
              ))}
            </div>
          </div>

          {/* Agenda list */}
          <div
            ref={listRef}
            className="flex max-h-[560px] flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[600px]"
          >
            {upcoming.map((event) => {
              const cat = eventCategories[event.category];
              const active = event.id === activeId;
              const start = parseISO(event.date);
              const dateLabel = event.endDate
                ? `${DAY_FORMAT.format(start)} – ${DAY_FORMAT.format(parseISO(event.endDate))}`
                : DAY_FORMAT.format(start);

              return (
                <button
                  key={event.id}
                  ref={(el) => (itemRefs.current[event.id] = el)}
                  type="button"
                  onClick={() => selectEvent(event)}
                  className={`group flex items-start gap-4 rounded-2xl border p-4 text-left transition-all sm:p-5 ${
                    active
                      ? "border-brand-500/60 bg-brand-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex w-16 flex-shrink-0 flex-col items-center rounded-xl bg-white/5 py-2 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-white/50">
                      {start.toLocaleDateString("en-IN", { month: "short" })}
                    </span>
                    <span className="text-2xl font-black text-white">
                      {start.getDate()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          backgroundColor: `${cat.color}22`,
                          color: cat.color,
                        }}
                      >
                        {cat.label}
                      </span>
                      <span className="text-xs text-white/40">{dateLabel}</span>
                    </div>
                    <h4 className="mt-1.5 truncate text-base font-bold text-white sm:text-lg">
                      {event.title}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-sm text-white/60">
                      {event.blurb}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {event.time}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
