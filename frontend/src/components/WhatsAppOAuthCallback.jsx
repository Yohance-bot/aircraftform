import { useEffect, useState } from "react";

export const WA_OAUTH_CALLBACK_MESSAGE = "WA_OAUTH_CALLBACK";

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

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      setMessage(payload.code ? "Authorization received. Closing…" : "Returning to admin…");
      window.setTimeout(() => window.close(), 300);
      return;
    }

    setMessage(
      payload.error_description ||
        payload.error ||
        "Authorization finished. Return to the Admin Settings tab to continue.",
    );
  }, []);

  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 p-8 text-sm text-slate-600 max-w-md text-center">
      {message}
    </div>
  );
}
