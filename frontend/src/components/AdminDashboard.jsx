import { useState } from "react";

import { fetchRegistrations } from "../api.js";

// Columns shown in the on-screen table.
const COLUMNS = [
  { key: "parent_name", label: "Parent" },
  { key: "child_name", label: "Child" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "age_group", label: "Age Group" },
  { key: "class_grade", label: "Class" },
  { key: "villa_flat_number", label: "Villa" },
  { key: "batch_preference", label: "Batch" },
  { key: "payment_status", label: "Payment" },
  { key: "created_at", label: "Registered At" },
];

// CSV export has its own explicit column order & labels (per spec).
const CSV_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "parent_name", label: "Parent Name" },
  { key: "child_name", label: "Child Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "age_group", label: "Age Group" },
  { key: "class_grade", label: "Class/Grade" },
  { key: "villa_flat_number", label: "Villa/Flat Number" },
  { key: "batch_preference", label: "Batch Preference" },
  { key: "special_requirements", label: "Special Requirements" },
  { key: "payment_status", label: "Payment Status" },
  { key: "created_at", label: "Registered At" },
];

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadData(key) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRegistrations(key);
      setRows(data);
      setAuthed(true);
    } catch (err) {
      setError(err?.message || "Failed to load.");
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }

  function handleUnlock(e) {
    e.preventDefault();
    if (!adminKey.trim()) return;
    loadData(adminKey.trim());
  }

  function handleRefresh() {
    if (adminKey.trim()) loadData(adminKey.trim());
  }

  function handleExportCsv() {
    if (!rows.length) return;
    const csv = toCsv(rows);
    // Prepend a UTF-8 BOM so Excel opens non-ASCII characters (names, etc.) correctly.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amc-registrations-${todayYYYYMMDD()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!authed) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white/90 backdrop-blur shadow-card border border-brand-100 p-8">
          <h1 className="text-2xl font-extrabold text-slate-900">Admin Access</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter the admin key to view and export registrations.
          </p>
          <form onSubmit={handleUnlock} className="mt-5 space-y-3">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Admin key"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
              autoFocus
            />
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white font-semibold py-3 transition-colors"
            >
              {loading ? "Checking..." : "Unlock dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Registrations
          </h1>
          <p className="text-sm text-slate-600">
            Total: <span className="font-semibold">{rows.length}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-4 text-sm transition-colors"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!rows.length}
            className="h-10 rounded-xl border border-brand-500 bg-white text-brand-600 hover:bg-brand-500 hover:text-white font-semibold px-4 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white disabled:text-brand-300 disabled:border-brand-200 disabled:hover:bg-white disabled:hover:text-brand-300"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-50 text-brand-800">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="text-left font-semibold px-4 py-3 whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No registrations yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className="px-4 py-3 text-slate-700 whitespace-nowrap"
                    >
                      {formatCell(c.key, r[c.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "created_at") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }
  if (key === "payment_status") {
    const color =
      value === "confirmed"
        ? "bg-green-100 text-green-700"
        : "bg-amber-100 text-amber-700";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}
      >
        {value}
      </span>
    );
  }
  return String(value);
}

// Every field — including headers — is wrapped in double quotes, and any
// embedded " is escaped by doubling it. This is the strictest form of CSV
// quoting and is what the spec calls for.
function csvField(value) {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function toCsv(rows) {
  const headerLine = CSV_COLUMNS.map((c) => csvField(c.label)).join(",");
  const bodyLines = rows.map((row) =>
    CSV_COLUMNS.map((c) => {
      const v = row[c.key];
      if (c.key === "created_at" && v) {
        // Keep the ISO timestamp — it round-trips back into spreadsheets cleanly.
        return csvField(v);
      }
      return csvField(v);
    }).join(","),
  );
  return [headerLine, ...bodyLines].join("\r\n");
}

function todayYYYYMMDD() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
