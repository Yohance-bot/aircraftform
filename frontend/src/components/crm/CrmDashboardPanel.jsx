import { useEffect, useState } from "react";
import { Users, Flame, Bell, ClipboardCheck, CreditCard, Timer } from "lucide-react";

import { fetchCrmDashboard } from "../../api.js";
import { BarChart, DonutChart, Funnel, Skeleton, EmptyState } from "./CrmUI.jsx";

export default function CrmDashboardPanel({ adminKey, onOpenFollowups }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchCrmDashboard(adminKey);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [adminKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  if (error) return <EmptyState icon="⚠️" title="Couldn't load dashboard" subtitle={error} />;

  const { today, week, charts } = data;
  const fmtResp = today.avg_response_minutes == null ? "—" : `${today.avg_response_minutes}m`;

  return (
    <div className="space-y-5">
      {/* Today snapshot */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Today</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric icon={Users} accent="#3b82f6" value={today.new_leads} label="New Leads" />
          <Metric icon={Flame} accent="#ef4444" value={today.hot_leads} label="Hot Leads" />
          <Metric icon={Bell} accent="#f59e0b" value={today.followups_due} label="Follow-ups Due" onClick={onOpenFollowups} />
          <Metric icon={ClipboardCheck} accent="#22c55e" value={today.registrations} label="Registrations" />
          <Metric icon={CreditCard} accent="#8b5cf6" value={today.payments} label="Payments" />
          <Metric icon={Timer} accent="#14b8a6" value={fmtResp} label="Avg Response" />
        </div>
      </section>

      {/* This week */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">This Week</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric value={week.conversations} label="Conversations" />
          <Metric value={week.message_volume} label="Message Volume" />
          <Metric value={`${week.conversion_rate}%`} label="Conversion Rate" />
          <Metric value={`${week.dropoff_rate}%`} label="Drop-off Rate" />
        </div>
      </section>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Leads by Day">
          <BarChart data={charts.leads_by_day} />
        </Card>
        <Card title="Conversion Funnel">
          <Funnel stages={charts.funnel} />
        </Card>
        <Card title="Leads by Source">
          {charts.leads_by_source.length ? <DonutChart data={charts.leads_by_source} /> : <EmptyState title="No source data" />}
        </Card>
        <Card title="Bucket Distribution">
          {charts.bucket_distribution.length ? <DonutChart data={charts.bucket_distribution} /> : <EmptyState title="No bucket data" />}
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, accent, value, label, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white p-4 ${onClick ? "cursor-pointer hover:border-brand-300" : ""}`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${accent}1a` }}>
            <Icon size={15} style={{ color: accent }} />
          </span>
        )}
        <span className="text-2xl font-bold text-slate-800">{value}</span>
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-700">{title}</h4>
      {children}
    </div>
  );
}
