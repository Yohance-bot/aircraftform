import { useState, useEffect, useRef } from "react";

import {
  fetchConversations,
  fetchConversation,
  sendManualMessage,
  updateBucket,
  pauseBot,
} from "../api.js";

const BUCKET_OPTIONS = [
  { value: "new_enquiry", label: "New Enquiry", color: "#3b82f6" },
  { value: "form_submitted", label: "Form Submitted", color: "#f59e0b" },
  { value: "payment_confirmed", label: "Paid", color: "#22c55e" },
  { value: "needs_followup", label: "Needs Follow-up", color: "#ef4444" },
  { value: "not_interested", label: "Not Interested", color: "#6b7280" },
  { value: "waitlist", label: "Waitlist", color: "#8b5cf6" },
];

const BUCKET_STYLES = {
  new_enquiry: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  form_submitted: { bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  payment_confirmed: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  needs_followup: { bg: "#fee2e2", text: "#dc2626", border: "#fca5a5" },
  not_interested: { bg: "#f3f4f6", text: "#4b5563", border: "#d1d5db" },
  waitlist: { bg: "#ede9fe", text: "#7c3aed", border: "#c4b5fd" },
};

function relativeTime(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(name) {
  const colors = [
    "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", 
    "#10b981", "#06b6d4", "#6366f1", "#f43f5e"
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function ConversationsPanel({ adminKey }) {
  const [conversations, setConversations] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, [adminKey]);

  useEffect(() => {
    if (!selectedPhone) return;
    loadSelectedConversation();
    const interval = setInterval(loadSelectedConversation, 5000);
    return () => clearInterval(interval);
  }, [selectedPhone, adminKey]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadConversations() {
    try {
      const data = await fetchConversations(adminKey);
      setConversations(data);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoadingList(false);
    }
  }

  async function loadSelectedConversation() {
    if (!selectedPhone) return;
    try {
      const data = await fetchConversation(adminKey, selectedPhone);
      setSelectedConvo(data.conversation);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to load conversation:", err);
    } finally {
      setLoadingChat(false);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSelectConversation(phone) {
    setSelectedPhone(phone);
    setLoadingChat(true);
    setMessages([]);
    setSelectedConvo(null);
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedPhone || sending) return;

    const msgText = newMessage.trim();
    setSending(true);

    const optimisticMsg = {
      id: Date.now(),
      phone: selectedPhone,
      direction: "out",
      body: msgText,
      sender: "admin",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");

    try {
      await sendManualMessage(adminKey, selectedPhone, msgText);
      loadSelectedConversation();
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setNewMessage(msgText);
    } finally {
      setSending(false);
    }
  }

  async function handleBucketChange(bucket) {
    if (!selectedPhone) return;
    try {
      const updated = await updateBucket(adminKey, selectedPhone, bucket);
      setSelectedConvo(updated);
      loadConversations();
    } catch (err) {
      console.error("Failed to update bucket:", err);
    }
  }

  async function handleToggleBotPause() {
    if (!selectedPhone || !selectedConvo) return;
    try {
      const updated = await pauseBot(adminKey, selectedPhone, !selectedConvo.bot_paused);
      setSelectedConvo(updated);
      loadConversations();
    } catch (err) {
      console.error("Failed to toggle bot pause:", err);
    }
  }

  const filteredConversations = conversations.filter((c) => {
    if (bucketFilter !== "all" && c.bucket !== bucketFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (c.parent_name || "").toLowerCase();
      const child = (c.child_name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      if (!name.includes(q) && !child.includes(q) && !phone.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const needsFollowupCount = conversations.filter(c => c.bucket === "needs_followup").length;

  return (
    <div 
      style={{ 
        display: "flex", 
        width: "100%", 
        height: "100%",
        background: "#fff",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)"
      }}
    >
      {/* Left Panel - Conversation List */}
      <div style={{ 
        width: "320px", 
        minWidth: "320px",
        borderRight: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        background: "#fafbfc"
      }}>
        {/* Header */}
        <div style={{ 
          padding: "16px", 
          borderBottom: "1px solid #e5e7eb",
          background: "#fff"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>
              Messages
            </h2>
            {needsFollowupCount > 0 && (
              <span style={{
                background: "#fee2e2",
                color: "#dc2626",
                fontSize: "12px",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#dc2626" }} />
                {needsFollowupCount} need attention
              </span>
            )}
          </div>
          
          {/* Search */}
          <div style={{ position: "relative", marginBottom: "10px" }}>
            <svg style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 38px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                fontSize: "14px",
                outline: "none",
                background: "#f8fafc",
                boxSizing: "border-box"
              }}
            />
          </div>

          {/* Filter */}
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "13px",
              background: "#fff",
              cursor: "pointer",
              color: "#475569"
            }}
          >
            <option value="all">All Conversations</option>
            {BUCKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingList ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
              Loading conversations...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
              No conversations found
            </div>
          ) : (
            filteredConversations.map((c) => (
              <ConversationRow
                key={c.phone}
                conversation={c}
                selected={c.phone === selectedPhone}
                onClick={() => handleSelectConversation(c.phone)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Chat View */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
        {!selectedPhone ? (
          <div style={{ 
            flex: 1, 
            display: "flex", 
            flexDirection: "column",
            alignItems: "center", 
            justifyContent: "center",
            color: "#94a3b8",
            background: "#f8fafc"
          }}>
            <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: "16px", opacity: 0.5 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p style={{ fontSize: "16px", fontWeight: 500 }}>Select a conversation</p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>Choose from the list to start messaging</p>
          </div>
        ) : loadingChat && !selectedConvo ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
            Loading conversation...
          </div>
        ) : selectedConvo ? (
          <>
            {/* Chat Header */}
            <ChatHeader
              conversation={selectedConvo}
              onBucketChange={handleBucketChange}
              onToggleBotPause={handleToggleBotPause}
            />

            {/* Bot Paused Banner */}
            {selectedConvo.bot_paused && (
              <div style={{
                background: "#fef3c7",
                borderBottom: "1px solid #fcd34d",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#92400e"
              }}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Bot paused — Manual mode active
              </div>
            )}

            {/* Needs Followup Banner */}
            {selectedConvo.bucket === "needs_followup" && (
              <div style={{
                background: "#fee2e2",
                borderBottom: "1px solid #fca5a5",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#dc2626"
              }}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                This conversation needs your attention — Bot couldn't resolve
              </div>
            )}

            {/* Messages */}
            <div
              ref={chatContainerRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px",
                background: "linear-gradient(180deg, #f0f4f8 0%, #e8ecf1 100%)",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23cbd5e1' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}
            >
              {messages.length === 0 ? (
                <div style={{ textAlign: "center", color: "#94a3b8", padding: "40px", fontSize: "14px" }}>
                  No messages yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            <div style={{
              padding: "10px 16px",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              gap: "8px",
              background: "#fafbfc"
            }}>
              <button
                type="button"
                onClick={() => handleBucketChange("payment_confirmed")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid #86efac",
                  background: "#dcfce7",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Mark as Paid
              </button>
              <button
                type="button"
                onClick={() => handleBucketChange("needs_followup")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid #fca5a5",
                  background: "#fee2e2",
                  color: "#dc2626",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                </svg>
                Flag Follow-up
              </button>
              <button
                type="button"
                onClick={() => handleBucketChange("new_enquiry")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Clear Status
              </button>
            </div>

            {/* Input Bar */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: "12px 16px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: "10px",
                background: "#fff"
              }}
            >
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "24px",
                  border: "1px solid #e5e7eb",
                  fontSize: "14px",
                  outline: "none",
                  background: sending ? "#f1f5f9" : "#f8fafc"
                }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                style={{
                  padding: "12px 24px",
                  borderRadius: "24px",
                  border: "none",
                  background: !newMessage.trim() || sending ? "#cbd5e1" : "#3b82f6",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: !newMessage.trim() || sending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
                Send
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ConversationRow({ conversation, selected, onClick }) {
  const c = conversation;
  const displayName = c.parent_name || "Unknown";
  const isNeedsFollowup = c.bucket === "needs_followup";
  const bucketStyle = BUCKET_STYLES[c.bucket] || BUCKET_STYLES.new_enquiry;
  const avatarColor = getAvatarColor(displayName);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderBottom: "1px solid #f1f5f9",
        background: selected ? "#eff6ff" : isNeedsFollowup ? "#fef2f2" : "#fff",
        cursor: "pointer",
        border: "none",
        borderLeft: isNeedsFollowup ? "3px solid #ef4444" : selected ? "3px solid #3b82f6" : "3px solid transparent",
        transition: "all 0.15s ease"
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = isNeedsFollowup ? "#fee2e2" : "#f8fafc";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = isNeedsFollowup ? "#fef2f2" : "#fff";
      }}
    >
      <div style={{ display: "flex", gap: "12px" }}>
        {/* Avatar */}
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: avatarColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 700,
          fontSize: "15px",
          flexShrink: 0
        }}>
          {getInitials(displayName)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
            <span style={{ 
              fontWeight: 600, 
              fontSize: "14px",
              color: isNeedsFollowup ? "#dc2626" : "#1e293b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
              {displayName}
            </span>
            <span style={{ fontSize: "11px", color: "#94a3b8", flexShrink: 0, marginLeft: "8px" }}>
              {relativeTime(c.updated_at)}
            </span>
          </div>

          {c.child_name && (
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
              {c.child_name}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{
              fontSize: "12px",
              color: "#64748b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1
            }}>
              {c.last_message || "No messages yet"}
            </span>
            
            <span style={{
              fontSize: "10px",
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: "12px",
              background: bucketStyle.bg,
              color: bucketStyle.text,
              border: `1px solid ${bucketStyle.border}`,
              flexShrink: 0,
              textTransform: "uppercase",
              letterSpacing: "0.3px"
            }}>
              {BUCKET_OPTIONS.find((o) => o.value === c.bucket)?.label || c.bucket}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ChatHeader({ conversation, onBucketChange, onToggleBotPause }) {
  const c = conversation;
  const displayName = c.parent_name || "Unknown";
  const avatarColor = getAvatarColor(displayName);
  const bucketStyle = BUCKET_STYLES[c.bucket] || BUCKET_STYLES.new_enquiry;

  return (
    <div style={{
      padding: "16px 20px",
      borderBottom: "1px solid #e5e7eb",
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {/* Avatar */}
        <div style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: avatarColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 700,
          fontSize: "17px"
        }}>
          {getInitials(displayName)}
        </div>

        {/* Info */}
        <div>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>
            {displayName}
          </h2>
          <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
            {c.child_name && <span>{c.child_name} · </span>}
            <span>{c.phone}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Bucket Selector */}
        <select
          value={c.bucket}
          onChange={(e) => onBucketChange(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: `1px solid ${bucketStyle.border}`,
            background: bucketStyle.bg,
            color: bucketStyle.text,
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            outline: "none"
          }}
        >
          {BUCKET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Bot Toggle */}
        <button
          type="button"
          onClick={onToggleBotPause}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            border: "none",
            background: c.bot_paused ? "#fef3c7" : "#dcfce7",
            color: c.bot_paused ? "#92400e" : "#15803d",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          {c.bot_paused ? (
            <>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Bot Paused
            </>
          ) : (
            <>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Bot Active
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isIncoming = message.direction === "in";
  const isBot = message.sender === "bot";
  const isAdmin = message.sender === "admin";

  let bubbleStyle = {};
  let labelText = "";
  let labelColor = "";

  if (isIncoming) {
    bubbleStyle = {
      background: "#fff",
      color: "#1e293b",
      borderRadius: "4px 18px 18px 18px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
    };
    labelText = "";
  } else if (isBot) {
    bubbleStyle = {
      background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
      color: "#fff",
      borderRadius: "18px 4px 18px 18px"
    };
    labelText = "🤖 Bot";
    labelColor = "#3b82f6";
  } else if (isAdmin) {
    bubbleStyle = {
      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      color: "#fff",
      borderRadius: "18px 4px 18px 18px"
    };
    labelText = "👤 You";
    labelColor = "#10b981";
  } else {
    bubbleStyle = {
      background: "#6b7280",
      color: "#fff",
      borderRadius: "18px 4px 18px 18px"
    };
    labelText = "System";
    labelColor = "#6b7280";
  }

  return (
    <div style={{ 
      display: "flex", 
      justifyContent: isIncoming ? "flex-start" : "flex-end" 
    }}>
      <div style={{ maxWidth: "70%" }}>
        {labelText && (
          <div style={{
            fontSize: "11px",
            fontWeight: 600,
            color: labelColor,
            marginBottom: "4px",
            textAlign: isIncoming ? "left" : "right"
          }}>
            {labelText}
          </div>
        )}
        <div style={{
          padding: "10px 14px",
          fontSize: "14px",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          ...bubbleStyle
        }}>
          {message.body}
        </div>
        <div style={{
          fontSize: "10px",
          color: "#94a3b8",
          marginTop: "4px",
          textAlign: isIncoming ? "left" : "right"
        }}>
          {formatMessageTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
