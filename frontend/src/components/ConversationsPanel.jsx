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

const MENU_MARKER = "__WA_INTERACTIVE_MENU__:";

const DEFAULT_MENU_SECTIONS = [
  {
    title: "Registration & Payment",
    rows: [
      { title: "📝 Register My Child", description: "Register via WhatsApp chat" },
      { title: "Check My Registration", description: "View your registration status" },
      { title: "Payment Information", description: "Payment details and status" },
    ],
  },
  {
    title: "Camp Information",
    rows: [
      { title: "Schedule & Timings", description: "When and how long" },
      { title: "What to Bring", description: "Packing checklist" },
      { title: "Age & Eligibility", description: "Who can join" },
      { title: "Food & Snacks", description: "Meals and refreshments" },
      { title: "Location & Logistics", description: "Where we are" },
    ],
  },
  {
    title: "Support",
    rows: [{ title: "Speak to Us", description: "Talk to our team" }],
  },
];

const DEFAULT_MENU = {
  header: "🛩 AMC Aeromodelling Camp",
  body:
    "Welcome to AMC Aeromodelling Camp! 🛩\n\nWe have camps at *Palm Meadows* and *Prestige White Meadows*.\n\nRegister your child or ask me anything!",
  footer: "💬 Or just type your question below!",
  button: "View Options",
  sections: DEFAULT_MENU_SECTIONS,
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

function buildPersonalizedMenu(conversation) {
  if (!conversation?.parent_name) return DEFAULT_MENU;

  const parentFirst = conversation.parent_name.split(" ")[0] || "there";
  const childName = conversation.child_name || "your child";

  return {
    header: `Hi ${parentFirst}! 👋`,
    body: `Welcome back! ${childName} is all set 🛩\nHow can I help you today?`,
    footer: "💬 Or just type your question below!",
    button: "View Options",
    sections: DEFAULT_MENU_SECTIONS,
  };
}

function parseMenuMessage(body, conversation) {
  if (!body) return null;

  if (body.startsWith(MENU_MARKER)) {
    try {
      return JSON.parse(body.slice(MENU_MARKER.length));
    } catch {
      return buildPersonalizedMenu(conversation);
    }
  }

  if (body === "[Sent main menu]") {
    return buildPersonalizedMenu(conversation);
  }

  return null;
}

function previewMessage(body, conversation) {
  const menu = parseMenuMessage(body, conversation);
  if (menu) return menu.header || "View Options";
  if (body === "🏠 Returned to main menu") return "🏠 Main Menu";
  return body;
}

function formatWhatsAppText(text) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(1, -1)}
        </strong>
      );
    }
    return part;
  });
}

