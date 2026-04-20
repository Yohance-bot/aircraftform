import { useMemo } from "react";

/**
 * Animated background sky.
 *
 * Props:
 *   progress       0..1  — fraction of the form that's filled in. Controls
 *                           how many planes are in the air and how fast they
 *                           take off.
 *   celebrationKey number — bumped by the parent to trigger a one-shot
 *                           "celebration" plane on successful submission.
 *                           Each new key value mounts a fresh animation.
 *
 * All keyframes + per-element tuning live in the <style> block below so
 * the whole effect is self-contained in one file.
 */
export default function PlaneSky({ progress = 0, celebrationKey = 0 }) {
  const p = Math.max(0, Math.min(1, progress));

  // Plane count: 1 at p=0, 2 from ~33% fill, 3 from ~66% fill.
  const planeCount = p >= 0.66 ? 3 : p >= 0.33 ? 2 : 1;

  // Takeoff duration eases from 14s (empty) → 6s (full).
  const baseDuration = 14 - p * 8;

  // Stable small jitter per mount so planes never feel synced.
  const jitter = useMemo(() => [0.12, 0.47, 0.83], []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <PlaneSkyStyles />

      {/* Sunrise wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 500px at 85% -10%, rgba(253,186,116,0.55), transparent 60%), radial-gradient(900px 500px at -10% 10%, rgba(251,191,128,0.35), transparent 60%)",
        }}
      />

      {/* Clouds */}
      {CLOUDS.map((c, i) => (
        <Cloud key={i} {...c} />
      ))}

      {/* Active fleet */}
      {Array.from({ length: planeCount }).map((_, i) => {
        const slot = PLANE_SLOTS[i % PLANE_SLOTS.length];
        // Negative animation-delay positions the plane mid-flight on mount,
        // and the per-slot launchFrac + jitter keeps them from ever syncing.
        const delay = -((slot.launchFrac + jitter[i % jitter.length]) % 1) * baseDuration;
        return (
          <PaperPlane
            key={`p-${i}-${planeCount}-${baseDuration.toFixed(2)}`}
            slot={slot}
            duration={baseDuration}
            delay={delay}
            scale={slot.scale}
            color={i % 2 === 0 ? "#F97316" : "#FB8A3C"}
          />
        );
      })}

      {/* One-shot celebration plane */}
      {celebrationKey > 0 && (
        <CelebrationPlane key={`celeb-${celebrationKey}`} />
      )}

      {/* Runway with progressive tick lights + pulsing fill */}
      <Runway progress={p} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tuning data                                                        */
/* ------------------------------------------------------------------ */

// top, scale, opacity, duration (s), startOffset (0..1 of duration),
// bobAmp (px), bobPeriod (s), bobDelay (s).
// Offsets are picked to spread the clouds across the track so there's always
// at least one visible on screen.
const CLOUDS = [
  { top: "8%",  scale: 1.20, opacity: 0.80, dur: 110, startOffset: 0.05, bobAmp: 4, bobPer: 5.2, bobDelay: 0.0 },
  { top: "22%", scale: 0.72, opacity: 0.62, dur: 75,  startOffset: 0.35, bobAmp: 3, bobPer: 4.1, bobDelay: 1.2 },
  { top: "40%", scale: 1.40, opacity: 0.68, dur: 140, startOffset: 0.55, bobAmp: 5, bobPer: 6.0, bobDelay: 0.8 },
  { top: "58%", scale: 0.88, opacity: 0.85, dur: 90,  startOffset: 0.78, bobAmp: 4, bobPer: 4.7, bobDelay: 2.0 },
  { top: "74%", scale: 1.05, opacity: 0.72, dur: 120, startOffset: 0.92, bobAmp: 6, bobPer: 5.6, bobDelay: 0.4 },
];

// Three distinct trajectory "slots". Angles come out to ≈28°–42° once
// rendered because Δy (vh) is close to Δx (vw) on common viewports, and the
// tilts are chosen to match the visual flight path.
const PLANE_SLOTS = [
  {
    // gentle climb (~28°)
    yStart: 62, yEnd: -6,
    tiltStart: -6, tiltEnd: -26,
    wobbleAmp: 5, wobblePer: 2.4, wobbleDelay: 0,
    launchFrac: 0.00,
    scale: 1.00,
  },
  {
    // steep climb (~42°)
    yStart: 78, yEnd: -14,
    tiltStart: -4, tiltEnd: -40,
    wobbleAmp: 7, wobblePer: 2.7, wobbleDelay: 0.9,
    launchFrac: 0.40,
    scale: 1.10,
  },
  {
    // mid climb (~34°)
    yStart: 58, yEnd: -10,
    tiltStart: -5, tiltEnd: -32,
    wobbleAmp: 4, wobblePer: 2.1, wobbleDelay: 1.5,
    launchFrac: 0.72,
    scale: 0.92,
  },
];

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function Cloud({ top, scale, opacity, dur, startOffset, bobAmp, bobPer, bobDelay }) {
  return (
    <div
      className="absolute left-0"
      style={{
        top,
        opacity,
        width: 200 * scale,
        animation: `cloud-drift ${dur}s linear infinite`,
        animationDelay: `-${(startOffset * dur).toFixed(2)}s`,
        filter: "drop-shadow(0 8px 10px rgba(180, 68, 8, 0.08))",
        willChange: "transform",
      }}
    >
      {/* Inner wrapper carries the subtle vertical bob so it stacks
          cleanly on top of the horizontal drift. */}
      <div
        style={{
          animation: `cloud-bob ${bobPer}s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
          animationDelay: `-${bobDelay}s`,
          ["--bob-amp"]: `${bobAmp}px`,
        }}
      >
        <svg viewBox="0 0 200 80" fill="white" style={{ display: "block", width: "100%" }}>
          <ellipse cx="50"  cy="50" rx="40" ry="24" />
          <ellipse cx="90"  cy="38" rx="34" ry="28" />
          <ellipse cx="130" cy="48" rx="36" ry="22" />
          <ellipse cx="160" cy="54" rx="28" ry="18" />
        </svg>
      </div>
    </div>
  );
}

function PaperPlane({ slot, duration, delay, scale = 1, color = "#F97316" }) {
  const style = {
    animation: `plane-takeoff ${duration}s cubic-bezier(0.42, 0.02, 0.64, 0.94) infinite`,
    animationDelay: `${delay}s`,
    ["--y-start"]: `${slot.yStart}vh`,
    ["--y-end"]: `${slot.yEnd}vh`,
    ["--tilt-start"]: `${slot.tiltStart}deg`,
    ["--tilt-end"]: `${slot.tiltEnd}deg`,
    willChange: "transform, opacity",
  };

  const wobbleStyle = {
    animation: `plane-wobble ${slot.wobblePer}s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
    animationDelay: `-${slot.wobbleDelay}s`,
    ["--wobble-amp"]: `${slot.wobbleAmp}px`,
  };

  return (
    <div className="absolute left-0 top-0" style={style}>
      <div style={wobbleStyle}>
        <PlaneSvg color={color} scale={scale} />
      </div>
    </div>
  );
}

function CelebrationPlane() {
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        animation: "plane-celebrate 4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        willChange: "transform, opacity, filter",
      }}
    >
      <div
        style={{
          animation: "plane-wobble 2.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite",
          ["--wobble-amp"]: "6px",
          filter:
            "drop-shadow(0 0 18px rgba(249, 115, 22, 0.75)) drop-shadow(0 0 36px rgba(249, 115, 22, 0.35))",
        }}
      >
        <PlaneSvg color="#F97316" scale={1.3} />
      </div>
    </div>
  );
}

function PlaneSvg({ color = "#F97316", scale = 1 }) {
  return (
    <svg
      width={64 * scale}
      height={64 * scale}
      viewBox="0 0 64 64"
      style={{ display: "block", filter: "drop-shadow(0 6px 8px rgba(180, 68, 8, 0.25))" }}
    >
      <g
        stroke={color}
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 8"
        fill="none"
        style={{
          animation: "plane-trail 1.2s linear infinite",
        }}
      >
        <path d="M-40 44 L10 34" />
        <path d="M-30 54 L8 46" />
      </g>
      <path d="M6 34 L58 10 L40 56 L32 40 L6 34 Z" fill={color} />
      <path d="M32 40 L40 56 L44 34 Z" fill="rgba(0,0,0,0.18)" />
    </svg>
  );
}

function Runway({ progress }) {
  const TICKS = 24;
  const litCount = Math.round(progress * TICKS);
  return (
    <div className="absolute bottom-16 left-0 right-0 px-8">
      <div className="relative h-[14px]">
        {/* Dashed baseline */}
        <div
          className="absolute inset-x-0 top-[6px] h-[2px] opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(180, 68, 8, 0.35) 0 12px, transparent 12px 28px)",
            backgroundSize: "28px 2px",
            backgroundRepeat: "repeat-x",
          }}
        />

        {/* Progressive orange fill with a subtle pulse. */}
        <div
          className="absolute top-[5px] left-0 h-[4px] rounded-full bg-brand-500"
          style={{
            width: `${progress * 100}%`,
            transition: "width 700ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            animation: "runway-pulse 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />

        {/* Tick lights, flex-spread so the whole bar is covered regardless
            of viewport width (roughly one tick every 50–70px on typical
            screens). */}
        <div className="absolute inset-x-0 top-0 h-full flex items-center justify-between">
          {Array.from({ length: TICKS }).map((_, i) => {
            const lit = i < litCount;
            return (
              <span
                key={i}
                className="block w-[2px] h-[10px] rounded-full"
                style={{
                  background: lit
                    ? "rgba(249, 115, 22, 0.95)"
                    : "rgba(180, 68, 8, 0.20)",
                  boxShadow: lit ? "0 0 6px rgba(249, 115, 22, 0.7)" : "none",
                  transition:
                    "background-color 400ms cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 400ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

function PlaneSkyStyles() {
  return (
    <style>{`
      @keyframes cloud-drift {
        from { transform: translateX(-25vw); }
        to   { transform: translateX(125vw); }
      }
      @keyframes cloud-bob {
        0%, 100% { transform: translateY(calc(var(--bob-amp, 4px) * -0.5)); }
        50%      { transform: translateY(calc(var(--bob-amp, 4px) *  0.5)); }
      }
      @keyframes plane-takeoff {
        0% {
          transform: translate(-12vw, var(--y-start, 60vh)) rotate(var(--tilt-start, -6deg));
          opacity: 0;
        }
        8%   { opacity: 0.95; }
        92%  { opacity: 0.9; }
        100% {
          transform: translate(122vw, var(--y-end, -10vh)) rotate(var(--tilt-end, -28deg));
          opacity: 0;
        }
      }
      @keyframes plane-wobble {
        0%, 100% { transform: translateY(calc(var(--wobble-amp, 6px) * -0.5)); }
        50%      { transform: translateY(calc(var(--wobble-amp, 6px) *  0.5)); }
      }
      @keyframes plane-trail {
        from { transform: translateX(0); }
        to   { transform: translateX(-40px); }
      }
      @keyframes plane-celebrate {
        0% {
          transform: translate(-15vw, 70vh) rotate(-2deg) scale(1);
          opacity: 0;
        }
        12% { opacity: 1; }
        55% {
          transform: translate(55vw, 18vh) rotate(-30deg) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(125vw, -20vh) rotate(-44deg) scale(1);
          opacity: 0;
        }
      }
      @keyframes runway-pulse {
        0%, 100% { opacity: 0.8; }
        50%      { opacity: 1.0; }
      }

      @media (prefers-reduced-motion: reduce) {
        /* Still show the fleet but kill the continuous motion so the UI
           is comfortable for users who ask for less movement. */
        .pointer-events-none [style*="plane-takeoff"],
        .pointer-events-none [style*="plane-wobble"],
        .pointer-events-none [style*="plane-celebrate"],
        .pointer-events-none [style*="plane-trail"],
        .pointer-events-none [style*="cloud-drift"],
        .pointer-events-none [style*="cloud-bob"],
        .pointer-events-none [style*="runway-pulse"] {
          animation: none !important;
        }
      }
    `}</style>
  );
}
