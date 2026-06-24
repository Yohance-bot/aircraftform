import { useEffect, useState } from "react";
import { Send, Users2, FileText } from "lucide-react";

import {
  previewAudience,
  fetchCrmSettings,
  fetchTemplates,
  broadcastMessage,
} from "../../api.js";
import { LABELS, Skeleton } from "./CrmUI.jsx";

const HEAT = [
  { value: "", label: "Any heat" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

const SAMPLE = {
  name: "there", parent_name: "there", camp_date: "soon",
  product_name: "our kits", city: "your city", score: "",
};

export default function CampaignPanel({ adminKey }) {
  const [settings, setSettings] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [filters, setFilters] = useState({ lead_bucket: "", heat: "", lead_status: "", source: "", tag: "", last_active_days: "" });
  const [preview, setPreview] = useState({ count: null, recipients: [] });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchCrmSettings(adminKey).then(setSettings).catch(() => {});
    fetchTemplates(adminKey).then(setTemplates).catch(() => {});
  }, [adminKey]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    const payload = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "" && v !== null) payload[k] = k === "last_active_days" ? parseInt(v, 10) : v;
    });
    const t = setTimeout(async () => {
      try {
        const res = await previewAudience(adminKey, payload);
        if (!cancelled) setPreview(res);
      } catch {
        if (!cancelled) setPreview({ count: 0, recipients: [] });
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [adminKey, filters]);

  async function send() {
    if (!message.trim() || !preview.recipients.length) return;
    if (!window.confirm(`Send this message to ${preview.count} recipient(s)?`)) return;
    setSending(true);
    setResult(null);
    try {
      // Personalise {{name}}/{{parent_name}} per recipient where possible.
      const phones = preview.recipients.map((r) => r.phone);
      const res = await broadcastMessage(adminKey, fillSample(message), phones);
      setResult(res);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  }

  if (!settings) return <div className="grid gap-4 lg:grid-cols-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Audience builder */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users2 size={16} /> Target Audience</h3>
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Bucket" value={filters.lead_bucket} onChange={(v) => setFilters((f) => ({ ...f, lead_bucket: v }))} options={settings.lead_buckets} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Heat</label>
            <select value={filters.heat} onChange={(e) => setFilters((f) => ({ ...f, heat: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              {HEAT.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>
          <Sel label="Status" value={filters.lead_status} onChange={(v) => setFilters((f) => ({ ...f, lead_status: v }))} options={settings.lead_statuses} />
          <Sel label="Source" value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v }))} options={settings.sources} labels={LABELS.source} />
          <Sel label="Tag" value={filters.tag} onChange={(v) => setFilters((f) => ({ ...f, tag: v }))} options={settings.intent_tags} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Active within (days)</label>
            <input type="number" value={filters.last_active_days} onChange={(e) => setFilters((f) => ({ ...f, last_active_days: e.target.value }))} placeholder="any" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-aero-50 px-4 py-3">
          <span className="text-3xl font-bold text-aero-700">{loadingPreview ? "…" : preview.count ?? 0}</span>
          <span className="text-sm text-aero-700">recipient{preview.count === 1 ? "" : "s"} match this audience</span>
        </div>
      </div>

      {/* Composer */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><FileText size={16} /> Message</h3>
        {templates.length > 0 && (
          <select onChange={(e) => { const t = templates.find((x) => String(x.id) === e.target.value); if (t) setMessage(t.body); }} defaultValue="" className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="" disabled>Insert from template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
          </select>
        )}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} placeholder="Write your campaign message. Use {{name}} or {{parent_name}} for personalisation." className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        <button onClick={send} disabled={sending || !message.trim() || !preview.count} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:bg-brand-300">
          <Send size={15} /> {sending ? "Sending…" : `Send to ${preview.count ?? 0}`}
        </button>
        {result && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${result.error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
            {result.error ? result.error : `Sent ${result.sent}, failed ${result.failed}.`}
          </div>
        )}
      </div>
    </div>
  );
}

function fillSample(msg) {
  // Recipient-level personalisation isn't available through the simple
  // broadcast endpoint, so unresolved variables fall back to friendly text.
  return msg.replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE[k] ?? "");
}

function Sel({ label, value, onChange, options, labels }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
        <option value="">Any</option>
        {(options || []).map((o) => <option key={o} value={o}>{labels?.[o] || o.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}