function Avatar({ name, phone, size = 40 }) {
  const label = (name || phone || "?").charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full bg-[#dfe5e7] text-[#54656f] flex items-center justify-center font-medium flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {label}
    </div>
  );
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
    <div className="flex h-full w-full overflow-hidden bg-white">
      {/* Left Panel — Chat list (WhatsApp sidebar) */}
      <div className="flex-shrink-0 border-r border-[#e9edef] flex flex-col bg-white w-[360px] min-w-[300px]">
        <div className="px-3 py-3 bg-[#f0f2f5] border-b border-[#e9edef] space-y-2">
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-white px-3 py-2 text-[14px] text-[#3b4a54] placeholder:text-[#8696a0] border-0 focus:outline-none focus:ring-1 focus:ring-[#00a884]"
          />
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value)}
            className="w-full rounded-lg bg-white px-3 py-2 text-[13px] text-[#3b4a54] border-0 focus:outline-none focus:ring-1 focus:ring-[#00a884]"
          >
            <option value="all">All Buckets</option>
            {BUCKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-center text-[#8696a0] text-sm">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-[#8696a0] text-sm">
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

      {/* Right Panel — Chat view */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#efeae2]">
        {!selectedPhone ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#41525d] bg-[#f0f2f5] border-b-[6px] border-[#00a884]">
            <div className="text-[32px] mb-4">💬</div>
            <h2 className="text-[32px] font-light text-[#41525d] mb-2">AMC Conversations</h2>
            <p className="text-[14px] text-[#667781] max-w-sm text-center">
              Select a conversation to view and reply to WhatsApp messages
            </p>
          </div>
        ) : loadingChat && !selectedConvo ? (
          <div className="flex-1 flex items-center justify-center text-[#8696a0]">
            Loading...
          </div>
        ) : selectedConvo ? (
          <>
            <ChatHeader
              conversation={selectedConvo}
              onBucketChange={handleBucketChange}
              onToggleBotPause={handleToggleBotPause}
            />

            {selectedConvo.bot_paused && (
              <div className="bg-[#fff3cd] border-b border-[#ffc107] px-4 py-2 text-[#856404] text-[13px] font-medium text-center">
                Bot paused — you are in manual mode
              </div>
            )}

            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto px-[8%] py-3"
              style={{
                backgroundColor: "#efeae2",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.35'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  conversation={selectedConvo}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-2 bg-[#f0f2f5] border-t border-[#e9edef] flex gap-2">
              <button
                type="button"
                onClick={() => handleBucketChange("payment_confirmed")}
                className="text-[12px] px-3 py-1.5 rounded-md bg-[#d9fdd3] text-[#008069] hover:bg-[#c5f0bf] font-medium transition-colors"
              >
                Mark as Paid
              </button>
              <button
                type="button"
                onClick={() => handleBucketChange("needs_followup")}
                className="text-[12px] px-3 py-1.5 rounded-md bg-[#fff3cd] text-[#856404] hover:bg-[#ffe69c] font-medium transition-colors"
              >
                Flag Follow-up
              </button>
            </div>

            <form
              onSubmit={handleSendMessage}
              className="px-4 py-3 bg-[#f0f2f5] flex gap-3 items-center"
            >
              <input
                type="text"
                placeholder="Type a message"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                className="flex-1 rounded-lg bg-white px-4 py-2.5 text-[15px] text-[#3b4a54] placeholder:text-[#8696a0] border-0 focus:outline-none focus:ring-1 focus:ring-[#00a884] disabled:bg-[#f0f2f5]"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="px-5 py-2.5 rounded-lg bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#8696a0] text-white font-medium text-[14px] transition-colors"
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
  const preview = c.last_message
    ? previewMessage(c.last_message, c)
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-3 flex items-center gap-3 border-b border-[#e9edef] transition-colors ${
        selected ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"
      }`}
    >
      <Avatar name={c.parent_name} phone={c.phone} size={49} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-normal text-[17px] text-[#111b21] truncate">
            {displayName}
          </span>
          <span className="text-[12px] text-[#667781] flex-shrink-0">
            {relativeTime(c.updated_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="text-[14px] text-[#667781] truncate min-w-0">
            {preview}
          </div>
          {c.unread_count > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-[#25d366] text-white text-[12px] font-medium flex items-center justify-center px-1.5">
              {c.unread_count > 9 ? "9+" : c.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatHeader({ conversation, onBucketChange, onToggleBotPause }) {
  const c = conversation;

  return (
    <div className="px-4 py-2.5 bg-[#f0f2f5] border-b border-[#e9edef]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={c.parent_name} phone={c.phone} size={40} />
          <div className="min-w-0">
            <h2 className="font-normal text-[16px] text-[#111b21] truncate">
              {c.parent_name || "Unknown"}
            </h2>
            <div className="text-[13px] text-[#667781] truncate">
              {c.child_name && <span>{c.child_name} · </span>}
              <span>{c.phone}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={c.bucket}
            onChange={(e) => onBucketChange(e.target.value)}
            className={`text-[11px] px-2 py-1 rounded-md border-0 font-medium focus:outline-none focus:ring-1 focus:ring-[#00a884] ${
              BUCKET_COLORS[c.bucket] || "bg-[#e9edef] text-[#54656f]"
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
            className={`text-[11px] px-3 py-1.5 rounded-md font-medium transition-colors ${
              c.bot_paused
                ? "bg-[#fff3cd] text-[#856404] hover:bg-[#ffe69c]"
                : "bg-[#d9fdd3] text-[#008069] hover:bg-[#c5f0bf]"
            }`}
          >
            {c.bot_paused ? "Bot Paused" : "Bot Active"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InteractiveMenuCard({ menu, isOutgoing, timestamp }) {
  return (
    <div
      className={`max-w-[420px] rounded-lg shadow-sm overflow-hidden ${
        isOutgoing ? "bg-[#d9fdd3]" : "bg-white"
      }`}
    >
      {menu.header && (
        <div className="px-3 pt-2.5 pb-1">
          <div className="text-[15px] font-semibold text-[#111b21] leading-snug">
            {menu.header}
          </div>
        </div>
      )}
      {menu.body && (
        <div className="px-3 pb-1 text-[14.2px] text-[#111b21] leading-[19px] whitespace-pre-wrap">
          {formatWhatsAppText(menu.body)}
        </div>
      )}
      {menu.footer && (
        <div className="px-3 pb-2 text-[12px] text-[#667781]">{menu.footer}</div>
      )}
      <div className="border-t border-[#00000014] mx-0">
        <div className="px-3 py-2.5 flex items-center justify-center gap-2 text-[#00a884] text-[14px] font-medium">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
          {menu.button || "View Options"}
        </div>
      </div>
      {menu.sections?.map((section, si) => (
        <div key={si} className="border-t border-[#00000014]">
          <div className="px-3 py-1.5 text-[12px] font-medium text-[#00a884] uppercase tracking-wide">
            {section.title}
          </div>
          {section.rows?.map((row, ri) => (
            <div
              key={ri}
              className="px-3 py-2 border-t border-[#0000000a] hover:bg-[#00000005] cursor-default"
            >
              <div className="text-[14px] text-[#111b21] font-medium">{row.title}</div>
              {row.description && (
                <div className="text-[12px] text-[#667781] mt-0.5">{row.description}</div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="px-3 pb-1.5 flex justify-end">
        <span className="text-[11px] text-[#667781]">{formatMessageTime(timestamp)}</span>
      </div>
    </div>
  );
}

function MessageBubble({ message, conversation }) {
  const isIncoming = message.direction === "in";
  const isBot = message.sender === "bot";
  const isAdmin = message.sender === "admin";

  let displayBody = message.body;
  if (displayBody === "🏠 Returned to main menu") {
    displayBody = "🏠 Main Menu";
  }

  const menu = parseMenuMessage(displayBody, conversation);

  const bubbleBg = isIncoming
    ? "bg-white"
    : isAdmin
      ? "bg-[#e7f3ff]"
      : "bg-[#d9fdd3]";

  const alignClass = isIncoming ? "justify-start" : "justify-end";

  if (menu) {
    return (
      <div className={`flex ${alignClass} mb-1 px-1`}>
        <InteractiveMenuCard
          menu={menu}
          isOutgoing={!isIncoming}
          timestamp={message.timestamp}
        />
      </div>
    );
  }

  return (
    <div className={`flex ${alignClass} mb-1 px-1`}>
      <div
        className={`relative max-w-[65%] min-w-[80px] px-2 py-1.5 rounded-lg shadow-sm ${bubbleBg}`}
        style={{
          borderTopLeftRadius: isIncoming ? "0" : undefined,
          borderTopRightRadius: !isIncoming ? "0" : undefined,
        }}
      >
        {isAdmin && (
          <div className="text-[10px] text-[#008069] font-medium mb-0.5">You (admin)</div>
        )}
        <div className="text-[14.2px] text-[#111b21] leading-[19px] whitespace-pre-wrap break-words pr-12">
          {formatWhatsAppText(displayBody)}
        </div>
        <div className="absolute bottom-1 right-2 flex items-center gap-1">
          <span className="text-[11px] text-[#667781]">
            {formatMessageTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
