import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Filter, X } from "lucide-react";

import {
  fetchContacts,
  fetchAgents,
  fetchCrmSettings,
  bulkContactAction,
} from "../../api.js";
import {
  HeatBadge,
  StatusBadge,
  BucketBadge,
  LABELS,
  relativeTime,
  Skeleton,
  EmptyState,
} from "./CrmUI.jsx";
import LeadDrawer from "./LeadDrawer.jsx";

const HEAT_OPTIONS = [
  { value: "all", label: "All heat" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export default function ContactsPanel({ adminKey }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agents, setAgents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [checked, setChecked] = useState(new Set());

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    lead_bucket: "all",
    lead_status: "all",
    heat: "all",
    source: "all",
    assigned_to: "all",
    tag: "all",
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchAgents(adminKey).then(setAgents).catch(() => {});
    fetchCrmSettings(adminKey).then(setSettings).catch(() => {});
  }, [adminKey]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = {
        search: search.trim(),
        lead_bucket: filters.lead_bucket,
        lead_status: filters.lead_status,
        heat: filters.heat,
        source: filters.source,
        assigned_to: filters.assigned_to,
        tag: filters.tag,
      };
      const data = await fetchContacts(adminKey, payload);
      setContacts(data.contacts || []);
    } catch (err) {
      setError(err.message || "Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, search, filters]);

  const allTags = settings?.intent_tags || [];
  const sources = settings?.sources || [];
  const statuses = settings?.lead_statuses || [];
  const buckets = settings?.lead_buckets || [];

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v && v !== "all").length,
    [filters]
  );

  function toggleCheck(phone) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.phone))
    );
  }

  async function runBulk(action, value) {
    if (!value || checked.size === 0) return;
    try {
      await bulkContactAction(adminKey, [...checked], action, value);
      setChecked(new Set());
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, or summary…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
            showFilters || activeFilterCount
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          <Filter size={15} /> Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-brand-500 px-1.5 text-xs text-white">{activeFilterCount}</span>
          )}
        </button>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-6">
          <FilterSelect label="Bucket" value={filters.lead_bucket} onChange={(v) => setFilters((f) => ({ ...f, lead_bucket: v }))} options={buckets} />
          <FilterSelect label="Status" value={filters.lead_status} onChange={(v) => setFilters((f) => ({ ...f, lead_status: v }))} options={statuses} />
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Heat</label>
            <select value={filters.heat} onChange={(e) => setFilters((f) => ({ ...f, heat: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              {HEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <FilterSelect label="Source" value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v }))} options={sources} labels={LABELS.source} />
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Assigned</label>
            <select value={filters.assigned_to} onChange={(e) => setFilters((f) => ({ ...f, assigned_to: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="all">All</option>
              <option value="__unassigned__">Unassigned</option>
              {agents.map((a) => <option key={a.phone} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <FilterSelect label="Tag" value={filters.tag} onChange={(v) => setFilters((f) => ({ ...f, tag: v }))} options={allTags} />
        </div>
      )}

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-semibold text-brand-700">{checked.size} selected</span>
          <select onChange={(e) => { runBulk("update_status", e.target.value); e.target.value = ""; }} defaultValue="" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
            <option value="" disabled>Set status…</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select onChange={(e) => { runBulk("assign", e.target.value); e.target.value = ""; }} defaultValue="" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
            <option value="" disabled>Assign agent…</option>
            {agents.map((a) => <option key={a.phone} value={a.name}>{a.name}</option>)}
          </select>
          <select onChange={(e) => { runBulk("add_tag", e.target.value); e.target.value = ""; }} defaultValue="" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
            <option value="" disabled>Add tag…</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setChecked(new Set())} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <X size={14} /> Clear
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={contacts.length > 0 && checked.size === contacts.length} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Phone</th>
              <th className="px-3 py-2.5">Bucket</th>
              <th className="px-3 py-2.5">Heat</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Last Active</th>
              <th className="px-3 py-2.5">Assigned</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>
                  {[...Array(8)].map((__, j) => <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-20" /></td>)}
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6">
                  <EmptyState title="No contacts match" subtitle="Adjust filters or wait for new WhatsApp leads." />
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr
                  key={c.phone}
                  onClick={() => setSelectedPhone(c.phone)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-brand-50/40"
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checked.has(c.phone)} onChange={() => toggleCheck(c.phone)} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{c.parent_name || "Unknown"}</div>
                    {c.child_name && <div className="text-xs text-slate-400">{c.child_name}</div>}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{c.phone}</td>
                  <td className="px-3 py-3"><BucketBadge bucket={c.lead_bucket} /></td>
                  <td className="px-3 py-3"><HeatBadge category={c.heat_category} score={c.heat_score} /></td>
                  <td className="px-3 py-3"><StatusBadge status={c.lead_status} /></td>
                  <td className="px-3 py-3 text-xs text-slate-500">{LABELS.source[c.source] || c.source}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">{relativeTime(c.last_activity_at || c.updated_at)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{c.assigned_to || <span className="text-slate-300">—</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedPhone && (
        <LeadDrawer
          adminKey={adminKey}
          phone={selectedPhone}
          agents={agents}
          settings={settings}
          onClose={() => setSelectedPhone(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, labels }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{labels?.[o] || o.replace(/_/g, " ")}</option>
        ))}
      </select>
    </div>
  );
}
