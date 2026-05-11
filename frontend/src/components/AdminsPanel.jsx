import { useEffect, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, User, Phone, Shield } from "lucide-react";
import { fetchAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser } from "../api.js";

export default function AdminsPanel({ adminKey }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formPhone, setFormPhone] = useState("");
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  async function loadAdmins() {
    try {
      setLoading(true);
      const data = await fetchAdminUsers(adminKey);
      setAdmins(data);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load admin users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, [adminKey]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!formPhone.trim() || !formName.trim()) return;

    setSaving(true);
    try {
      await createAdminUser(adminKey, formPhone.trim(), formName.trim());
      setShowModal(false);
      setFormPhone("");
      setFormName("");
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Failed to create admin user");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(admin) {
    try {
      await updateAdminUser(adminKey, admin.id, !admin.is_active);
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Failed to update admin user");
    }
  }

  async function handleDelete(admin) {
    try {
      await deleteAdminUser(adminKey, admin.id);
      setDeleteConfirm(null);
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Failed to delete admin user");
    }
  }

  return (
    <div
      className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100"
      style={{ width: "100%", height: "calc(100vh - 310px)", overflowY: "auto", padding: "20px 24px" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={20} style={{ color: "#f59e0b" }} />
            WhatsApp Admins
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
            Admins can manage conversations directly through WhatsApp using natural language commands
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 16px",
            borderRadius: "10px",
            background: "#f59e0b",
            color: "#fff",
            fontWeight: 600,
            fontSize: "13px",
            border: "none",
            cursor: "pointer"
          }}
        >
          <Plus size={16} />
          Add Admin
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: "16px",
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          fontSize: "13px"
        }}>
          {error}
        </div>
      )}

      {/* Info Box */}
      <div style={{
        marginBottom: "20px",
        padding: "16px",
        borderRadius: "12px",
        background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
        border: "1px solid #fcd34d"
      }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#92400e", marginBottom: "8px" }}>
          How WhatsApp Admin Mode Works
        </div>
        <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#78350f", lineHeight: 1.6 }}>
          <li>Add admin phone numbers here (with country code, e.g., 919876543217)</li>
          <li>When an admin messages the bot, they get agent mode instead of the regular menu</li>
          <li>Admins can ask: "Who needs help?", "Tell me about Priya's issue", "Send Priya: Your refund is processed"</li>
          <li>The AI understands natural language and can query conversations, send messages, and mark issues resolved</li>
        </ul>
      </div>

      {/* Admin List */}
      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
          Loading admin users...
        </div>
      ) : admins.length === 0 ? (
        <div style={{
          padding: "60px 40px",
          textAlign: "center",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0"
        }}>
          <Shield size={40} style={{ color: "#cbd5e1", margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
            No WhatsApp admins yet
          </div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>
            Add an admin to enable WhatsApp-based conversation management
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {admins.map(admin => (
            <div
              key={admin.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                opacity: admin.is_active ? 1 : 0.6
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: admin.is_active ? "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)" : "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <User size={20} style={{ color: admin.is_active ? "#f59e0b" : "#94a3b8" }} />
                </div>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e293b" }}>
                    {admin.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                    <Phone size={12} style={{ color: "#94a3b8" }} />
                    <span style={{ fontSize: "13px", color: "#64748b", fontFamily: "monospace" }}>
                      +{admin.phone}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  background: admin.is_active ? "#dcfce7" : "#f1f5f9",
                  color: admin.is_active ? "#16a34a" : "#64748b"
                }}>
                  {admin.is_active ? "Active" : "Inactive"}
                </span>

                <button
                  onClick={() => handleToggleActive(admin)}
                  title={admin.is_active ? "Deactivate" : "Activate"}
                  style={{
                    padding: "8px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {admin.is_active ? (
                    <ToggleRight size={18} style={{ color: "#16a34a" }} />
                  ) : (
                    <ToggleLeft size={18} style={{ color: "#94a3b8" }} />
                  )}
                </button>

                <button
                  onClick={() => setDeleteConfirm(admin)}
                  title="Delete admin"
                  style={{
                    padding: "8px",
                    borderRadius: "8px",
                    border: "1px solid #fecaca",
                    background: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Trash2 size={16} style={{ color: "#ef4444" }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Admin Modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
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
            onClick={e => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "440px",
              margin: "0 16px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)"
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>
              Add WhatsApp Admin
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
              This person will be able to manage conversations through WhatsApp
            </p>

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="John Doe"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  WhatsApp Phone Number
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="919876543210"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "monospace"
                  }}
                />
                <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#94a3b8" }}>
                  Include country code without + (e.g., 919876543210 for India)
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#475569",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formPhone.trim() || !formName.trim()}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: "none",
                    background: saving ? "#94a3b8" : "#f59e0b",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: (!formPhone.trim() || !formName.trim()) ? 0.5 : 1
                  }}
                >
                  {saving ? "Adding..." : "Add Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          onClick={() => setDeleteConfirm(null)}
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
            onClick={e => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "400px",
              margin: "0 16px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)"
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>
              Remove Admin?
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#64748b" }}>
              <strong>{deleteConfirm.name}</strong> will no longer be able to manage conversations via WhatsApp.
            </p>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Remove Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
