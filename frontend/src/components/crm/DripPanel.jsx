import { useEffect, useState } from "react";
import { Plus, Play, Pause, Trash2, Save, X, Clock, Users2, Square, RotateCcw } from "lucide-react";

import {
  fetchSequences,
  fetchSequence,
  createSequence,
  updateSequence,
  deleteSequence,
  activateSequence,
  enrollSequence,
  setSequenceState,
  fetchTemplates,
  fetchCrmSettings,
  runDripDue,
} from "../../api.js";
import { Skeleton, EmptyState, relativeTime } from "./CrmUI.jsx";

const TRIGGERS = [
  { value: "manual", label: "Manual enrollment" },
  { value: "new_lead", label: "Auto: every new lead" },
];

const BLANK_STEP = { delay_days: 0, template_id: null, body_override: "", stop_on_reply: true, stop_on_conversion: true };

export default function DripPanel({ adminKey }) {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // draft object or null
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  async function loadList() {
    setLoading(true);
    try {
      setSequences(await fetchSequences(adminKey));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    fetchTemplates(adminKey).then(setTemplates).catch(() => {});
    fetchCrmSettings(adminKey).then(setSettings).catch(() => {});
  }, [adminKey]); // eslint-disable-line

  async function openDetail(id) {
    setSelectedId(id);
    setEditing(null);
    setDetail(null);
    try {
      setDetail(await fetchSequence(adminKey, id));
    } catch {
      /* ignore */
    }
  }

  function newSequence() {
    setSelectedId("new");
    setDetail(null);
    setEditing({
      name: "", description: "", trigger_type: "manual",
      bucket_filters: [], status_filters: [], score_filters: {},
      steps: [{ ...BLANK_STEP }],
    });
  }

  function editExisting() {
    if (!detail) return;
    setEditing({
      name: detail.name,
      description: detail.description || "",
      trigger_type: detail.trigger_type,
      bucket_filters: detail.bucket_filters || [],
      status_filters: detail.status_filters || [],
      score_filters: detail.score_filters || {},
      steps: detail.steps?.length ? detail.steps.map((s) => ({ ...s })) : [{ ...BLANK_STEP }],
    });
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  async function save() {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: editing.name.trim(),
        description: editing.description,
        trigger_type: editing.trigger_type,
        bucket_filters: editing.bucket_filters,
        status_filters: editing.status_filters,
        score_filters: editing.score_filters,
        steps: editing.steps.map((s) => ({
          delay_days: parseInt(s.delay_days, 10) || 0,
          template_id: s.template_id || null,
          body_override: s.body_override || null,
          stop_on_reply: !!s.stop_on_reply,
          stop_on_conversion: !!s.stop_on_conversion,
        })),
      };
      const saved = selectedId === "new"
        ? await createSequence(adminKey, payload)
        : await updateSequence(adminKey, selectedId, payload);
      await loadList();
      setEditing(null);
      openDetail(saved.id);
      flash("Saved");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!detail) return;
    const updated = await activateSequence(adminKey, detail.id, !detail.active);
    setDetail((d) => ({ ...d, active: updated.active }));
    loadList();
  }

  async function doState(action) {
    await setSequenceState(adminKey, detail.id, action);
    openDetail(detail.id);
    flash(`Enrollments ${action}d`);
  }

  async function enrollNow() {
    const res = await enrollSequence(adminKey, detail.id, { use_audience: true });
    openDetail(detail.id);
    flash(`Enrolled ${res.enrolled} contact(s)`);
  }

  async function remove() {
    if (!window.confirm("Delete this sequence? Pending sends will be cancelled.")) return;
    await deleteSequence(adminKey, detail.id);
    setSelectedId(null);
    setDetail(null);
    loadList();
  }

  async function runNow() {
    const res = await runDripDue(adminKey);
    flash(`Processed ${res.processed} due (${res.sent} sent)`);
    if (detail) openDetail(detail.id);
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      {/* List */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <h3 className="text-sm font-semibold text-slate-700">Sequences</h3>
          <div className="flex gap-1.5">
            <button onClick={runNow} title="Process due now" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><RotateCcw size={15} /></button>
            <button onClick={newSequence} className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"><Plus size={14} /> New</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="mb-2 h-16" />)
          ) : sequences.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">No sequences yet.</p>
          ) : (
            sequences.map((s) => (
              <button key={s.id} onClick={() => openDetail(s.id)} className={`mb-1.5 w-full rounded-lg border p-2.5 text-left ${selectedId === s.id ? "border-brand-300 bg-brand-50" : "border-slate-100 hover:bg-slate-50"}`}>
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium text-slate-800">{s.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{s.active ? "Active" : "Off"}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <span>{s.step_count} steps</span>
                  <span className="flex items-center gap-1"><Users2 size={11} /> {s.total_enrolled}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail / editor */}
      <div className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        {toast && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{toast}</div>}

        {editing ? (
          <SequenceEditor editing={editing} setEditing={setEditing} templates={templates} settings={settings} onSave={save} onCancel={() => { setEditing(null); if (selectedId === "new") setSelectedId(null); }} busy={busy} />
        ) : !detail ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon="💧" title="Select or create a drip sequence" subtitle="Automate multi-day follow-ups that stop when a lead replies or converts." />
          </div>
        ) : (
          <SequenceDetail detail={detail} templates={templates} onEdit={editExisting} onToggle={toggleActive} onState={doState} onEnroll={enrollNow} onDelete={remove} />
        )}
      </div>
    </div>
  );
}

