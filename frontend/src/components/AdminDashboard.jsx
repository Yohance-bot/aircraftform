import { useState } from "react";
import { LayoutDashboard, Users, MessageSquare, Radio, BookOpen, Settings, CheckCircle, Download } from 'lucide-react';

import { fetchRegistrations } from "../api.js";
import BroadcastPanel from "./BroadcastPanel.jsx";
import ConversationsPanel from "./ConversationsPanel.jsx";
import KnowledgePanel from "./KnowledgePanel.jsx";

// Columns shown in the on-screen table.
const COLUMNS = [
  { key: "parent_name", label: "Parent" },
  { key: "child_name", label: "Child" },
  { key: "phone_country_code", label: "Country Code" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "age_group", label: "Age Group" },
  { key: "class_grade", label: "Class" },
  { key: "villa_flat_number", label: "Villa" },
  { key: "batch_preference", label: "Batch" },
  { key: "special_requirements", label: "Special Requirements" },
  { key: "payment_status", label: "Payment" },
  { key: "created_at", label: "Registered At" },
];

// CSV export has its own explicit column order & labels (per spec).
const CSV_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "parent_name", label: "Parent Name" },
  { key: "child_name", label: "Child Name" },
  { key: "phone_country_code", label: "Country Code" },
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
  { id: "registrations", Icon: Users, label: "Registrations" },
  { id: "conversations", Icon: MessageSquare, label: "Conversations" },
  { id: "broadcast", Icon: Radio, label: "Broadcast" },
  { id: "knowledge", Icon: BookOpen, label: "Knowledge" },
];

const SIDEBAR_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  .dashboard-root {
    font-family: 'Inter', sans-serif;
  }

  .amc-sidebar { width: 54px; transition: width 0.28s cubic-bezier(.4,0,.2,1); overflow: hidden; }
  .amc-sidebar { 
    min-width: 54px;
    background: linear-gradient(180deg, #1a3a6b 0%, #0d2247 50%, #071530 100%);
    transition: width 0.28s cubic-bezier(.4,0,.2,1), min-width 0.28s cubic-bezier(.4,0,.2,1);
    display: flex;
    flex-direction: column;
  }
  .amc-sidebar:hover { width: 176px; }
  .amc-sidebar:hover { min-width: 176px; }
  .amc-sidebar:hover .amc-nav-label { opacity: 1; }
  .amc-sidebar:hover .amc-brand-name { opacity: 1; }
  .amc-sidebar:hover .amc-nav-item { padding-left: 14px; justify-content: flex-start; }
  .amc-sidebar:hover .amc-brand { justify-content: flex-start; padding-left: 14px; }
  .amc-nav-label {
    opacity: 0;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .amc-brand-name {
    opacity: 0;
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .amc-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    border-radius: 6px;
    margin: 2px 6px;
  }
  .amc-nav-item:hover {
    background: rgba(255,255,255,0.08);
    color: #fff;
  }
  .amc-nav-item.active {
    background: rgba(245,158,11,0.1);
    color: #f59e0b;
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
  @keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

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
            {NAV_ITEMS.map(item => (
              <div
                key={item.id}
                className={`amc-nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                <item.Icon size={18} style={{ width: "22px", textAlign: "center" }} />
                <span className="amc-nav-label" style={{ fontSize: "14px", fontWeight: 600 }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Settings at bottom */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 0" }}>
            <div className="amc-nav-item">
              <Settings size={18} style={{ width: "22px", textAlign: "center" }} />
              <span className="amc-nav-label" style={{ fontSize: "14px", fontWeight: 600 }}>Settings</span>
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

          {/* Stats Bar */}
          <div style={{
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

          {/* Tab Content */}
          <div className="dashboard-root" style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
            {activeTab === "dashboard" ? (
              <DashboardHome
                rows={rows}
                confirmedCount={confirmedCount}
                onViewAll={() => setActiveTab("registrations")}
                handleExportCsv={handleExportCsv}
              />
            ) : activeTab === "conversations" ? (
              <ConversationsPanel adminKey={adminKey} />
            ) : activeTab === "broadcast" ? (
              <BroadcastPanel adminKey={adminKey} />
            ) : activeTab === "knowledge" ? (
              <KnowledgePanel adminKey={adminKey} />
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>Registrations</h2>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                      Total: <span style={{ fontWeight: 600 }}>{rows.length}</span>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={loading}
                      style={{
                        height: "36px",
                        padding: "0 16px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        color: "#475569",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: loading ? "not-allowed" : "pointer"
                      }}
                    >
                      {loading ? "Refreshing..." : "Refresh"}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={!rows.length}
                      style={{
                        height: "36px",
                        padding: "0 16px",
                        borderRadius: "8px",
                        border: "1px solid #f59e0b",
                        background: "#fff",
                        color: "#f59e0b",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: !rows.length ? "not-allowed" : "pointer",
                        opacity: !rows.length ? 0.5 : 1
                      }}
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{
                    marginBottom: "16px",
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

                <div style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden"
                }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {COLUMNS.map((c) => (
                            <th
                              key={c.key}
                              style={{
                                textAlign: "left",
                                fontWeight: 600,
                                padding: "12px 16px",
                                whiteSpace: "nowrap",
                                color: "#475569",
                                borderBottom: "1px solid #e2e8f0"
                              }}
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
                              style={{ padding: "40px 16px", textAlign: "center", color: "#64748b" }}
                            >
                              No registrations yet.
                            </td>
                          </tr>
                        ) : (
                          rows.map((r) => (
                            <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              {COLUMNS.map((c) => (
                                <td
                                  key={c.key}
                                  style={{
                                    padding: "12px 16px",
                                    color: "#334155",
                                    whiteSpace: c.key === "special_requirements" ? "normal" : "nowrap",
                                    minWidth: c.key === "special_requirements" ? "280px" : undefined,
                                    maxWidth: c.key === "special_requirements" ? "400px" : undefined,
                                    verticalAlign: c.key === "special_requirements" ? "top" : undefined
                                  }}
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
              </>
            )}
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

function DashboardHome({ rows, confirmedCount, onViewAll, handleExportCsv }) {
  const recentRows = rows.slice(0, 3);

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
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "conic-gradient(from 0deg, transparent 300deg, rgba(16,185,129,0.5) 360deg)",
                transformOrigin: "center",
                animation: "radar-sweep 2.5s linear infinite"
              }} />
              {/* Dots */}
              <div style={{ position: "absolute", top: "27%", left: "61%", width: "5px", height: "5px", borderRadius: "50%", background: "#10b981" }} />
              <div style={{ position: "absolute", top: "57%", left: "30%", width: "5px", height: "5px", borderRadius: "50%", background: "#10b981" }} />
              <div style={{ position: "absolute", top: "71%", left: "59%", width: "5px", height: "5px", borderRadius: "50%", background: "#10b981" }} />
            </div>
          </div>
          
          <div style={{ textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
            3 active conversations
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
              onClick={() => {}}
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
              onClick={() => {}}
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
              onClick={() => {}}
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
    if (key === "special_requirements") {
      return String(value);
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
