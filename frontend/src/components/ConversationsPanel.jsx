import { useState, useEffect, useRef } from "react";

import {
  fetchConversations,
  fetchConversation,
  sendManualMessage,
  updateBucket,
  pauseBot,
} from "../api.js";

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

function relativeTime(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  return (
    <div className="flex h-[calc(100vh-12rem)] rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 overflow-hidden">
      {/* Left Panel - Conversation List */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 flex flex-col">
        {/* Search & Filter */}
        <div className="p-3 border-b border-slate-200 space-y-2">
          <input
            type="text"
            placeholder="Search name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
          />
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
          >
            <option value="all">All Buckets</option>
            {BUCKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-center text-slate-500 text-sm">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
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
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedPhone ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Select a conversation
          </div>
        ) : loadingChat && !selectedConvo ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Loading...
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
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-800 text-sm font-medium">
                Bot paused — you are in manual mode
              </div>
            )}

            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50"
            >
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            <div className="px-4 py-2 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => handleBucketChange("payment_confirmed")}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors"
              >
                Mark as Paid
              </button>
              <button
                type="button"
                onClick={() => handleBucketChange("needs_followup")}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 font-medium transition-colors"
              >
                Flag Follow-up
              </button>
            </div>

            {/* Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-slate-200 flex gap-2"
            >
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 disabled:bg-slate-100"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white font-semibold text-sm transition-colors"
              >
                {sending ? "..." : "Send"}
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
  const displayName = c.parent_name || c.phone;
  const bucketColor = BUCKET_COLORS[c.bucket] || "bg-slate-100 text-slate-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-brand-50 transition-colors ${
        selected ? "bg-brand-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 truncate">
              {displayName}
            </span>
            {c.unread_count > 0 && (
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">
                {c.unread_count > 9 ? "9+" : c.unread_count}
              </span>
            )}
          </div>
          {c.child_name && (
            <div className="text-xs text-slate-500 truncate">{c.child_name}</div>
          )}
          {c.last_message && (
            <div className="text-sm text-slate-600 truncate mt-0.5">
              {c.last_message}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-slate-400">
            {relativeTime(c.updated_at)}
          </div>
          <span
            className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${bucketColor}`}
          >
            {BUCKET_OPTIONS.find((o) => o.value === c.bucket)?.label || c.bucket}
          </span>
        </div>
      </div>
    </button>
  );
}

function ChatHeader({ conversation, onBucketChange, onToggleBotPause }) {
  const c = conversation;

  return (
    <div className="px-4 py-3 border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900 truncate">
            {c.parent_name || "Unknown"}
          </h2>
          <div className="text-sm text-slate-500">
            {c.child_name && <span>{c.child_name} · </span>}
            <span>{c.phone}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={c.bucket}
            onChange={(e) => onBucketChange(e.target.value)}
            className={`text-xs px-2 py-1 rounded-lg border-0 font-medium focus:outline-none focus:ring-2 focus:ring-brand-300 ${
              BUCKET_COLORS[c.bucket] || "bg-slate-100 text-slate-700"
            }`}
          >
            {BUCKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onToggleBotPause}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              c.bot_paused
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {c.bot_paused ? "Bot Paused" : "Bot Active"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isIncoming = message.direction === "in";
  const isBot = message.sender === "bot";
  const isAdmin = message.sender === "admin";

  let bubbleClass = "";
  let labelText = "";

  if (isIncoming) {
    bubbleClass = "bg-white border border-slate-200 text-slate-800";
    labelText = "";
  } else if (isBot) {
    bubbleClass = "bg-brand-500 text-white";
    labelText = "Bot";
  } else if (isAdmin) {
    bubbleClass = "bg-green-500 text-white";
    labelText = "You";
  } else {
    bubbleClass = "bg-slate-500 text-white";
    labelText = "";
  }

  return (
    <div className={`flex ${isIncoming ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[70%] ${isIncoming ? "" : "text-right"}`}>
        {labelText && (
          <div
            className={`text-xs mb-0.5 ${
              isIncoming ? "text-slate-500" : "text-slate-500"
            }`}
          >
            {labelText}
          </div>
        )}
        <div
          className={`inline-block px-3 py-2 rounded-xl text-sm whitespace-pre-wrap break-words ${bubbleClass}`}
        >
          {message.body}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {formatMessageTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
