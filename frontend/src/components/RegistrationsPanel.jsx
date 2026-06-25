import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { createRegistration, deleteRegistration, updateRegistration } from "../api.js";

const EDITABLE_COLUMNS = [
  { key: "society", label: "Society" },
  { key: "parent_name", label: "Parent" },
  { key: "child_name", label: "Child" },
  { key: "phone_country_code", label: "Country Code" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "age_group", label: "Age Group" },
  { key: "class_grade", label: "Class" },
  { key: "timing_slot", label: "Timing" },
  { key: "villa_flat_number", label: "Villa" },
  { key: "batch_preference", label: "Batch" },
  { key: "special_requirements", label: "Special Requirements", multiline: true },
  { key: "payment_status", label: "Payment", select: ["pending", "confirmed"] },
  { key: "created_at", label: "Registered At", readOnly: true },
];

const EMPTY_FORM = {
  society: "",
  parent_name: "",
  child_name: "",
  phone_country_code: "+91",
  phone: "",
  email: "",
  age_group: "",
  class_grade: "",
  timing_slot: "",
  villa_flat_number: "",
  batch_preference: "",
  special_requirements: "",
  payment_status: "pending",
};

const FORM_FIELDS = [
  { key: "parent_name", label: "Parent name", required: true },
  { key: "child_name", label: "Child name", required: true },
  { key: "phone_country_code", label: "Country code" },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "society", label: "Society", placeholder: "palm-meadows or prestige-white-meadows" },
  { key: "age_group", label: "Age group", placeholder: "e.g. 6-9 years" },
  { key: "class_grade", label: "Class", placeholder: "e.g. Grade 2" },
  { key: "timing_slot", label: "Timing", placeholder: "e.g. 10 AM - 12 PM" },
  { key: "villa_flat_number", label: "Villa / flat" },
  { key: "batch_preference", label: "Batch" },
  { key: "payment_status", label: "Payment", select: ["pending", "confirmed"] },
  { key: "special_requirements", label: "Special requirements", multiline: true },
];

function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "created_at") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }
  if (key === "society") {
    if (value === "palm-meadows") return "Palm Meadows";
    if (value === "prestige-white-meadows") return "Prestige WM";
    return String(value);
  }
  return String(value);
}

function editValue(key, value) {
  if (value === null || value === undefined) return "";
  if (key === "created_at") return displayValue(key, value);
  return String(value);
}

