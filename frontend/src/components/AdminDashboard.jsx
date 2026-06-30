import { useEffect, useState } from "react";
import { LayoutDashboard, Users, MessageSquare, Radio, BookOpen, Shield, Settings, CheckCircle, Download, Gauge, Contact, Bell, TrendingUp, Megaphone, FileText, ClipboardCheck, SlidersHorizontal, Smartphone, GitBranch, BarChart3, Sparkles } from 'lucide-react';

import { fetchConversations, fetchRegistrations } from "../api.js";
import AdminsPanel from "./AdminsPanel.jsx";
import BroadcastPanel from "./BroadcastPanel.jsx";
import ConversationsPanel from "./ConversationsPanel.jsx";
import KnowledgePanel from "./KnowledgePanel.jsx";
import RegistrationsPanel from "./RegistrationsPanel.jsx";
import WhatsAppOnboardingPanel from "./WhatsAppOnboardingPanel.jsx";
import CrmDashboardPanel from "./crm/CrmDashboardPanel.jsx";
import ContactsPanel from "./crm/ContactsPanel.jsx";
import FollowUpPanel from "./crm/FollowUpPanel.jsx";
import TemplatesPanel from "./crm/TemplatesPanel.jsx";
import CampaignPanel from "./crm/CampaignPanel.jsx";
import DripPanel from "./crm/DripPanel.jsx";
import CampaignAnalyticsPanel from "./crm/CampaignAnalyticsPanel.jsx";
import InsightsPanel from "./crm/InsightsPanel.jsx";
import CrmSettingsPanel from "./crm/CrmSettingsPanel.jsx";
import WorkshopAnalysisPanel from "./workshop/WorkshopAnalysisPanel.jsx";

// CSV export has its own explicit column order & labels (per spec).
const CSV_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "society", label: "Society" },
  { key: "parent_name", label: "Parent Name" },
  { key: "child_name", label: "Child Name" },
  { key: "phone_country_code", label: "Country Code" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "age_group", label: "Age Group" },
  { key: "class_grade", label: "Class/Grade" },
  { key: "timing_slot", label: "Timing Slot" },
  { key: "villa_flat_number", label: "Villa/Flat Number" },
  { key: "batch_preference", label: "Batch Preference" },
  { key: "special_requirements", label: "Special Requirements" },
  { key: "payment_status", label: "Payment Status" },
  { key: "created_at", label: "Registered At" },
];

const PaperPlane = ({ size = 32, color = "#f59e0b" }) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 64 44" fill="none">
    <path d="M2 22 L58 6 L44 22 L58 38 Z" fill={color}/>
    <path d="M44 22 L26 27 L28 34 L44 22Z" fill={color === "#f59e0b" ? "#d97706" : color}/>
    <path d="M2 22 L44 22 L26 27Z" fill={color === "#f59e0b" ? "#fde68a" : color}/>
  </svg>
);

const Cloud = ({ width, opacity }) => (
  <svg width={width} height={width*0.5} viewBox="0 0 200 100">
    <ellipse cx="90" cy="74" rx="80" ry="28" fill={`rgba(255,255,255,${opacity})`}/>
    <ellipse cx="60" cy="58" rx="46" ry="30" fill={`rgba(255,255,255,${opacity-0.02})`}/>
    <ellipse cx="120" cy="55" rx="40" ry="26" fill={`rgba(255,255,255,${opacity-0.02})`}/>
  </svg>
);

