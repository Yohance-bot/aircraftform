import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Copy, Trash2, Save } from "lucide-react";

import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  deleteTemplate,
} from "../../api.js";
import { Skeleton, EmptyState } from "./CrmUI.jsx";

const CATEGORIES = [
  { value: "follow_up", label: "Follow-up" },
  { value: "broadcast", label: "Broadcast" },
  { value: "drip", label: "Drip" },
];

const VARIABLES = ["name", "parent_name", "camp_date", "product_name", "city", "score"];

const SAMPLE = {
  name: "Aarav",
  parent_name: "Priya",
  camp_date: "12 July",
  product_name: "FPV Racing Drone Kit",
  city: "Bangalore",
  score: "72",
};

const CAT_COLORS = {
  follow_up: "bg-orange-100 text-orange-700",
  broadcast: "bg-blue-100 text-blue-700",
  drip: "bg-purple-100 text-purple-700",
};

function renderPreview(body) {
  return (body || "").replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE[k] ?? `{{${k}}}`);
}

const BLANK = { name: "", category: "follow_up", body: "", shortcut: "" };

export default function TemplatesPanel({ adminKey }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchTemplates(adminKey);
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [adminKey]); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter((t) => !q || t.name.toLowerCase().includes(q) || (t.shortcut || "").includes(q));
  }, [templates, search]);

  function selectTemplate(t) {
    setSelectedId(t.id);
    setDraft({ name: t.name, category: t.category, body: t.body, shortcut: t.shortcut || "" });
  }

  function newTemplate() {
    setSelectedId("new");
    setDraft({ ...BLANK });
  }

  async function save() {
    if (!draft?.name.trim() || !draft?.body.trim()) return;
    setSaving(true);
    try {
      if (selectedId === "new") {
        const created = await createTemplate(adminKey, draft);
        setSelectedId(created.id);
      } else {
        await updateTemplate(adminKey, selectedId, draft);
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this template?")) return;
    await deleteTemplate(adminKey, id);
    if (selectedId === id) { setSelectedId(null); setDraft(null); }
    load();
  }

  async function duplicate(id) {
    const copy = await duplicateTemplate(adminKey, id);
    await load();
    selectTemplate(copy);
  }

  function insertVar(v) {
    setDraft((d) => ({ ...d, body: `${d.body}{{${v}}}` }));
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_300px]">
      {/* LEFT — library */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-3">
          <button onClick={newTemplate} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            <Plus size={15} /> New Template
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="mb-2 h-14" />)
          ) : filtered.length === 0 ? (
            <p className="p-3 text-center text-sm text-slate-400">No templates.</p>
          ) : (
            filtered.map((t) => (
              <button key={t.id} onClick={() => selectTemplate(t)} className={`mb-1.5 w-full rounded-lg border p-2.5 text-left ${selectedId === t.id ? "border-brand-300 bg-brand-50" : "border-slate-100 hover:bg-slate-50"}`}>
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium text-slate-800">{t.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CAT_COLORS[t.category]}`}>{t.category}</span>
                </div>
                {t.shortcut && <div className="mt-0.5 text-xs font-mono text-brand-600">{t.shortcut}</div>}
                <div className="mt-0.5 truncate text-xs text-slate-400">{t.body}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* CENTER — editor */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {!draft ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon="📝" title="Select or create a template" subtitle="Use {{variables}} for personalisation." />
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700">{selectedId === "new" ? "New template" : "Edit template"}</h3>
              <div className="flex gap-1.5">
                {selectedId !== "new" && (
                  <>
                    <button onClick={() => duplicate(selectedId)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" title="Duplicate"><Copy size={15} /></button>
                    <button onClick={() => remove(selectedId)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500" title="Delete"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Name</label>
                <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Category</label>
                <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Saved-reply shortcut (optional)</label>
              <input value={draft.shortcut} onChange={(e) => setDraft((d) => ({ ...d, shortcut: e.target.value }))} placeholder="/julycamp" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </div>
            <div className="flex flex-1 flex-col">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Message body</label>
              <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Hi {{parent_name}}, …" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button key={v} onClick={() => insertVar(v)} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-mono text-slate-600 hover:bg-brand-100 hover:text-brand-700">{`{{${v}}}`}</button>
                ))}
              </div>
            </div>
            <button onClick={save} disabled={saving || !draft.name.trim() || !draft.body.trim()} className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:bg-brand-300">
              <Save size={15} /> {saving ? "Saving…" : "Save template"}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT — WhatsApp preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">WhatsApp Preview</h3>
        <div className="rounded-2xl p-3" style={{ background: "#e5ddd5" }}>
          <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
              {draft?.body ? renderPreview(draft.body) : <span className="italic text-slate-400">Your message preview appears here…</span>}
            </p>
            <div className="mt-1 text-right text-[10px] text-slate-500">12:30 ✓✓</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Variables shown with sample data. Real sends substitute each contact's values.</p>
      </div>
    </div>
  );
}
