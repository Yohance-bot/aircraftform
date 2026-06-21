import { useEffect, useState } from "react";

export const WA_OAUTH_CALLBACK_MESSAGE = "WA_OAUTH_CALLBACK";
export const WA_OAUTH_STORAGE_KEY = "wa_oauth_result";
export const WA_OAUTH_PENDING_KEY = "wa_oauth_pending";
export const WA_RESUME_ADMIN_KEY = "wa_resume_admin_key";

export function saveOAuthCallbackResult(payload) {
  sessionStorage.setItem(
    WA_OAUTH_STORAGE_KEY,
    JSON.stringify({ ...payload, saved_at: Date.now() }),
  );
}

export function readOAuthCallbackResult() {
  const raw = sessionStorage.getItem(WA_OAUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearOAuthCallbackResult() {
  sessionStorage.removeItem(WA_OAUTH_STORAGE_KEY);
}

export function saveOAuthPending(state, redirectUri) {
  sessionStorage.setItem(
    WA_OAUTH_PENDING_KEY,
    JSON.stringify({ state, redirect_uri: redirectUri, started_at: Date.now() }),
  );
}

export function readOAuthPending() {
  const raw = sessionStorage.getItem(WA_OAUTH_PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearOAuthPending() {
  sessionStorage.removeItem(WA_OAUTH_PENDING_KEY);
}

export default function WhatsAppOAuthCallback() {
  const [message, setMessage] = useState("Completing Meta authorization…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = {
      type: WA_OAUTH_CALLBACK_MESSAGE,
      code: params.get("code") || undefined,
      error: params.get("error") || undefined,
      error_description: params.get("error_description") || undefined,
      state: params.get("state") || undefined,
    };

    saveOAuthCallbackResult(payload);

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {
        /* sessionStorage + full-page resume handles popup failures */
      }
      setMessage(payload.code ? "Authorization received. Closing…" : "Returning to admin…");
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, 400);
      return;
    }

    if (payload.code) {
      setMessage("Authorization received. Returning to admin…");
      window.setTimeout(() => {
        window.location.replace("/admin?wa_resume=1");
      }, 300);
      return;
    }

    if (payload.error) {
      setMessage(payload.error_description || payload.error);
      window.setTimeout(() => {
        window.location.replace("/admin?wa_resume=1");
      }, 1500);
      return;
    }

    const paramDump = Object.fromEntries(params.entries());
    setMessage(
      `Meta redirected without an authorization code. URL params: ${JSON.stringify(paramDump)}. ` +
        "This usually means configuration 1696605061677781 is not a WhatsApp Business App coexistence Embedded Signup config.",
    );
    window.setTimeout(() => {
      window.location.replace("/admin?wa_resume=1");
    }, 4000);
  }, []);

  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 p-8 text-sm text-slate-600 max-w-md text-center">
      {message}
    </div>
  );
}