export default function RegistrationsPanel({
  adminKey,
  rows,
  setRows,
  loading,
  error,
  onRefresh,
  onExport,
}) {
  const [editing, setEditing] = useState(null); // { rowId, key }
  const [draft, setDraft] = useState("");
  const [cellError, setCellError] = useState("");
  const [saving, setSaving] = useState(null); // { rowId, key }
  const [deletingId, setDeletingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback((row, key) => {
    const col = EDITABLE_COLUMNS.find((c) => c.key === key);
    if (col?.readOnly) return;
    setCellError("");
    setEditing({ rowId: row.id, key });
    setDraft(editValue(key, row[key]));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setDraft("");
    setCellError("");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const { rowId, key } = editing;
    const row = rows.find((r) => r.id === rowId);
    if (!row) {
      cancelEdit();
      return;
    }

    const previous = row[key] ?? "";
    const next = draft.trim();
    if (String(previous ?? "") === next || (previous == null && next === "")) {
      cancelEdit();
      return;
    }

    setSaving({ rowId, key });
    setCellError("");
    try {
      const updated = await updateRegistration(adminKey, rowId, { [key]: next || null });
      setRows((prev) => prev.map((r) => (r.id === rowId ? updated : r)));
      cancelEdit();
    } catch (err) {
      setCellError(err?.message || "Save failed.");
    } finally {
      setSaving(null);
    }
  }, [adminKey, cancelEdit, draft, editing, rows, setRows]);

  async function handleDelete(row) {
    const label = `${row.parent_name} / ${row.child_name}`;
    if (!window.confirm(`Delete registration for ${label}? This cannot be undone.`)) return;
    setDeletingId(row.id);
    setCellError("");
    try {
      await deleteRegistration(adminKey, row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (editing?.rowId === row.id) cancelEdit();
    } catch (err) {
      setCellError(err?.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setCellError("");
    setShowAdd(true);
  }

  function closeAdd() {
    setShowAdd(false);
    setForm(EMPTY_FORM);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.parent_name.trim() || !form.child_name.trim() || !form.phone.trim()) {
      setCellError("Parent name, child name, and phone are required.");
      return;
    }
    setCreating(true);
    setCellError("");
    try {
      const payload = {
        parent_name: form.parent_name.trim(),
        child_name: form.child_name.trim(),
        phone: form.phone.trim(),
        phone_country_code: form.phone_country_code.trim() || null,
        email: form.email.trim() || null,
        society: form.society.trim() || null,
        age_group: form.age_group.trim() || "TBD",
        class_grade: form.class_grade.trim() || "TBD",
        timing_slot: form.timing_slot.trim() || null,
        villa_flat_number: form.villa_flat_number.trim() || null,
        batch_preference: form.batch_preference.trim() || null,
        special_requirements: form.special_requirements.trim() || null,
        payment_status: form.payment_status,
      };
      const created = await createRegistration(adminKey, payload);
      setRows((prev) => [created, ...prev]);
      closeAdd();
    } catch (err) {
      setCellError(err?.message || "Could not create registration.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>Registrations</h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
            Total: <span style={{ fontWeight: 600 }}>{rows.length}</span>
            <span style={{ marginLeft: "12px", color: "#94a3b8" }}>Click any cell to edit</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={openAdd}
            style={{
              height: "36px", padding: "0 14px", borderRadius: "8px",
              border: "none", background: "#f59e0b", color: "#fff",
              fontWeight: 600, fontSize: "13px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            <Plus size={15} /> Add
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            style={{
              height: "36px", padding: "0 16px", borderRadius: "8px",
              border: "1px solid #e2e8f0", background: "#fff", color: "#475569",
              fontWeight: 600, fontSize: "13px", cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!rows.length}
            style={{
              height: "36px", padding: "0 16px", borderRadius: "8px",
              border: "1px solid #f59e0b", background: "#fff", color: "#f59e0b",
              fontWeight: 600, fontSize: "13px",
              cursor: !rows.length ? "not-allowed" : "pointer",
              opacity: !rows.length ? 0.5 : 1,
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {(error || cellError) && (
        <div style={{
          marginBottom: "12px", padding: "12px", borderRadius: "8px",
          background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626",
          fontSize: "14px", flexShrink: 0,
        }}>
          {cellError || error}
        </div>
      )}

      <div style={{
        flex: 1,
        minHeight: 0,
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        overflow: "auto",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: "#f8fafc" }}>
              {EDITABLE_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: "left", fontWeight: 600, padding: "12px 16px",
                    whiteSpace: "nowrap", color: "#475569",
                    borderBottom: "1px solid #e2e8f0",
                    boxShadow: "0 1px 0 #e2e8f0",
                  }}
                >
                  {c.label}
                </th>
              ))}
              <th style={{
                textAlign: "center", fontWeight: 600, padding: "12px 12px",
                whiteSpace: "nowrap", color: "#475569",
                borderBottom: "1px solid #e2e8f0", width: "52px",
                boxShadow: "0 1px 0 #e2e8f0",
              }}>
                {/* delete */}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={EDITABLE_COLUMNS.length + 1} style={{ padding: "40px 16px", textAlign: "center", color: "#64748b" }}>
                  No registrations yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  {EDITABLE_COLUMNS.map((col) => {
                    const isEditing = editing?.rowId === row.id && editing?.key === col.key;
                    const isSaving = saving?.rowId === row.id && saving?.key === col.key;
                    return (
                      <td
                        key={col.key}
                        onClick={() => !isEditing && !col.readOnly && startEdit(row, col.key)}
                        style={{
                          padding: isEditing ? "6px 8px" : "10px 16px",
                          color: "#334155",
                          whiteSpace: col.multiline ? "normal" : "nowrap",
                          minWidth: col.multiline ? "240px" : undefined,
                          maxWidth: col.multiline ? "360px" : undefined,
                          verticalAlign: col.multiline ? "top" : "middle",
                          cursor: col.readOnly ? "default" : "text",
                          background: isEditing ? "#fffbeb" : undefined,
                        }}
                        title={col.readOnly ? undefined : "Click to edit"}
                      >
                        {isEditing ? (
                          col.select ? (
                            <select
                              ref={inputRef}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={onKeyDown}
                              style={{
                                width: "100%", border: "1px solid #f59e0b", borderRadius: "6px",
                                padding: "6px 8px", fontSize: "13px", outline: "none",
                              }}
                            >
                              {col.select.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : col.multiline ? (
                            <textarea
                              ref={inputRef}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={onKeyDown}
                              rows={3}
                              style={{
                                width: "100%", border: "1px solid #f59e0b", borderRadius: "6px",
                                padding: "6px 8px", fontSize: "13px", outline: "none", resize: "vertical",
                              }}
                            />
                          ) : (
                            <input
                              ref={inputRef}
                              type="text"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={onKeyDown}
                              style={{
                                width: "100%", minWidth: "80px", border: "1px solid #f59e0b",
                                borderRadius: "6px", padding: "6px 8px", fontSize: "13px", outline: "none",
                              }}
                            />
                          )
                        ) : (
                          <span style={{ opacity: isSaving ? 0.5 : 1 }}>
                            {col.key === "payment_status" ? (
                              <span style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: "20px",
                                fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                                background: row.payment_status === "confirmed" ? "#dcfce7" : "#fef3c7",
                                color: row.payment_status === "confirmed" ? "#15803d" : "#b45309",
                              }}>
                                {row.payment_status || "—"}
                              </span>
                            ) : (
                              displayValue(col.key, row[col.key])
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", padding: "8px 12px", verticalAlign: "middle" }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      disabled={deletingId === row.id}
                      title="Delete registration"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: "32px", height: "32px", borderRadius: "8px",
                        border: "1px solid #fecaca", background: "#fff",
                        color: "#dc2626", cursor: deletingId === row.id ? "not-allowed" : "pointer",
                        opacity: deletingId === row.id ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 50, padding: "16px",
          }}
          onClick={closeAdd}
        >
          <div
            role="dialog"
            aria-labelledby="add-registration-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto",
              background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15)", padding: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 id="add-registration-title" style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>
                Add registration
              </h3>
              <button type="button" onClick={closeAdd} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {FORM_FIELDS.map((f) => (
                  <div key={f.key} style={{ gridColumn: f.multiline ? "1 / -1" : undefined }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                      {f.label}{f.required ? " *" : ""}
                    </label>
                    {f.select ? (
                      <select
                        value={form[f.key]}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 10px", fontSize: "13px" }}
                      >
                        {f.select.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : f.multiline ? (
                      <textarea
                        value={form[f.key]}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        rows={3}
                        placeholder={f.placeholder}
                        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", resize: "vertical" }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={form[f.key]}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        required={!!f.required}
                        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 10px", fontSize: "13px" }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={closeAdd}
                  style={{ height: "36px", padding: "0 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ height: "36px", padding: "0 16px", borderRadius: "8px", border: "none", background: "#f59e0b", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.7 : 1 }}
                >
                  {creating ? "Saving…" : "Save registration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
