import { useEffect, useState } from "react";
import { ArrowLeft, Megaphone, MousePointerClick, Trash2 } from "lucide-react";

import {
  fetchCampaigns,
  fetchCampaign,
  fetchCampaignClicks,
  deleteCampaign,
} from "../../api.js";
import { Skeleton, EmptyState, RateRing, relativeTime } from "./CrmUI.jsx";

export default function CampaignAnalyticsPanel({ adminKey }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setCampaigns(await fetchCampaigns(adminKey));
    } catch (e) {
      setError(e.message || "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [adminKey]); // eslint-disable-line

  if (selected) {
    return <CampaignDetail adminKey={adminKey} id={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="text-brand-500" size={20} />
        <h2 className="text-lg font-bold text-slate-800">Campaign Analytics</h2>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : campaigns.length === 0 ? (
        <EmptyState icon="📣" title="No campaigns yet" subtitle="Every broadcast and drip you send is recorded here automatically." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Delivered</th>
                <th className="px-4 py-3 text-right">Read</th>
                <th className="px-4 py-3 text-right">Replied</th>
                <th className="px-4 py-3 text-right">Conv.</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c.id)} className="cursor-pointer border-b border-slate-50 hover:bg-brand-50/40">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{c.type}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.sent}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.delivered}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.read}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.replied}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.converted}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{relativeTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function CampaignDetail({ adminKey, id, onBack }) {
  const [data, setData] = useState(null);
  const [clicks, setClicks] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchCampaign(adminKey, id), fetchCampaignClicks(adminKey, id)])
      .then(([d, c]) => { if (active) { setData(d); setClicks(c); } })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [adminKey, id]);

  async function remove() {
    if (!window.confirm("Delete this campaign and its analytics?")) return;
    await deleteCampaign(adminKey, id);
    onBack();
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>;
  if (!data) return <EmptyState icon="⚠️" title="Campaign not found" />;

  const m = data.metrics;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"><ArrowLeft size={16} /> All campaigns</button>
        <button onClick={remove} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /> Delete</button>
      </div>

      <h2 className="text-xl font-bold text-slate-800">{data.campaign.name}</h2>
      <p className="mb-4 text-xs text-slate-400">{data.campaign.type} · {relativeTime(data.campaign.created_at)}</p>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <MetricCard label="Sent" value={m.sent} />
        <MetricCard label="Delivered" value={m.delivered} />
        <MetricCard label="Read" value={m.read} />
        <MetricCard label="Failed" value={m.failed} />
        <MetricCard label="Replied" value={m.replied} />
        <MetricCard label="Forms" value={m.forms_filled} />
        <MetricCard label="Converted" value={m.converted} />
      </div>

      {/* Rate rings */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4 lg:grid-cols-5">
        <RateRing value={m.delivery_rate} label="Delivery rate" color="#0E90F1" />
        <RateRing value={m.read_rate} label="Read rate" color="#22c55e" />
        <RateRing value={m.reply_rate} label="Reply rate" color="#a855f7" />
        <RateRing value={m.conversion_rate} label="Conversion" color="#f59e0b" />
        <RateRing value={m.ctr} label="Click-through" color="#ec4899" />
      </div>

      {/* Click tracking */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <MousePointerClick size={16} className="text-pink-500" />
          <h3 className="text-sm font-semibold text-slate-700">Link Clicks</h3>
        </div>
        <div className="mb-3 flex gap-6 text-sm">
          <span className="text-slate-600">Total: <b>{clicks?.total_clicks ?? 0}</b></span>
          <span className="text-slate-600">Unique: <b>{clicks?.unique_clicks ?? 0}</b></span>
          <span className="text-slate-600">CTR: <b>{clicks?.ctr ?? 0}%</b></span>
        </div>
        {clicks?.clicks?.length ? (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {clicks.clicks.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                <span className="text-slate-600">{c.phone || "anonymous"}</span>
                <span className="text-slate-400">{relativeTime(c.clicked_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No clicks recorded. Links are tracked automatically when your message contains a URL.</p>
        )}
      </div>

      {/* Recipients */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Recipients ({data.recipients.length})</h3>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase text-slate-400">
                <th className="py-1.5">Phone</th><th className="py-1.5">Status</th><th className="py-1.5">Sent</th>
              </tr>
            </thead>
            <tbody>
              {data.recipients.map((r, i) => (
                <tr key={i} className="border-t border-slate-50">
                  <td className="py-1.5 text-slate-700">{r.phone}</td>
                  <td className="py-1.5"><StatusDot status={r.status} /></td>
                  <td className="py-1.5 text-xs text-slate-400">{relativeTime(r.sent_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const STATUS_COLOR = {
  sent: "bg-slate-100 text-slate-600",
  delivered: "bg-blue-100 text-blue-700",
  read: "bg-green-100 text-green-700",
  replied: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
};

function StatusDot({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>{status}</span>;
}
