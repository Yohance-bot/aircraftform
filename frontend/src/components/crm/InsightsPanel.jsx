import { useEffect, useState } from "react";

import { fetchInsights } from "../../api.js";
import { BarChart, DonutChart, Skeleton, EmptyState, relativeTime, HeatBadge } from "./CrmUI.jsx";

export default function InsightsPanel({ adminKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchInsights(adminKey)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [adminKey]);

  if (loading) return <div className="grid gap-4 lg:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-56" />)}</div>;
  if (error) return <EmptyState icon="⚠️" title="Couldn't load insights" subtitle={error} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Top Questions" subtitle="Most frequent inbound messages">
        <List items={data.top_questions} render={(q) => (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-slate-600">{q.question}</span>
            <span className="font-semibold text-slate-800">{q.count}</span>
          </div>
        )} empty="No questions yet." />
      </Card>

      <Card title="Knowledge Gaps" subtitle="Repeated questions — candidates for the KB">
        <List items={data.knowledge_gaps} render={(q) => (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-slate-600">{q.question}</span>
            <span className="rounded bg-orange-100 px-1.5 text-xs font-semibold text-orange-700">{q.count}×</span>
          </div>
        )} empty="No gaps detected." />
      </Card>

      <Card title="Most Common Tags">
        {data.common_tags.length ? <DonutChart data={data.common_tags} /> : <EmptyState title="No tags yet" />}
      </Card>

      <Card title="Most Common Sources">
        {data.common_sources.length ? <DonutChart data={data.common_sources} /> : <EmptyState title="No source data" />}
      </Card>

      <Card title="Hot Lead Trend" subtitle="Last 14 days">
        <BarChart data={data.hot_lead_trend} color="#ef4444" />
      </Card>

      <Card title="Inactive Lead Report" subtitle={`Avg response time: ${data.avg_response_minutes == null ? "—" : data.avg_response_minutes + "m"}`}>
        <List items={data.inactive_leads} render={(l) => (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-slate-600">{l.parent_name || l.phone}</span>
            <span className="flex items-center gap-2 text-xs text-slate-400">
              {relativeTime(l.last_activity_at)}
              <span className="font-semibold text-slate-700">{l.heat_score}</span>
            </span>
          </div>
        )} empty="No inactive leads 🎉" />
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      {subtitle && <p className="mb-2 text-xs text-slate-400">{subtitle}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function List({ items, render, empty }) {
  if (!items || items.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="space-y-2">
      {items.map((it, i) => <div key={i} className="border-b border-slate-50 pb-1.5 last:border-0">{render(it)}</div>)}
    </div>
  );
}
