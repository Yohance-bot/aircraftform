import { useEffect, useState } from "react";
import { X, Sparkles, Bell, RefreshCw, Trash2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import {
  fetchContact,
  updateContact,
  refreshAi,
  recomputeScore,
  addNote,
  deleteNote,
  createReminder,
  completeReminder,
} from "../../api.js";
import {
  HeatBadge,
  StatusBadge,
  BucketBadge,
  SentimentBadge,
  Tag,
  LABELS,
  relativeTime,
  Skeleton,
} from "./CrmUI.jsx";

const TIMELINE_ICONS = {
  conversation_started: "💬",
  message_received: "📥",
  message_sent: "📤",
  bucket_changed: "🗂️",
  status_changed: "🚦",
  score_changed: "🔥",
  form_submitted: "📝",
  reminder_created: "⏰",
  reminder_completed: "✅",
  campaign_received: "📣",
  campaign_clicked: "🔗",
  converted: "🎉",
  ai_refreshed: "✨",
  assigned: "👤",
  note_added: "🗒️",
};

const TABS = ["Overview", "Timeline", "Notes", "Details"];

export default function LeadDrawer({ adminKey, phone, agents, settings, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  const [busy, setBusy] = useState("");
  const [noteText, setNoteText] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetchContact(adminKey, phone);
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const c = data?.contact;

  async function patch(fields) {
    const updated = await updateContact(adminKey, phone, fields);
    setData((d) => ({ ...d, contact: { ...d.contact, ...updated } }));
    onChanged?.();
  }

  async function handleRefreshAi() {
    setBusy("ai");
    try {
      await refreshAi(adminKey, phone);
      await load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  }

  async function handleRecompute() {
    setBusy("score");
    try {
      await recomputeScore(adminKey, phone);
      await load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    await addNote(adminKey, phone, noteText.trim());
    setNoteText("");
    load();
  }

  async function handleReminder() {
    const days = settings?.reminder_defaults?.default_days || 1;
    const at = new Date(Date.now() + days * 86400000).toISOString();
    const note = window.prompt("Reminder note (optional):", "Follow up with this lead");
    if (note === null) return;
    await createReminder(adminKey, phone, at, note);
    load();
    onChanged?.();
  }

  const statuses = settings?.lead_statuses || [];
  const buckets = settings?.lead_buckets || [];
  const sources = settings?.sources || [];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          initial={{ x: 480 }}
          animate={{ x: 0 }}
          exit={{ x: 480 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {loading || !c ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="border-b border-slate-200 bg-gradient-to-br from-aero-600 to-aero-800 p-5 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{c.parent_name || "Unknown"}</h2>
                    <div className="text-sm text-white/80">{c.phone}</div>
                    {c.child_name && <div className="text-xs text-white/70">Child: {c.child_name}</div>}
                  </div>
                  <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/20">
                    <X size={18} />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <HeatBadge category={c.heat_category} score={c.heat_score} />
                  <BucketBadge bucket={c.lead_bucket} />
                  <StatusBadge status={c.lead_status} />
                  {c.sentiment && <SentimentBadge sentiment={c.sentiment} />}
                </div>
              </div>

              {/* Action bar */}
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                <ActionBtn icon={Sparkles} label="Refresh AI" loading={busy === "ai"} onClick={handleRefreshAi} />
                <ActionBtn icon={RefreshCw} label="Re-score" loading={busy === "score"} onClick={handleRecompute} />
                <ActionBtn icon={Bell} label="Reminder" onClick={handleReminder} />
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 px-3">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 text-sm font-medium ${
                      tab === t ? "border-b-2 border-brand-500 text-brand-600" : "text-slate-500"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {tab === "Overview" && (
                  <div className="space-y-4">
                    {c.reminder_at && !c.reminder_completed && (
                      <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 text-amber-800">
                          <Clock size={15} />
                          <span>Reminder {relativeTime(c.reminder_at)}{c.reminder_note ? ` — ${c.reminder_note}` : ""}</span>
                        </div>
                        <button onClick={async () => { await completeReminder(adminKey, phone); load(); onChanged?.(); }} className="text-xs font-semibold text-amber-700 hover:underline">Done</button>
                      </div>
                    )}
                    <Section title="AI Summary">
                      <p className="text-sm leading-relaxed text-slate-600">
                        {c.ai_summary || <span className="italic text-slate-400">Not generated yet — tap “Refresh AI”.</span>}
                      </p>
                    </Section>
                    <Section title="Recommended Next Action">
                      <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                        {c.ai_recommendation || <span className="italic text-brand-400">No recommendation yet.</span>}
                      </p>
                    </Section>
                    <Section title="Why this score">
                      {(c.score_reasons || []).length === 0 ? (
                        <p className="text-sm text-slate-400">No scoring signals yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {c.score_reasons.map((r, i) => (
                            <li key={i} className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">{r.label}</span>
                              <span className={`font-semibold ${r.points >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {r.points > 0 ? `+${r.points}` : r.points}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Section>
                  </div>
                )}

                {tab === "Timeline" && (
                  <div className="space-y-3">
                    {(data.timeline || []).length === 0 ? (
                      <p className="text-sm text-slate-400">No activity yet.</p>
                    ) : (
                      data.timeline.map((e) => (
                        <div key={e.id} className="flex gap-3">
                          <div className="text-lg leading-none">{TIMELINE_ICONS[e.event_type] || "•"}</div>
                          <div className="flex-1 border-b border-slate-100 pb-3">
                            <div className="text-sm font-medium text-slate-700">{e.title}</div>
                            {e.detail && <div className="text-xs text-slate-500">{e.detail}</div>}
                            <div className="text-[11px] text-slate-400">{relativeTime(e.created_at)}{e.actor ? ` · ${e.actor}` : ""}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tab === "Notes" && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add an internal note (staff only)…"
                        rows={2}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      />
                    </div>
                    <button onClick={handleAddNote} disabled={!noteText.trim()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-brand-300">
                      Add note
                    </button>
                    <div className="space-y-2 pt-2">
                      {(data.notes || []).length === 0 ? (
                        <p className="text-sm text-slate-400">No notes yet.</p>
                      ) : (
                        data.notes.map((n) => (
                          <div key={n.id} className="group rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                              <span>{n.author || "admin"} · {relativeTime(n.created_at)}</span>
                              <button onClick={async () => { await deleteNote(adminKey, n.id); load(); }} className="opacity-0 transition-opacity group-hover:opacity-100">
                                <Trash2 size={13} className="text-slate-400 hover:text-red-500" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {tab === "Details" && (
                  <div className="space-y-4">
                    <Field label="Lead Status">
                      <select value={c.lead_status} onChange={(e) => patch({ lead_status: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                        {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </select>
                    </Field>
                    <Field label="Bucket">
                      <select value={c.lead_bucket} onChange={(e) => patch({ lead_bucket: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                        {buckets.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </Field>
                    <Field label="Source">
                      <select value={c.source} onChange={(e) => patch({ source: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                        {sources.map((s) => <option key={s} value={s}>{LABELS.source[s] || s}</option>)}
                      </select>
                    </Field>
                    <Field label="Assigned To">
                      <select value={c.assigned_to || ""} onChange={(e) => patch({ assigned_to: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                        <option value="">Unassigned</option>
                        {agents.map((a) => <option key={a.phone} value={a.name}>{a.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Intent Tags">
                      <div className="flex flex-wrap gap-1.5">
                        {(c.intent_tags || []).length === 0 && <span className="text-sm text-slate-400">None</span>}
                        {(c.intent_tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
                      </div>
                    </Field>
                    <Field label="Custom Attributes">
                      <CustomFields value={c.custom_fields || {}} onSave={(cf) => patch({ custom_fields: cf })} />
                    </Field>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ActionBtn({ icon: Icon, label, onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
      <Icon size={14} className={loading ? "animate-spin" : ""} /> {label}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

const KNOWN_ATTRS = ["child_age", "city", "school", "interests"];

function CustomFields({ value, onSave }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const keys = [...new Set([...KNOWN_ATTRS, ...Object.keys(draft)])];
  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-24 text-xs capitalize text-slate-500">{k.replace(/_/g, " ")}</span>
          <input
            value={draft[k] ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            onBlur={() => onSave(draft)}
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
      ))}
    </div>
  );
}