const NAV_ITEMS = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Dashboard" },
  { id: "registrations", Icon: ClipboardCheck, label: "Registrations" },
  { section: "CRM" },
  { id: "crm_dashboard", Icon: Gauge, label: "Lead Dashboard" },
  { id: "contacts", Icon: Contact, label: "Contacts" },
  { id: "followups", Icon: Bell, label: "Follow-ups" },
  { id: "conversations", Icon: MessageSquare, label: "Conversations" },
  { id: "insights", Icon: TrendingUp, label: "Insights" },
  { section: "Marketing" },
  { id: "campaigns", Icon: Megaphone, label: "Targeted Send" },
  { id: "broadcast", Icon: Radio, label: "Broadcast" },
  { id: "drips", Icon: GitBranch, label: "Drip Sequences" },
  { id: "analytics", Icon: BarChart3, label: "Campaign Analytics" },
  { id: "templates", Icon: FileText, label: "Templates" },
  { id: "knowledge", Icon: BookOpen, label: "Knowledge" },
  { section: "AI" },
  { id: "workshop_ai", Icon: Sparkles, label: "Workshop AI Analysis" },
  { section: "Team" },
  { id: "admins", Icon: Shield, label: "Admins" },
];

// Tabs that need a fixed-height container with their own internal scroll.
const FULL_HEIGHT_TABS = new Set([
  "conversations",
  "broadcast",
  "knowledge",
  "admins",
  "contacts",
  "templates",
  "drips",
  "registrations",
  "workshop_ai",
]);
// Tabs that render their own layout and shouldn't get the sky header / stat row.
const CRM_TABS = new Set([
  "crm_dashboard",
  "contacts",
  "followups",
  "insights",
  "campaigns",
  "templates",
  "drips",
  "analytics",
  "crm_settings",
  "workshop_ai",
]);