function SequenceDetail({ detail, templates, onEdit, onToggle, onState, onEnroll, onDelete }) {
  const counts = detail.enrollment_counts || {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">{detail.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${detail.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{detail.active ? "Active" : "Inactive"}</span>
          </div>
          {detail.description && <p className="mt-1 text-sm text-slate-500">{detail.description}</p>}
          <p className="mt-1 text-xs text-slate-400">Trigger: {detail.trigger_type === "new_lead" ? "Auto-enroll new leads" : "Manual"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onToggle} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${detail.active ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
            {detail.active ? <><Pause size={14} /> Deactivate</> : <><Play size={14} /> Activate</>}
          </button>
          <button onClick={onEdit} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Edit</button>
          <button onClick={onDelete} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Enrollment controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <span className="text-sm font-medium text-slate-600">Enrollments:</span>
        {["active", "paused", "completed", "stopped_reply", "stopped_conversion", "cancelled"].map((k) =>
          counts[k] ? <span key={k} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-sm">{k.replace(/_/g, " ")}: {counts[k]}</span> : null
        )}
        {!detail.total_enrolled && <span className="text-xs text-slate-400">None yet</span>}
        <div className="ml-auto flex gap-1.5">
          <button onClick={onEnroll} className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"><Users2 size={13} /> Enroll matching</button>
          <button onClick={() => onState("pause")} className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-300">Pause all</button>
          <button onClick={() => onState("resume")} className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-300">Resume</button>
          <button onClick={() => onState("cancel")} className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-300">Cancel all</button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Steps</h4>
        <div className="space-y-2">
          {(detail.steps || []).map((s, i) => {
            const tpl = templates.find((t) => t.id === s.template_id);
            return (
              <div key={s.id} className="flex gap-3 rounded-lg border border-slate-100 p-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-aero-100 text-xs font-bold text-aero-700">{i + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Clock size={13} className="text-slate-400" /> Day {s.delay_days}</div>
                  <div className="mt-0.5 truncate text-sm text-slate-500">{tpl ? tpl.name : (s.body_override || "—")}</div>
                  <div className="mt-1 flex gap-2 text-[11px] text-slate-400">
                    {s.stop_on_reply && <span>stops on reply</span>}
                    {s.stop_on_conversion && <span>stops on conversion</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming + logs */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Upcoming sends</h4>
          {(detail.upcoming || []).length === 0 ? (
            <p className="text-sm text-slate-400">Nothing scheduled.</p>
          ) : (
            <div className="space-y-1.5">
              {detail.upcoming.slice(0, 8).map((u, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className="text-slate-600">{u.phone}</span>
                  <span className="text-slate-400">{relativeTime(u.send_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Execution log</h4>
          {(detail.logs || []).length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <div className="space-y-1.5">
              {detail.logs.slice(0, 8).map((l, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className="truncate text-slate-600">{l.event}{l.phone ? ` · ${l.phone}` : ""}</span>
                  <span className="flex-shrink-0 text-slate-400">{relativeTime(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SequenceEditor({ editing, setEditing, templates, settings, onSave, onCancel, busy }) {
  const buckets = settings?.lead_buckets || [];
  const statuses = settings?.lead_statuses || [];

  function setStep(i, patch) {
    setEditing((e) => ({ ...e, steps: e.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }
  function addStep() {
    setEditing((e) => ({ ...e, steps: [...e.steps, { ...BLANK_STEP, delay_days: (e.steps.at(-1)?.delay_days || 0) + 3 }] }));
  }
  function removeStep(i) {
    setEditing((e) => ({ ...e, steps: e.steps.filter((_, idx) => idx !== i) }));
  }
  function toggleArr(field, val) {
    setEditing((e) => {
      const arr = e[field] || [];
      return { ...e, [field]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Sequence builder</h3>
        <button onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Name</label>
          <input value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Trigger</label>
          <select value={editing.trigger_type} onChange={(e) => setEditing((s) => ({ ...s, trigger_type: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">Description</label>
        <input value={editing.description} onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FilterChips label="Bucket filters" options={buckets} selected={editing.bucket_filters} onToggle={(v) => toggleArr("bucket_filters", v)} />
        <FilterChips label="Status filters" options={statuses} selected={editing.status_filters} onToggle={(v) => toggleArr("status_filters", v)} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500">Heat score</label>
        <input type="number" placeholder="min" value={editing.score_filters?.min ?? ""} onChange={(e) => setEditing((s) => ({ ...s, score_filters: { ...s.score_filters, min: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } }))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
        <span className="text-slate-400">to</span>
        <input type="number" placeholder="max" value={editing.score_filters?.max ?? ""} onChange={(e) => setEditing((s) => ({ ...s, score_filters: { ...s.score_filters, max: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } }))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Steps</h4>
          <button onClick={addStep} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"><Plus size={13} /> Add step</button>
        </div>
        <div className="space-y-3">
          {editing.steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Step {i + 1}</span>
                {editing.steps.length > 1 && <button onClick={() => removeStep(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Delay (days)
                  <input type="number" min={0} value={s.delay_days} onChange={(e) => setStep(i, { delay_days: e.target.value })} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                </label>
                <select value={s.template_id || ""} onChange={(e) => setStep(i, { template_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
                  <option value="">— custom text —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {!s.template_id && (
                <textarea value={s.body_override || ""} onChange={(e) => setStep(i, { body_override: e.target.value })} rows={2} placeholder="Message text. Use {{parent_name}} etc." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              )}
              <div className="mt-2 flex gap-4 text-xs text-slate-600">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.stop_on_reply} onChange={(e) => setStep(i, { stop_on_reply: e.target.checked })} /> Stop on reply</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.stop_on_conversion} onChange={(e) => setStep(i, { stop_on_conversion: e.target.checked })} /> Stop on conversion</label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy || !editing.name.trim()} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:bg-brand-300"><Save size={15} /> {busy ? "Saving…" : "Save sequence"}</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

function FilterChips({ label, options, selected, onToggle }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 && <span className="text-xs text-slate-400">—</span>}
        {options.map((o) => (
          <button key={o} onClick={() => onToggle(o)} className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${selected.includes(o) ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            {o.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
