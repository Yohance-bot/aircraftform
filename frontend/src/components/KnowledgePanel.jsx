import { useState, useEffect } from "react";

import {
  fetchKnowledge,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
} from "../api.js";

export default function KnowledgePanel({ adminKey }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Expanded entries
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    loadEntries();
  }, [adminKey]);

  async function loadEntries() {
    setError("");
    try {
      const data = await fetchKnowledge(adminKey);
      setEntries(data);
    } catch (err) {
      setError(err.message || "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  function handleAddNew() {
    setEditingEntry(null);
    setFormTitle("");
    setFormContent("");
    setShowModal(true);
  }

  function handleEdit(entry) {
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingEntry(null);
    setFormTitle("");
    setFormContent("");
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) return;

    setSaving(true);
    try {
      if (editingEntry) {
        await updateKnowledgeEntry(
          adminKey,
          editingEntry.id,
          formTitle.trim(),
          formContent.trim()
        );
      } else {
        await createKnowledgeEntry(adminKey, formTitle.trim(), formContent.trim());
      }
      handleCloseModal();
      await loadEntries();
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteKnowledgeEntry(adminKey, id);
      setConfirmDeleteId(null);
      await loadEntries();
    } catch (err) {
      setError(err.message || "Failed to delete");
    }
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function formatDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  }

  function truncateContent(content, maxLen = 100) {
    if (content.length <= maxLen) return content;
    return content.slice(0, maxLen) + "...";
  }

  if (loading) {
    return (
      <div
        className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 p-8"
        style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div className="text-center text-slate-500">Loading knowledge base...</div>
      </div>
    );
  }

  return (
    <div 
      className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100"
      style={{ width: "100%", height: "100%", minHeight: 0, overflowY: "auto" }}
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">📋 Knowledge Base</h2>
        <button
          type="button"
          onClick={handleAddNew}
          className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors"
        >
          Add Entry
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Entry List */}
      <div className="p-6 space-y-4">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p className="text-lg mb-2">No knowledge entries yet.</p>
            <p className="text-sm">
              Add your first entry to help the bot answer questions.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            const isConfirmingDelete = confirmDeleteId === entry.id;

            return (
              <div key={entry.id}>
                <div
                  style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}
                  className="hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => toggleExpand(entry.id)}
                    >
                      <h3 className="font-bold text-slate-900">{entry.title}</h3>
                      <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                        {isExpanded
                          ? entry.content
                          : truncateContent(entry.content)}
                      </p>
                      <p className="text-xs text-slate-400 mt-2">
                        Created: {formatDate(entry.created_at)}
                        {entry.updated_at !== entry.created_at && (
                          <> · Updated: {formatDate(entry.updated_at)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEdit(entry)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                {isConfirmingDelete && (
                  <div className="mt-2 mx-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-amber-800">Are you sure?</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="px-3 py-1 rounded bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          onClick={handleCloseModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "560px",
              margin: "0 16px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)"
            }}
          >
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                {editingEntry ? "Edit Entry" : "New Entry"}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Camp Schedule"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Content
                  </label>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Enter the knowledge content that the bot can use to answer questions..."
                    className="w-full h-48 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 resize-y"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !formTitle.trim() || !formContent.trim()}
                  className="px-4 py-2 rounded-lg font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-300 transition-colors"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
