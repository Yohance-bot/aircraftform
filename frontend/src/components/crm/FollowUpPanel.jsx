import { useEffect, useState } from "react";
import { Check, Clock, Trophy } from "lucide-react";

import {
  fetchFollowups,
  fetchCrmSettings,
  completeReminder,
  snoozeReminder,
  updateContact,
} from "../../api.js";
import { HeatBadge, StatusBadge, relativeTime, Skeleton, EmptyState } from "./CrmUI.jsx";
import LeadDrawer from "./LeadDrawer.jsx";

export default function FollowUpPanel({ adminKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [selectedPhone, setSelectedPhone] = useState(null);

  async function load() {
    try {
      const res = await fetchFollowups(adminKey);
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetchCrmSettings(adminKey).then(setSettings).catch(() => {});
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const snoozeDays = settings?.reminder_defaults?.snooze_options_days || [1, 3, 7];

  async function act(fn) {
    await fn();
    load();
  }

  if (loading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  const { queue, counts } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <CountCard label="Total" value={counts.total} color="#0E90F1" />
        <CountCard label="Hot" value={counts.hot} color="#ef4444" />
        <CountCard label="Warm" value={counts.warm} color="#f59e0b" />
        <CountCard label="Cold" value={counts.cold} color="#94a3b8" />
      </div>

      {queue.length === 0 ? (
        <EmptyState icon="🎯" title="Inbox zero!" subtitle="No leads need follow-up right now." />
      ) : (
        <div className="space-y-2">
          {queue.map((c) => (
            <div key={c.phone} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-200">
              <button onClick={() => setSelectedPhone(c.phone)} className="min-w-[160px] flex-1 text-left">
                <div className="font-semibold text-slate-800">{c.parent_name || c.phone}</div>
                <div className="text-xs text-slate-500">{c.phone}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(c.followup_reasons || []).map((r) => (
                    <span key={r} className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">{r}</span>
                  ))}
                </div>
              </button>
              <div className="flex items-center gap-2">
                <HeatBadge category={c.heat_category} score={c.heat_score} />
                <StatusBadge status={c.lead_status} />
              </div>
              {c.reminder_at && (
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={13} /> {relativeTime(c.reminder_at)}
                </div>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button onClick={() => act(() => completeReminder(adminKey, c.phone).catch(() => updateContact(adminKey, c.phone, { lead_status: "engaged" })))} className="flex items-center gap-1 rounded-lg bg-green-100 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-200">
                  <Check size={13} /> Done
                </button>
                {snoozeDays.map((d) => (
                  <button key={d} onClick={() => act(() => snoozeReminder(adminKey, c.phone, d))} className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
                    +{d}d
                  </button>
                ))}
                <button onClick={() => act(() => updateContact(adminKey, c.phone, { lead_status: "converted" }))} className="flex items-center gap-1 rounded-lg bg-brand-100 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-200">
                  <Trophy size={13} /> Convert
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPhone && (
        <LeadDrawer
          adminKey={adminKey}
          phone={selectedPhone}
          agents={[]}
          settings={settings}
          onClose={() => setSelectedPhone(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CountCard({ label, value, color }) {
  return (
    <div className="flex min-w-[110px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="h-9 w-1.5 rounded-full" style={{ background: color }} />
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
      </div>
    </div>
  );
}
