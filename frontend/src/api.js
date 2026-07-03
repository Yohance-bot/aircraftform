// All API calls go through this helper so the base URL is configurable:
//  - In production we read `VITE_API_URL` (set on Render).
//  - In dev we leave it empty and rely on Vite's `/api` proxy.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

export async function submitPrestigeRegistration(data) {
  const res = await fetch(apiUrl("/api/register-pwm"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
          : String(body.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function submitRegistration(data) {
  const res = await fetch(apiUrl("/api/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
          : String(body.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchRegistrations(adminKey) {
  const res = await fetch(apiUrl("/api/registrations"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Could not load registrations.");
  }
  return res.json();
}

export async function updateRegistration(adminKey, id, fields) {
  const res = await fetch(apiUrl(`/api/registrations/${id}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify(fields),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    let detail = "Could not save registration.";
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function deleteRegistration(adminKey, id) {
  const res = await fetch(apiUrl(`/api/registrations/${id}`), {
    method: "DELETE",
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Could not delete registration.");
  }
  return res.json();
}

export async function createRegistration(adminKey, data) {
  const res = await fetch(apiUrl("/api/registrations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify(data),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    let detail = "Could not create registration.";
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
          : String(body.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function testBot({ message, phone, dryRun }, adminKey) {
  const res = await fetch(apiUrl("/api/test-bot"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({
      message,
      phone: phone || null,
      dry_run: dryRun !== false,
    }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    let detail = "Bot test failed.";
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
          : String(body.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function webhookUrl() {
  return apiUrl("/webhook/whatsapp");
}

export async function fetchConversations(adminKey) {
  const res = await fetch(apiUrl("/api/conversations"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Could not load conversations.");
  }
  return res.json();
}

export async function fetchConversation(adminKey, phone) {
  const res = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(phone)}`), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (res.status === 404) {
    throw new Error("Conversation not found.");
  }
  if (!res.ok) {
    throw new Error("Could not load conversation.");
  }
  return res.json();
}

export async function sendManualMessage(adminKey, phone, message) {
  const res = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(phone)}/send`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ message }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    let detail = "Failed to send message.";
    try {
      const data = await res.json();
      if (data?.detail) {
        detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function updateBucket(adminKey, phone, bucket) {
  const res = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(phone)}/bucket`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ bucket }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Failed to update bucket.");
  }
  return res.json();
}

export async function pauseBot(adminKey, phone, paused) {
  const res = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(phone)}/pause-bot`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ paused }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Failed to update bot pause status.");
  }
  return res.json();
}

export async function broadcastMessage(adminKey, message, phones) {
  const res = await fetch(apiUrl("/api/broadcast"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ message, phones }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Broadcast failed.");
  }
  return res.json();
}

export async function fetchKnowledge(adminKey) {
  const res = await fetch(apiUrl("/api/knowledge"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Could not load knowledge entries.");
  }
  return res.json();
}

export async function createKnowledgeEntry(adminKey, title, content) {
  const res = await fetch(apiUrl("/api/knowledge"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ title, content }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Failed to create knowledge entry.");
  }
  return res.json();
}

export async function updateKnowledgeEntry(adminKey, id, title, content) {
  const res = await fetch(apiUrl(`/api/knowledge/${id}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ title, content }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (res.status === 404) {
    throw new Error("Knowledge entry not found.");
  }
  if (!res.ok) {
    throw new Error("Failed to update knowledge entry.");
  }
  return res.json();
}

export async function deleteKnowledgeEntry(adminKey, id) {
  const res = await fetch(apiUrl(`/api/knowledge/${id}`), {
    method: "DELETE",
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (res.status === 404) {
    throw new Error("Knowledge entry not found.");
  }
  if (!res.ok) {
    throw new Error("Failed to delete knowledge entry.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Admin User Management
// ---------------------------------------------------------------------------

export async function fetchAdminUsers(adminKey) {
  const res = await fetch(apiUrl("/api/admin-users"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Could not load admin users.");
  }
  return res.json();
}

export async function createAdminUser(adminKey, phone, name) {
  const res = await fetch(apiUrl("/api/admin-users"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ phone, name }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "An admin with this phone already exists.");
  }
  if (!res.ok) {
    throw new Error("Failed to create admin user.");
  }
  return res.json();
}

export async function updateAdminUser(adminKey, id, isActive) {
  const res = await fetch(apiUrl(`/api/admin-users/${id}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ is_active: isActive }),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (res.status === 404) {
    throw new Error("Admin user not found.");
  }
  if (!res.ok) {
    throw new Error("Failed to update admin user.");
  }
  return res.json();
}

export async function deleteAdminUser(adminKey, id) {
  const res = await fetch(apiUrl(`/api/admin-users/${id}`), {
    method: "DELETE",
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (res.status === 404) {
    throw new Error("Admin user not found.");
  }
  if (!res.ok) {
    throw new Error("Failed to delete admin user.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API credential setup
// ---------------------------------------------------------------------------

async function parseOnboardingError(res, fallback) {
  let detail = fallback;
  try {
    const body = await res.json();
    if (body?.detail) {
      if (typeof body.detail === "object" && body.detail.message) {
        detail = body.detail.message;
      } else if (typeof body.detail === "string") {
        detail = body.detail;
      }
    }
  } catch {
    /* ignore */
  }
  throw new Error(detail);
}

export async function fetchOnboardingStatus(adminKey) {
  const res = await fetch(apiUrl("/api/onboarding/status"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    throw new Error("Could not load WhatsApp connection status.");
  }
  return res.json();
}

export async function connectWhatsAppManual(adminKey, payload) {
  const res = await fetch(apiUrl("/api/onboarding/manual"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    await parseOnboardingError(res, "Failed to save WhatsApp credentials.");
  }
  return res.json();
}

export async function connectWhatsAppFromEnv(adminKey) {
  const res = await fetch(apiUrl("/api/onboarding/manual/from-env"), {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) {
    throw new Error("Invalid admin key.");
  }
  if (!res.ok) {
    await parseOnboardingError(res, "Failed to activate .env credentials.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// CRM — lead management & marketing (Phases 1-18)
// ---------------------------------------------------------------------------

async function crmFetch(path, adminKey, { method = "GET", body } = {}) {
  const res = await fetch(apiUrl(`/api/crm${path}`), {
    method,
    headers: {
      "X-Admin-Key": adminKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) throw new Error("Invalid admin key.");
  if (res.status === 404) throw new Error("Not found.");
  if (!res.ok) {
    let detail = "Request failed.";
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== "all") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Contacts (Phase 6/7)
export const fetchContacts = (adminKey, filters) =>
  crmFetch(`/contacts${buildQuery(filters)}`, adminKey);
export const fetchContact = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}`, adminKey);
export const updateContact = (adminKey, phone, patch) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}`, adminKey, { method: "PATCH", body: patch });
export const bulkContactAction = (adminKey, phones, action, value) =>
  crmFetch(`/contacts/bulk`, adminKey, { method: "POST", body: { phones, action, value } });

// Score (Phase 2)
export const fetchScore = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/score`, adminKey);
export const recomputeScore = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/recompute-score`, adminKey, { method: "POST" });

// AI (Phase 3)
export const refreshAi = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/ai-refresh`, adminKey, { method: "POST" });

// Timeline (Phase 4)
export const fetchTimeline = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/timeline`, adminKey);

// Reminders (Phase 13)
export const createReminder = (adminKey, phone, reminderAt, note) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/reminder`, adminKey, {
    method: "POST",
    body: { reminder_at: reminderAt, reminder_note: note },
  });
export const completeReminder = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/reminder/complete`, adminKey, { method: "POST" });
export const snoozeReminder = (adminKey, phone, days) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/reminder/snooze`, adminKey, {
    method: "POST",
    body: { days },
  });

// Follow-up queue (Phase 8)
export const fetchFollowups = (adminKey) => crmFetch(`/followups`, adminKey);

// Notes (Phase 14)
export const fetchNotes = (adminKey, phone) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/notes`, adminKey);
export const addNote = (adminKey, phone, bodyText, author) =>
  crmFetch(`/contacts/${encodeURIComponent(phone)}/notes`, adminKey, {
    method: "POST",
    body: { body: bodyText, author },
  });
export const deleteNote = (adminKey, id) =>
  crmFetch(`/notes/${id}`, adminKey, { method: "DELETE" });

// Templates (Phase 9)
export const fetchTemplates = (adminKey) => crmFetch(`/templates`, adminKey);
export const createTemplate = (adminKey, t) =>
  crmFetch(`/templates`, adminKey, { method: "POST", body: t });
export const updateTemplate = (adminKey, id, t) =>
  crmFetch(`/templates/${id}`, adminKey, { method: "PATCH", body: t });
export const duplicateTemplate = (adminKey, id) =>
  crmFetch(`/templates/${id}/duplicate`, adminKey, { method: "POST" });
export const deleteTemplate = (adminKey, id) =>
  crmFetch(`/templates/${id}`, adminKey, { method: "DELETE" });

// Agents (Phase 15)
export const fetchAgents = (adminKey) => crmFetch(`/agents`, adminKey);

// Dashboard / Insights (Phase 5 / 16)
export const fetchCrmDashboard = (adminKey) => crmFetch(`/dashboard`, adminKey);
export const fetchInsights = (adminKey) => crmFetch(`/insights`, adminKey);

// Audience targeting (Phase 17)
export const previewAudience = (adminKey, filters) =>
  crmFetch(`/audience`, adminKey, { method: "POST", body: filters });

// Settings (Phase 18)
export const fetchCrmSettings = (adminKey) => crmFetch(`/settings`, adminKey);
export const updateCrmSetting = (adminKey, key, value) =>
  crmFetch(`/settings/${key}`, adminKey, { method: "PUT", body: { value } });

// Drip sequences (Phase 10)
export const fetchSequences = (adminKey) => crmFetch(`/drip/sequences`, adminKey);
export const fetchSequence = (adminKey, id) => crmFetch(`/drip/sequences/${id}`, adminKey);
export const createSequence = (adminKey, seq) =>
  crmFetch(`/drip/sequences`, adminKey, { method: "POST", body: seq });
export const updateSequence = (adminKey, id, seq) =>
  crmFetch(`/drip/sequences/${id}`, adminKey, { method: "PATCH", body: seq });
export const deleteSequence = (adminKey, id) =>
  crmFetch(`/drip/sequences/${id}`, adminKey, { method: "DELETE" });
export const activateSequence = (adminKey, id, active) =>
  crmFetch(`/drip/sequences/${id}/activate`, adminKey, { method: "POST", body: { active } });
export const enrollSequence = (adminKey, id, payload) =>
  crmFetch(`/drip/sequences/${id}/enroll`, adminKey, { method: "POST", body: payload });
export const setSequenceState = (adminKey, id, action) =>
  crmFetch(`/drip/sequences/${id}/state`, adminKey, { method: "POST", body: { action } });
export const runDripDue = (adminKey) =>
  crmFetch(`/drip/run-due`, adminKey, { method: "POST" });

// Campaign analytics (Phase 11)
export const fetchCampaigns = (adminKey) => crmFetch(`/campaigns`, adminKey);
export const fetchCampaign = (adminKey, id) => crmFetch(`/campaigns/${id}`, adminKey);
export const deleteCampaign = (adminKey, id) =>
  crmFetch(`/campaigns/${id}`, adminKey, { method: "DELETE" });

// Click tracking (Phase 12)
export const fetchCampaignClicks = (adminKey, id) =>
  crmFetch(`/campaigns/${id}/clicks`, adminKey);
export const fetchTrackingOverview = (adminKey) => crmFetch(`/tracking/overview`, adminKey);

// ---------------------------------------------------------------------------
// Workshop AI Analysis
// ---------------------------------------------------------------------------

const WORKSHOP_VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mpeg", ".mpg",
]);

export function validateWorkshopVideoFile(file) {
  if (!file) return "Please select a video file.";
  const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
  if (!WORKSHOP_VIDEO_EXTENSIONS.has(ext)) {
    return `Unsupported format. Use: ${[...WORKSHOP_VIDEO_EXTENSIONS].join(", ")}`;
  }
  if (file.size === 0) return "Video file is empty.";
  return null;
}

async function workshopFetch(path, adminKey, { method = "GET" } = {}) {
  const res = await fetch(apiUrl(`/api/admin/workshops${path}`), {
    method,
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) throw new Error("Invalid admin key.");
  if (res.status === 404) throw new Error("Workshop not found.");
  if (res.status === 409) {
    let detail = "Analysis is not ready yet.";
    try {
      const data = await res.json();
      if (data?.detail) {
        detail = typeof data.detail === "string"
          ? data.detail
          : data.detail?.message || detail;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = 409;
    throw err;
  }
  if (!res.ok) {
    let detail = "Request failed.";
    try {
      const data = await res.json();
      if (data?.detail) {
        detail = typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function uploadWorkshop(adminKey, { title, trainer, workshop_date, video }, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("title", title);
    form.append("trainer", trainer);
    form.append("workshop_date", workshop_date);
    form.append("video", video);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let body = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
        return;
      }
      const detail = body?.detail
        ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail))
        : `Upload failed (${xhr.status}).`;
      reject(new Error(detail));
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

    xhr.open("POST", apiUrl("/api/admin/workshops/upload"));
    xhr.setRequestHeader("X-Admin-Key", adminKey);
    xhr.send(form);
  });
}

export const fetchWorkshopStatus = (adminKey, workshopId) =>
  workshopFetch(`/${workshopId}/status`, adminKey);

export const fetchWorkshopAnalysis = (adminKey, workshopId) =>
  workshopFetch(`/${workshopId}/analysis`, adminKey);
