import CountUp from "../site/CountUp.jsx";

const STATS = [
  { value: 500, suffix: "+", label1: "Students", label2: "Trained" },
  { value: 50, suffix: "+", label1: "Schools", label2: "Reached" },
  { value: 12, suffix: "+", label1: "Years", label2: "Flying" },
  { value: 68, suffix: "+", label1: "Products", label2: "In Stock" },
];

export default function StatsBar() {
  return (
    <section
      id="stats"
      className="w-full bg-transparent px-5 py-24 sm:px-10 lg:px-16"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label1} className="text-center">
            <div className="text-[clamp(4rem,8vw,7rem)] font-black leading-none text-white">
              <CountUp value={s.value} />
              <span className="text-brand-500">{s.suffix}</span>
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/50">
              {s.label1}
              <br />
              {s.label2}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
