// All API calls go through this helper so the base URL is configurable:
//  - In production we read `VITE_API_URL` (set on Render).
//  - In dev we leave it empty and rely on Vite's `/api` proxy.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
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
