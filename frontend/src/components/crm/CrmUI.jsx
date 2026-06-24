// Shared CRM UI primitives: badges, charts, helpers.
// Dependency-free SVG/CSS charts keep the build lean (no chart lib installed).

export const HEAT_STYLES = {
  hot: { bg: "bg-red-100", text: "text-red-700", dot: "#ef4444", label: "Hot" },
  warm: { bg: "bg-amber-100", text: "text-amber-700", dot: "#f59e0b", label: "Warm" },
  cold: { bg: "bg-slate-100", text: "text-slate-600", dot: "#94a3b8", label: "Cold" },
};

export const STATUS_STYLES = {
  new: { bg: "bg-blue-100", text: "text-blue-700", label: "New" },
  engaged: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Engaged" },
  follow_up_needed: { bg: "bg-orange-100", text: "text-orange-700", label: "Follow-up" },
  converted: { bg: "bg-green-100", text: "text-green-700", label: "Converted" },
  dead: { bg: "bg-slate-200", text: "text-slate-500", label: "Dead" },
};

export const BUCKET_STYLES = {
  kits: { bg: "bg-purple-100", text: "text-purple-700", label: "Kits" },
  camps: { bg: "bg-teal-100", text: "text-teal-700", label: "Camps" },
  unclassified: { bg: "bg-slate-100", text: "text-slate-500", label: "Unclassified" },
};

export const SENTIMENT_STYLES = {
  positive: { bg: "bg-green-100", text: "text-green-700", label: "Positive" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600", label: "Neutral" },
  negative: { bg: "bg-red-100", text: "text-red-700", label: "Negative" },
};

export const LABELS = {
  source: {
    instagram: "Instagram",
    website: "Website",
    referral: "Referral",
    walk_in: "Walk-in",
    facebook: "Facebook",
    school_visit: "School Visit",
    other: "Other",
  },
};

function Pill({ style, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {children}
    </span>
  );
}

export function HeatBadge({ category, score }) {
  const s = HEAT_STYLES[category] || HEAT_STYLES.cold;
  return (
    <Pill style={s}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
      {score !== undefined && <span className="opacity-70">· {score}</span>}
    </Pill>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.new;
  return <Pill style={s}>{s.label}</Pill>;
}

export function BucketBadge({ bucket }) {
  const s = BUCKET_STYLES[bucket] || BUCKET_STYLES.unclassified;
  return <Pill style={s}>{s.label}</Pill>;
}

export function SentimentBadge({ sentiment }) {
  if (!sentiment) return null;
  const s = SENTIMENT_STYLES[sentiment] || SENTIMENT_STYLES.neutral;
  return <Pill style={s}>{s.label}</Pill>;
}

export function Tag({ children }) {
  return (
    <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 border border-brand-100">
      {children}
    </span>
  );
}

export function relativeTime(ts) {
  if (!ts) return "—";
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export function EmptyState({ icon = "✈️", title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 font-semibold text-slate-700">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
    </div>
  );
}

// --- Charts (no external deps) --------------------------------------------

export function BarChart({ data, color = "#0E90F1", height = 140, valueKey = "value", labelKey = "date" }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const h = ((d[valueKey] || 0) / max) * (height - 20);
        const label = d[labelKey];
        const short = typeof label === "string" && label.includes("-")
          ? new Date(label).toLocaleDateString(undefined, { day: "numeric", month: "short" })
          : label;
        return (
          <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1">
            <div className="text-[10px] font-semibold text-slate-500 opacity-0 group-hover:opacity-100">
              {d[valueKey]}
            </div>
            <div
              className="w-full rounded-t transition-all"
              style={{ height: Math.max(2, h), background: color, minWidth: 4 }}
              title={`${short}: ${d[valueKey]}`}
            />
            <div className="truncate text-[9px] text-slate-400" style={{ maxWidth: 28 }}>
              {short}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DONUT_COLORS = ["#0E90F1", "#F97316", "#22c55e", "#8b5cf6", "#ef4444", "#14b8a6", "#eab308"];

export function DonutChart({ data, size = 140 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const radius = size / 2 - 12;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const frac = (d.value || 0) / total;
            const dash = frac * circ;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth={16}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="fill-slate-700" style={{ fontSize: 18, fontWeight: 700 }}>
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="capitalize">{(d.label || "").replace(/_/g, " ")}</span>
            <span className="font-semibold text-slate-800">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RateRing({ value = 0, label, color = "#0E90F1", size = 96 }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" style={{ fontSize: 18, fontWeight: 700, fill: "#334155" }}>
          {pct}%
        </text>
      </svg>
      <span className="text-xs font-medium text-slate-500">{label}</span>
    </div>
  );
}

export function Funnel({ stages }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 flex-shrink-0 text-xs font-medium text-slate-600">{s.stage}</div>
            <div className="h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-aero-400 to-aero-600 px-2 text-xs font-semibold text-white transition-all"
                style={{ width: `${Math.max(8, pct)}%` }}
              >
                {s.count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