const SIDEBAR_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  .dashboard-root {
    font-family: 'Inter', sans-serif;
  }

  .amc-sidebar {
    width: 54px;
    min-width: 54px;
    transition: width 0.3s ease;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(180deg, #1a3a6b 0%, #0d2247 50%, #071530 100%);
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .amc-sidebar:hover {
    width: 180px;
    min-width: 180px;
  }
  .amc-sidebar .amc-nav-label {
    opacity: 0;
    max-width: 0;
    overflow: hidden;
    transition: opacity 0.2s, max-width 0.2s;
    white-space: nowrap;
    display: inline-block;
  }
  .amc-sidebar:hover .amc-nav-label {
    opacity: 1;
    max-width: 120px;
  }
  .amc-sidebar .amc-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, padding 0.2s, justify-content 0.2s;
    border-radius: 6px;
    margin: 2px 6px;
    justify-content: center;
  }
  .amc-sidebar:hover .amc-nav-item {
    justify-content: flex-start;
    padding-left: 14px;
  }
  .amc-nav-item:hover {
    background: rgba(255,255,255,0.08);
    color: #fff;
  }
  .amc-nav-item.active {
    background: rgba(245,158,11,0.1);
    color: #f59e0b;
  }
  .amc-sidebar .amc-brand-name {
    opacity: 0;
    max-width: 0;
    overflow: hidden;
    transition: opacity 0.2s, max-width 0.2s;
    white-space: nowrap;
  }
  .amc-sidebar:hover .amc-brand-name {
    opacity: 1;
    max-width: 120px;
  }
  .amc-sidebar:hover .amc-brand {
    justify-content: flex-start;
    padding-left: 14px;
  }
  @keyframes cloud-drift { 0%,100%{transform:translateX(0)} 50%{transform:translateX(10px)} }
  @keyframes cloud-drift2 { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-8px)} }
  @keyframes bobble { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes float-plane { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-10px) rotate(-1deg)} }
  @keyframes fly-path-1 { 0%{offset-distance:0%;opacity:0} 5%{opacity:1} 95%{opacity:1} 100%{offset-distance:100%;opacity:0} }
  @keyframes fly-path-2 { 0%{offset-distance:0%;opacity:0} 5%{opacity:0.8} 95%{opacity:0.8} 100%{offset-distance:100%;opacity:0} }
  @keyframes fly-path-3 { 0%{offset-distance:0%;opacity:0} 5%{opacity:0.7} 95%{opacity:0.7} 100%{offset-distance:100%;opacity:0} }
  @keyframes fly-path-4 { 0%{offset-distance:0%;opacity:0} 5%{opacity:0.9} 95%{opacity:0.9} 100%{offset-distance:100%;opacity:0} }
  @keyframes fly-path-5 { 0%{offset-distance:0%;opacity:0} 5%{opacity:0.85} 95%{opacity:0.85} 100%{offset-distance:100%;opacity:0} }
  @keyframes fly-path-6 { 0%{offset-distance:0%;opacity:0} 5%{opacity:0.9} 95%{opacity:0.9} 100%{offset-distance:100%;opacity:0} }
  @keyframes radar-sweep {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("wa_resume") === "1" ? "settings" : "dashboard";
  });
  const [activeConversationCount, setActiveConversationCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("wa_resume") !== "1") return;

    setActiveTab("settings");
    const savedKey = sessionStorage.getItem("wa_resume_admin_key");
    if (savedKey && !authed) {
      setAdminKey(savedKey);
      loadData(savedKey);
    }
  }, []);

  useEffect(() => {
    if (!authed || !adminKey.trim()) {
      setActiveConversationCount(0);
      return;
    }

    let cancelled = false;

    async function loadConversationCount() {
      try {
        const data = await fetchConversations(adminKey.trim());
        if (!cancelled) {
          setActiveConversationCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        if (!cancelled) {
          setActiveConversationCount(0);
        }
      }
    }

    loadConversationCount();
    const interval = setInterval(loadConversationCount, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authed, adminKey]);

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
      <div style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(135deg, #c8dff8, #d4e8ff)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}>
        <div style={{
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)",
          maxWidth: "384px",
          width: "100%",
          padding: "32px"
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <PaperPlane size={48} color="#f59e0b" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0d2247", textAlign: "center", margin: 0 }}>
            Control Tower
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", textAlign: "center", marginTop: "8px" }}>
            Enter your admin key to access the dashboard
          </p>
          <form onSubmit={handleUnlock} style={{ marginTop: "24px" }}>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Admin key"
              autoFocus
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
            {error && (
              <div style={{
                marginTop: "12px",
                padding: "12px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "16px",
                padding: "12px",
                borderRadius: "12px",
                background: loading ? "#64748b" : "#0d2247",
                color: "#fff",
                fontWeight: 600,
                fontSize: "14px",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "Checking..." : "Unlock dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const confirmedCount = rows.filter(r => r.payment_status === "confirmed").length;
  const isFullHeightTab = FULL_HEIGHT_TABS.has(activeTab);
  const showSkyHeader = activeTab === "dashboard";

  return (
    <>
      <style>{SIDEBAR_STYLES}</style>
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        background: "#eef3ff"
      }}>
        {/* Sidebar */}
        <div className="amc-sidebar">
          {/* Brand */}
          <div style={{ padding: "16px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="amc-brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "26px",
                height: "26px",
                background: "#f59e0b",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <PaperPlane size={16} color="#0d2247" />
              </div>
              <div className="amc-brand-name">
                <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: "14px" }}>AMC</div>
                <div style={{ color: "rgba(245,158,11,0.7)", fontSize: "10px" }}>Control Tower</div>
              </div>
            </div>
          </div>

          {/* Nav Items */}
          <div style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
            {NAV_ITEMS.map((item, idx) => (
              item.section ? (
                <div key={`sec-${idx}`} className="amc-nav-label" style={{ padding: "10px 14px 4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(245,158,11,0.55)" }}>
                  {item.section}
                </div>
              ) : (
                <div
                  key={item.id}
                  className={`amc-nav-item ${activeTab === item.id ? "active" : ""}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <item.Icon size={18} style={{ width: "22px", textAlign: "center" }} />
                  <span className="amc-nav-label" style={{ fontSize: "14px", fontWeight: 600 }}>{item.label}</span>
                </div>
              )
            ))}
          </div>

          {/* Settings — CRM config + WhatsApp Cloud API connection */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 0" }}>
            <div
              className={`amc-nav-item ${activeTab === "crm_settings" ? "active" : ""}`}
              onClick={() => setActiveTab("crm_settings")}
            >
              <SlidersHorizontal size={18} style={{ width: "22px", textAlign: "center" }} />
              <span className="amc-nav-label" style={{ fontSize: "14px", fontWeight: 600 }}>CRM Settings</span>
            </div>
            <div
              className={`amc-nav-item ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <Smartphone size={18} style={{ width: "22px", textAlign: "center" }} />
              <span className="amc-nav-label" style={{ fontSize: "14px", fontWeight: 600 }}>WhatsApp</span>
            </div>
          </div>

          {/* Animated clouds + plane at bottom */}
          <div style={{ position: "relative", height: "60px", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: "2px", bottom: "20px", animation: "cloud-drift 8s ease-in-out infinite" }}>
              <Cloud width={50} opacity={0.07} />
            </div>
            <div style={{ position: "absolute", right: "-5px", bottom: "10px", animation: "cloud-drift2 10s ease-in-out infinite" }}>
              <Cloud width={40} opacity={0.06} />
            </div>
            <div style={{ position: "absolute", left: "50%", bottom: "22px", transform: "translateX(-50%)", animation: "bobble 3s ease-in-out infinite" }}>
              <PaperPlane size={32} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Sky Header */}
          {showSkyHeader && (
            <div style={{
              height: "180px",
              background: "linear-gradient(135deg, #b8d4f5 0%, #c8e0f8 30%, #d8eaff 60%, #a8c8f0 100%)",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0
            }}>
              {/* Drifting clouds */}
              <div style={{ position: "absolute", left: "5%", top: "20px", zIndex: 2, animation: "cloud-drift 12s ease-in-out infinite" }}>
                <Cloud width={120} opacity={0.4} />
              </div>
              <div style={{ position: "absolute", left: "45%", top: "60px", zIndex: 2, animation: "cloud-drift2 15s ease-in-out infinite" }}>
                <Cloud width={100} opacity={0.35} />
              </div>
              <div style={{ position: "absolute", right: "15%", top: "10px", zIndex: 2, animation: "cloud-drift 18s ease-in-out infinite" }}>
                <Cloud width={90} opacity={0.3} />
              </div>

              {/* Flight paths SVG */}
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 3 }} preserveAspectRatio="none" viewBox="0 0 730 180">
                <path d="M -30 110 Q 80 30 200 80 Q 320 125 460 45 Q 560 10 730 70" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="6 5">
                  <animate attributeName="stroke-dashoffset" from="0" to="-33" dur="2s" repeatCount="indefinite"/>
                </path>
                <path d="M -20 40 Q 70 105 170 52 Q 250 15 340 78 Q 420 125 520 58 Q 600 15 730 72" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="5 6">
                  <animate attributeName="stroke-dashoffset" from="0" to="-33" dur="2.4s" repeatCount="indefinite"/>
                </path>
                <path d="M -10 135 Q 90 75 185 115 Q 270 150 360 90 Q 440 40 540 105 Q 615 140 730 105" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="4 7">
                  <animate attributeName="stroke-dashoffset" from="0" to="-33" dur="3s" repeatCount="indefinite"/>
                </path>
              </svg>

              {/* Planes on paths */}
              <div style={{
                position: "absolute",
                zIndex: 4,
                offsetPath: "path('M -30 110 Q 80 30 200 80 Q 320 125 460 45 Q 560 10 730 70')",
                animation: "fly-path-1 10s linear infinite"
              }}>
                <PaperPlane size={22} color="#ffffff" />
              </div>
              <div style={{
                position: "absolute",
                zIndex: 4,
                offsetPath: "path('M -20 40 Q 70 105 170 52 Q 250 15 340 78 Q 420 125 520 58 Q 600 15 730 72')",
                animation: "fly-path-2 14s linear infinite",
                animationDelay: "4s"
              }}>
                <PaperPlane size={18} color="#f59e0b" />
              </div>
              <div style={{
                position: "absolute",
                zIndex: 4,
                offsetPath: "path('M -10 135 Q 90 75 185 115 Q 270 150 360 90 Q 440 40 540 105 Q 615 140 730 105')",
                animation: "fly-path-3 18s linear infinite",
                animationDelay: "8s",
                opacity: 0.7
              }}>
                <PaperPlane size={15} color="#ffffff" />
              </div>
              {/* Plane 4: white, 14px, follows path 1 with delay */}
              <div style={{
                position: "absolute",
                zIndex: 4,
                offsetPath: "path('M -30 110 Q 80 30 200 80 Q 320 125 460 45 Q 560 10 730 70')",
                animation: "fly-path-4 11s linear infinite",
                animationDelay: "5s"
              }}>
                <PaperPlane size={14} color="#ffffff" />
              </div>
              {/* Plane 5: amber, 20px, new path */}
              <div style={{
                position: "absolute",
                zIndex: 4,
                offsetPath: "path('M -20 70 Q 100 135 220 70 Q 340 15 480 85 Q 580 130 730 78')",
                animation: "fly-path-5 16s linear infinite",
                animationDelay: "2s"
              }}>
                <PaperPlane size={20} color="#f59e0b" />
              </div>
              {/* Plane 6: white, 16px, follows path 2 */}
              <div style={{
                position: "absolute",
                zIndex: 4,
                offsetPath: "path('M -20 40 Q 70 105 170 52 Q 250 15 340 78 Q 420 125 520 58 Q 600 15 730 72')",
                animation: "fly-path-6 14s linear infinite",
                animationDelay: "9s"
              }}>
                <PaperPlane size={16} color="#ffffff" />
              </div>

              {/* Big floating plane */}
              <div style={{
                position: "absolute",
                right: "28px",
                bottom: "8px",
                zIndex: 4,
                animation: "float-plane 4s ease-in-out infinite"
              }}>
                <PaperPlane size={110} color="#f59e0b" />
              </div>

              {/* Header text */}
              <div style={{ position: "absolute", left: "24px", top: "24px", zIndex: 5 }}>
                <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800, color: "#0d2247" }}>
                  Control Tower ✈️
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#3b5998" }}>
                  Ready to inspire young aviators today?
                </p>
              </div>

              {/* Live badge */}
              <div style={{
                position: "absolute",
                right: "24px",
                top: "24px",
                zIndex: 5,
                background: "#fff",
                borderRadius: "20px",
                padding: "6px 14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
              }}>
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  animation: "blink 1.5s ease-in-out infinite"
                }}/>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>All systems live</span>
              </div>
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="stats-row" style={{
              display: "flex",
              gap: "16px",
              padding: "16px 18px",
              background: "#fff",
              borderBottom: "0.5px solid #e2e8f0",
              flexShrink: 0
            }}>
              <StatCard accent="#3b82f6" Icon={Users} value={rows.length} label="Registered" />
              <StatCard accent="#22c55e" Icon={CheckCircle} value={confirmedCount} label="Confirmed & Paid" />
              <StatCard accent="#f59e0b" Icon={MessageSquare} value="–" label="Bot Messages" />
              <StatCard accent="#8b5cf6" Icon={Radio} value="–" label="Needs Follow-up" />
            </div>
          )}

          {/* Tab Content — flex column only for full-height tabs; scroll tabs use block layout so content isn't clipped */}
          <div className="dashboard-root" style={{
            flex: 1,
            overflow: isFullHeightTab ? "hidden" : "auto",
            overflowY: isFullHeightTab ? "hidden" : "auto",
            padding: activeTab === "conversations" ? 0 : "14px 18px",
            display: isFullHeightTab ? "flex" : "block",
            flexDirection: isFullHeightTab ? "column" : undefined,
            minHeight: 0,
          }}>
            {activeTab === "dashboard" ? (
              <DashboardHome
                rows={rows}
                confirmedCount={confirmedCount}
                onViewAll={() => setActiveTab("registrations")}
                handleExportCsv={handleExportCsv}
                setActiveTab={setActiveTab}
                activeConversationCount={activeConversationCount}
              />
            ) : activeTab === "conversations" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ConversationsPanel adminKey={adminKey} />
              </div>
            ) : activeTab === "broadcast" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <BroadcastPanel adminKey={adminKey} />
              </div>
            ) : activeTab === "knowledge" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <KnowledgePanel adminKey={adminKey} />
              </div>
            ) : activeTab === "workshop_ai" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <WorkshopAnalysisPanel adminKey={adminKey} />
              </div>
            ) : activeTab === "admins" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <AdminsPanel adminKey={adminKey} />
              </div>
            ) : activeTab === "crm_dashboard" ? (
              <CrmDashboardPanel adminKey={adminKey} onOpenFollowups={() => setActiveTab("followups")} />
            ) : activeTab === "contacts" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ContactsPanel adminKey={adminKey} />
              </div>
            ) : activeTab === "followups" ? (
              <FollowUpPanel adminKey={adminKey} />
            ) : activeTab === "insights" ? (
              <InsightsPanel adminKey={adminKey} />
            ) : activeTab === "campaigns" ? (
              <CampaignPanel adminKey={adminKey} />
            ) : activeTab === "drips" ? (
              <DripPanel adminKey={adminKey} />
            ) : activeTab === "analytics" ? (
              <CampaignAnalyticsPanel adminKey={adminKey} />
            ) : activeTab === "templates" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <TemplatesPanel adminKey={adminKey} />
              </div>
            ) : activeTab === "crm_settings" ? (
              <CrmSettingsPanel adminKey={adminKey} />
            ) : activeTab === "settings" ? (
              <WhatsAppOnboardingPanel adminKey={adminKey} />
            ) : activeTab === "registrations" ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <RegistrationsPanel
                  adminKey={adminKey}
                  rows={rows}
                  setRows={setRows}
                  loading={loading}
                  error={error}
                  onRefresh={handleRefresh}
                  onExport={handleExportCsv}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function DashboardHome({ rows, confirmedCount, onViewAll, handleExportCsv, setActiveTab, activeConversationCount }) {
  const recentRows = rows.slice(0, 3);
  const radarDots = [
    { top: "27%", left: "61%" },
    { top: "57%", left: "30%" },
    { top: "71%", left: "59%" },
  ];
  const dotsToShow = Math.min(activeConversationCount || 0, radarDots.length);

  return (
    <div style={{ display: "flex", gap: "20px" }}>
      {/* Left Column */}
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0d2247", margin: "0 0 4px" }}>
          Welcome back, Admin 👋
        </h1>
        <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 20px" }}>
          Here's what's happening with your camp today.
        </p>

        {/* Recent Registrations */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#1e293b", margin: 0 }}>
            Recent Registrations
          </h2>
          <button
            onClick={onViewAll}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#475569",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            View all registrations
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{
            padding: "40px",
            textAlign: "center",
            color: "#64748b",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px dashed #e2e8f0"
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>✈️</div>
            No registrations yet — check back soon
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {recentRows.map((row) => {
              const isConfirmed = row.payment_status === "confirmed";
              const isPending = row.payment_status === "pending";
              const accentColor = isConfirmed ? "#22c55e" : isPending ? "#f59e0b" : "#3b82f6";
              const accentBg = isConfirmed ? "#dcfce7" : isPending ? "#fef3c7" : "#dbeafe";

              return (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    overflow: "hidden"
                  }}
                >
                  <div style={{ width: "4px", background: accentColor }} />
                  <div style={{ flex: 1, padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>
                        {row.parent_name}
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                        {row.child_name} · {row.age_group}
                      </div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                        {row.batch_preference || "No batch selected"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background: accentBg,
                        color: accentColor
                      }}>
                        {row.payment_status}
                      </span>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
                        {relativeTime(row.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column */}
      <div style={{ width: "260px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Live Radar Card */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#0d2247", marginBottom: "2px" }}>Live Radar</div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "12px" }}>Active conversations</div>
          
          {/* Radar Widget */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
            <div style={{ position: "relative", width: "110px", height: "110px" }}>
              {/* Outer ring */}
              <div style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "0.5px solid rgba(16,185,129,0.25)"
              }} />
              {/* Inner ring */}
              <div style={{
                position: "absolute",
                inset: "28%",
                borderRadius: "50%",
                border: "0.5px solid rgba(16,185,129,0.25)"
              }} />
              {/* Cross lines */}
              <div style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                height: "0.5px",
                background: "rgba(16,185,129,0.15)",
                transform: "translateY(-50%)"
              }} />
              <div style={{
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: "0.5px",
                background: "rgba(16,185,129,0.15)",
                transform: "translateX(-50%)"
              }} />
              {/* Sweep */}
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, transparent 300deg, rgba(16,185,129,0.5) 360deg)',
                transformOrigin: '50% 50%',
                animation: 'radar-sweep 2.5s linear infinite',
                zIndex: 2
              }} />
              {/* Dots */}
              {radarDots.slice(0, dotsToShow).map((d, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    top: d.top,
                    left: d.left,
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "#10b981",
                    zIndex: 3,
                  }}
                />
              ))}
            </div>
          </div>
          
          <div style={{ textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
            {activeConversationCount === 0
              ? "No active conversations"
              : `${activeConversationCount} active conversation${activeConversationCount === 1 ? "" : "s"}`}
          </div>
        </div>

        {/* Bot Status Card */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#0d2247" }}>Bot Status</div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Running smoothly</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10b981",
                animation: "blink 1.5s ease-in-out infinite"
              }}/>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#10b981" }}>Live</span>
            </div>
          </div>

          {/* Quick Actions Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div 
              onClick={() => setActiveTab('broadcast')}
              style={{ 
                background: "#fff", 
                border: "1px solid #e2e8f0", 
                borderRadius: "8px", 
                padding: "8px", 
                textAlign: "center", 
                cursor: "pointer",
                transition: "background 0.15s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
            >
              <Radio size={16} style={{ color: "#f59e0b", display: "block", margin: "0 auto 4px" }} />
              <span style={{ fontSize: "10px", color: "#475569" }}>Broadcast</span>
            </div>
            <div 
              onClick={() => setActiveTab('knowledge')}
              style={{ 
                background: "#fff", 
                border: "1px solid #e2e8f0", 
                borderRadius: "8px", 
                padding: "8px", 
                textAlign: "center", 
                cursor: "pointer",
                transition: "background 0.15s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
            >
              <BookOpen size={16} style={{ color: "#f59e0b", display: "block", margin: "0 auto 4px" }} />
              <span style={{ fontSize: "10px", color: "#475569" }}>Knowledge</span>
            </div>
            <div 
              onClick={() => setActiveTab('conversations')}
              style={{ 
                background: "#fff", 
                border: "1px solid #e2e8f0", 
                borderRadius: "8px", 
                padding: "8px", 
                textAlign: "center", 
                cursor: "pointer",
                transition: "background 0.15s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
            >
              <MessageSquare size={16} style={{ color: "#f59e0b", display: "block", margin: "0 auto 4px" }} />
              <span style={{ fontSize: "10px", color: "#475569" }}>Conversations</span>
            </div>
            <div 
              onClick={handleExportCsv}
              style={{ 
                background: "#fff", 
                border: "1px solid #e2e8f0", 
                borderRadius: "8px", 
                padding: "8px", 
                textAlign: "center", 
                cursor: "pointer",
                transition: "background 0.15s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
            >
              <Download size={16} style={{ color: "#f59e0b", display: "block", margin: "0 auto 4px" }} />
              <span style={{ fontSize: "10px", color: "#475569" }}>Export CSV</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ accent, Icon, value, label }) {
  return (
    <div style={{
      flex: 1,
      background: "#fff",
      borderRadius: "10px",
      border: "1px solid #e2e8f0",
      overflow: "hidden"
    }}>
      <div style={{ height: "2.5px", background: accent }} />
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: `${accent}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
        <div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#1e293b" }}>{value}</div>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
        </div>
      </div>
    </div>
  );
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
