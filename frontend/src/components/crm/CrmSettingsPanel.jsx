import { useEffect, useState } from "react";
import { Plus, X, Save, Check } from "lucide-react";

import { fetchCrmSettings, updateCrmSetting } from "../../api.js";
import { Skeleton } from "./CrmUI.jsx";

const LIST_KEYS = [
  { key: "lead_statuses", label: "Status Pipeline", hint: "Lead lifecycle stages" },
  { key: "sources", label: "Lead Sources", hint: "Where leads come from" },
  { key: "intent_tags", label: "Intent Tags", hint: "AI + manual lead tags" },
  { key: "lead_buckets", label: "Buckets", hint: "Product interest groups" },
];

const SCORING_LABELS = {
  asked_price: "Asked about price",
  asked_dates: "Asked about dates",
  deep_topic: "5+ messages on a topic",
  form_filled: "Filled registration form",
  repeat_question: "Asked same question twice",
  inactive_3d: "Inactive for 3+ days",
};

export default function CrmSettingsPanel({ adminKey }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    fetchCrmSettings(adminKey).then(setSettings).finally(() => setLoading(false));
  }, [adminKey]);

  async function save(key, value) {
    await updateCrmSetting(adminKey, key, value);
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(key);
    setTimeout(() => setSaved(""), 1500);
  }

  if (loading || !settings) {
    return <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Customise the CRM without code changes. Changes apply immediately across the platform.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {LIST_KEYS.map(({ key, label, hint }) => (
          <ListEditor key={key} title={label} hint={hint} items={settings[key] || []} saved={saved === key} onSave={(items) => save(key, items)} />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Heat Score Rules</h4>
          {saved === "scoring_rules" && <SavedTick />}
        </div>
        <p className="mb-3 text-xs text-slate-400">Points awarded per signal. Score categories use the thresholds below.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {Object.entries(settings.scoring_rules || {}).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-sm text-slate-600">{SCORING_LABELS[k] || k}</span>
              <input
                type="number"
                defaultValue={v}
                onBlur={(e) => save("scoring_rules", { ...settings.scoring_rules, [k]: parseInt(e.target.value || "0", 10) })}
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <ThresholdInput label="Warm ≥" value={settings.heat_thresholds?.warm} onSave={(n) => save("heat_thresholds", { ...settings.heat_thresholds, warm: n })} />
          <ThresholdInput label="Hot ≥" value={settings.heat_thresholds?.hot} onSave={(n) => save("heat_thresholds", { ...settings.heat_thresholds, hot: n })} />
          {saved === "heat_thresholds" && <SavedTick />}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Reminder Defaults</h4>
          {saved === "reminder_defaults" && <SavedTick />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <ThresholdInput label="Default (days)" value={settings.reminder_defaults?.default_days} onSave={(n) => save("reminder_defaults", { ...settings.reminder_defaults, default_days: n })} />
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Snooze options:</span>
            <span className="font-mono text-slate-500">{(settings.reminder_defaults?.snooze_options_days || []).join(", ")} days</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListEditor({ title, hint, items, onSave, saved }) {
  const [list, setList] = useState(items);
  const [adding, setAdding] = useState("");
  useEffect(() => setList(items), [items]);

  function add() {
    const v = adding.trim().toLowerCase().replace(/\s+/g, "_");
    if (!v || list.includes(v)) return;
    const next = [...list, v];
    setList(next);
    setAdding("");
    onSave(next);
  }
  function remove(v) {
    const next = list.filter((x) => x !== v);
    setList(next);
    onSave(next);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        {saved && <SavedTick />}
      </div>
      <p className="mb-2 text-xs text-slate-400">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {it.replace(/_/g, " ")}
            <button onClick={() => remove(it)} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add new…" className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        <button onClick={add} className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"><Plus size={14} /></button>
      </div>
    </div>
  );
}

function ThresholdInput({ label, value, onSave }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {label}
      <input type="number" defaultValue={value} onBlur={(e) => onSave(parseInt(e.target.value || "0", 10))} className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm" />
    </label>
  );
}

function SavedTick() {
  return <span className="flex items-center gap-1 text-xs font-medium text-green-600"><Check size={13} /> Saved</span>;
}
