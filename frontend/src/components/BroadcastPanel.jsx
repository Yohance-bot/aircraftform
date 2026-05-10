import { useState, useEffect, useMemo } from "react";

import { fetchConversations, broadcastMessage } from "../api.js";

const BUCKET_OPTIONS = [
  { value: "new_enquiry", label: "New Enquiry" },
  { value: "form_submitted", label: "Form Submitted" },
  { value: "payment_confirmed", label: "Payment Confirmed" },
  { value: "needs_followup", label: "Needs Follow-up" },
  { value: "not_interested", label: "Not Interested" },
  { value: "waitlist", label: "Waitlist" },
];

const BUCKET_COLORS = {
  new_enquiry: "bg-blue-100 text-blue-700",
  form_submitted: "bg-amber-100 text-amber-700",
  payment_confirmed: "bg-green-100 text-green-700",
  needs_followup: "bg-orange-100 text-orange-700",
  not_interested: "bg-red-100 text-red-700",
  waitlist: "bg-purple-100 text-purple-700",
};

const MAX_MESSAGE_LENGTH = 4096;

export default function BroadcastPanel({ adminKey }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Message composer state
  const [message, setMessage] = useState("");

  // Recipient selection mode
  const [selectionMode, setSelectionMode] = useState("all"); // "all" | "bucket" | "manual"

  // Bucket selection (for bucket mode)
  const [selectedBuckets, setSelectedBuckets] = useState(new Set());

  // Manual selection (for manual mode)
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [manualSearch, setManualSearch] = useState("");

  // Send state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [sendResult, setSendResult] = useState(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [adminKey]);

  async function loadConversations() {
    try {
      const data = await fetchConversations(adminKey);
      setConversations(data);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate selected recipients based on mode
  const selectedRecipients = useMemo(() => {
    if (selectionMode === "all") {
      return conversations.map((c) => c.phone);
    }
    if (selectionMode === "bucket") {
      return conversations
        .filter((c) => selectedBuckets.has(c.bucket))
        .map((c) => c.phone);
    }
    if (selectionMode === "manual") {
      return Array.from(selectedPhones);
    }
    return [];
  }, [conversations, selectionMode, selectedBuckets, selectedPhones]);

  const recipientCount = selectedRecipients.length;

  // Filtered conversations for manual mode
  const filteredConversations = useMemo(() => {
    if (!manualSearch.trim()) return conversations;
    const q = manualSearch.toLowerCase();
    return conversations.filter((c) => {
      const name = (c.parent_name || "").toLowerCase();
      const child = (c.child_name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      return name.includes(q) || child.includes(q) || phone.includes(q);
    });
  }, [conversations, manualSearch]);

  function toggleBucket(bucket) {
    setSelectedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  }

  function togglePhone(phone) {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    const phones = filteredConversations.map((c) => c.phone);
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      phones.forEach((p) => next.add(p));
      return next;
    });
  }

  function clearAllFiltered() {
    const phones = filteredConversations.map((c) => c.phone);
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      phones.forEach((p) => next.delete(p));
      return next;
    });
  }

  function handleSendClick() {
    if (!message.trim() || recipientCount === 0) return;
    setShowConfirmModal(true);
  }

  async function handleConfirmSend() {
    setShowConfirmModal(false);
    setSending(true);
    setSendProgress({ current: 0, total: recipientCount });
    setSendResult(null);

    try {
      const result = await broadcastMessage(
        adminKey,
        message.trim(),
        selectedRecipients
      );
      setSendResult(result);
    } catch (err) {
      console.error("Broadcast failed:", err);
      setSendResult({
        sent: 0,
        failed: recipientCount,
        error: err.message,
        results: selectedRecipients.map((p) => ({
          phone: p,
          success: false,
          error: err.message,
        })),
      });
    } finally {
      setSending(false);
      setSendProgress({ current: 0, total: 0 });
    }
  }

  const messageLength = message.length;
  const isOverLimit = messageLength > MAX_MESSAGE_LENGTH;
  const canSend =
    message.trim().length > 0 &&
    recipientCount > 0 &&
    !isOverLimit &&
    !sending;

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 p-8">
        <div className="text-center text-slate-500">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div 
      className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100"
      style={{ width: "100%", height: "calc(100vh - 310px)", overflowY: "auto" }}
    >
      {/* Message Composer Section */}
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Message Composer
        </h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          rows={6}
          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 ${
            isOverLimit
              ? "border-red-300 focus:border-red-400 focus:ring-red-200"
              : "border-slate-200"
          }`}
        />
        <div className="flex justify-between mt-2">
          <span
            className={`text-xs ${
              isOverLimit ? "text-red-600 font-semibold" : "text-slate-500"
            }`}
          >
            {messageLength} / {MAX_MESSAGE_LENGTH} characters
            {isOverLimit && " (exceeds limit)"}
          </span>
        </div>

        {/* WhatsApp Preview */}
        {message.trim() && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Preview:</p>
            <div className="bg-slate-100 rounded-2xl p-4 max-w-md">
              <div className="bg-white rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
                <p className="text-sm text-slate-800 whitespace-pre-wrap">
                  {message.slice(0, MAX_MESSAGE_LENGTH)}
                </p>
                <p className="text-xs text-slate-400 mt-1 text-right">
                  {new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recipient Selector Section */}
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Recipients ({recipientCount} selected)
        </h2>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSelectionMode("all")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              selectionMode === "all"
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All ({conversations.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectionMode("bucket")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              selectionMode === "bucket"
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            By Bucket
          </button>
          <button
            type="button"
            onClick={() => setSelectionMode("manual")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              selectionMode === "manual"
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Manual
          </button>
        </div>

        {/* Bucket Selection */}
        {selectionMode === "bucket" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Select buckets to include:
            </p>
            <div className="flex flex-wrap gap-2">
              {BUCKET_OPTIONS.map((bucket) => {
                const isSelected = selectedBuckets.has(bucket.value);
                const bucketColor =
                  BUCKET_COLORS[bucket.value] || "bg-slate-100 text-slate-700";
                return (
                  <button
                    key={bucket.value}
                    type="button"
                    onClick={() => toggleBucket(bucket.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                      isSelected
                        ? `${bucketColor} border-transparent ring-2 ring-brand-300`
                        : `bg-white text-slate-600 border-slate-200 hover:bg-slate-50`
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded border ${
                          isSelected
                            ? "bg-brand-500 border-brand-500"
                            : "border-slate-300"
                        } flex items-center justify-center`}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      {bucket.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual Selection */}
        {selectionMode === "manual" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAllFiltered}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  No conversations found
                </div>
              ) : (
                filteredConversations.map((c) => {
                  const isSelected = selectedPhones.has(c.phone);
                  const bucketColor =
                    BUCKET_COLORS[c.bucket] ||
                    "bg-slate-100 text-slate-700";
                  return (
                    <label
                      key={c.phone}
                      className={`flex items-center gap-3 p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${
                        isSelected ? "bg-brand-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePhone(c.phone)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">
                            {c.parent_name || c.phone}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${bucketColor}`}
                          >
                            {BUCKET_OPTIONS.find(
                              (o) => o.value === c.bucket
                            )?.label || c.bucket}
                          </span>
                        </div>
                        {c.child_name && (
                          <div className="text-xs text-slate-500">
                            {c.child_name}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Send Bar */}
      <div className="p-6 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-semibold">{recipientCount}</span> recipients
            selected
          </div>
          <button
            type="button"
            onClick={handleSendClick}
            disabled={!canSend}
            className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white font-semibold transition-colors"
          >
            {sending
              ? `Sending... ${sendProgress.current}/${sendProgress.total}`
              : `Send to ${recipientCount} recipients`}
          </button>
        </div>

        {/* Send Result Banner */}
        {sendResult && (
          <div
            className={`mt-4 p-4 rounded-xl ${
              sendResult.failed === 0
                ? "bg-green-50 border border-green-200"
                : sendResult.sent === 0
                ? "bg-red-50 border border-red-200"
                : "bg-amber-50 border border-amber-200"
            }`}
          >
            <p
              className={`font-semibold ${
                sendResult.failed === 0
                  ? "text-green-800"
                  : sendResult.sent === 0
                  ? "text-red-800"
                  : "text-amber-800"
              }`}
            >
              {sendResult.failed === 0
                ? "✅ All messages sent successfully!"
                : sendResult.sent === 0
                ? "❌ All messages failed"
                : `⚠️ Sent: ${sendResult.sent}, Failed: ${sendResult.failed}`}
            </p>
            {sendResult.results && sendResult.results.some((r) => !r.success) && (
              <div className="mt-2 text-sm">
                <p className="font-medium text-slate-700">Failed deliveries:</p>
                <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {sendResult.results
                    .filter((r) => !r.success)
                    .map((r) => (
                      <li key={r.phone} className="text-red-600 text-xs">
                        {r.phone}: {r.error || "Unknown error"}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Confirm Broadcast
            </h3>
            <p className="text-slate-600 mb-6">
              You're about to send to{" "}
              <span className="font-semibold">{recipientCount}</span> parents.
              This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                className="px-4 py-2 rounded-lg font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
              >
                Confirm Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
