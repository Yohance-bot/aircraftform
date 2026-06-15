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
    throw new Error("Failed to send message.");
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
// WhatsApp Business App Coexistence Onboarding
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

export async function fetchOnboardingConfig() {
  const res = await fetch(apiUrl("/api/onboarding/config"));
  if (!res.ok) {
    throw new Error("WhatsApp onboarding is not configured on the server.");
  }
  return res.json();
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

export async function exchangeOnboardingCode(adminKey, payload) {
  console.info("[WA onboarding] POST /api/onboarding/exchange-code", {
    codeLength: payload?.code?.length,
    redirect_uri_hints: payload?.redirect_uri_hints,
  });
  const res = await fetch(apiUrl("/api/onboarding/exchange-code"), {
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
    await parseOnboardingError(res, "Failed to exchange authorization code.");
  }
  return res.json();
}

export async function completeOnboarding(adminKey, payload) {
  console.info("[WA onboarding] POST /api/onboarding/complete", {
    event: payload?.session_data?.event,
    waba_id: payload?.session_data?.data?.waba_id,
    codeLength: payload?.code?.length,
    staging_session_id: payload?.staging_session_id,
    discover_assets: payload?.discover_assets,
  });
  const res = await fetch(apiUrl("/api/onboarding/complete"), {
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
    await parseOnboardingError(res, "WhatsApp onboarding failed.");
  }
  return res.json();
}

export async function reportOnboardingCancel(adminKey, payload) {
  const res = await fetch(apiUrl("/api/onboarding/cancel"), {
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
    throw new Error("Failed to record cancellation.");
  }
  return res.json();
}
