import { useCallback, useEffect, useRef, useState } from "react";

import {
  completeOnboarding,
  fetchOnboardingConfig,
  fetchOnboardingStatus,
  reportOnboardingCancel,
} from "../api.js";

const FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
const CONFIG_ID_FALLBACK = "2349378865592558";

function loadFacebookSDK() {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.FB));
      existing.addEventListener("error", reject);
      return;
    }
    window.fbAsyncInit = function () {
      resolve(window.FB);
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export default function WhatsAppOnboardingPanel({ adminKey }) {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const sessionDataRef = useRef(null);
  const authCodeRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchOnboardingStatus(adminKey);
      setStatus(data);
    } catch (err) {
      setError(err?.message || "Could not load WhatsApp status.");
    }
  }, [adminKey]);

  const tryCompleteOnboarding = useCallback(async () => {
    const sessionData = sessionDataRef.current;
    const code = authCodeRef.current;
    if (!sessionData || sessionData.event !== FINISH_EVENT || !code) return;

    setConnecting(true);
    setError("");
    try {
      const result = await completeOnboarding(adminKey, {
        code,
        session_data: sessionData,
      });
      setStatus(result);
      authCodeRef.current = null;
      sessionDataRef.current = null;
    } catch (err) {
      setError(err?.message || "Onboarding failed.");
      refreshStatus();
    } finally {
      setConnecting(false);
    }
  }, [adminKey, refreshStatus]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError("");
      try {
        const [cfg, stat] = await Promise.all([
          fetchOnboardingConfig(),
          fetchOnboardingStatus(adminKey),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setStatus(stat);

        await loadFacebookSDK();
        if (cancelled) return;

        window.FB.init({
          appId: cfg.app_id,
          autoLogAppEvents: true,
          xfbml: true,
          version: cfg.graph_api_version || "v21.0",
        });
        setSdkReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to initialize WhatsApp onboarding.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [adminKey]);

  useEffect(() => {
    function handleMessage(event) {
      if (!event.origin.endsWith("facebook.com")) return;

      let data;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }

      if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "CANCEL" || data.event === "ERROR") {
        const inner = data.data || {};
        reportOnboardingCancel(adminKey, {
          current_step: inner.current_step,
          error_code: inner.error_code,
          error_message: inner.error_message,
          meta_session_id: inner.session_id,
          session_data: data,
        }).catch(() => {});

        const msg =
          inner.error_message ||
          (inner.current_step
            ? `Setup cancelled at step: ${inner.current_step}`
            : "WhatsApp setup was cancelled.");
        setError(msg);
        setConnecting(false);
        refreshStatus();
        return;
      }

      if (data.event === FINISH_EVENT) {
        sessionDataRef.current = data;
        tryCompleteOnboarding();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [adminKey, refreshStatus, tryCompleteOnboarding]);

  async function handleConnect() {
    if (!sdkReady || !window.FB) {
      setError("Facebook SDK is not ready yet. Please wait and try again.");
      return;
    }

    setConnecting(true);
    setError("");
    sessionDataRef.current = null;
    authCodeRef.current = null;

    const configId = config?.config_id || CONFIG_ID_FALLBACK;

    window.FB.login(
      (response) => {
        if (!response.authResponse?.code) {
          const detail =
            response.status === "unknown"
              ? "Login was cancelled or did not complete."
              : "No authorization code received from Facebook.";
          setError(detail);
          setConnecting(false);
          reportOnboardingCancel(adminKey, {
            error_message: detail,
            session_data: { event: "CANCEL", data: { current_step: "FB_LOGIN" } },
          }).catch(() => {});
          return;
        }

        authCodeRef.current = response.authResponse.code;
        tryCompleteOnboarding();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 p-8 text-sm text-slate-600">
        Loading WhatsApp connection…
      </div>
    );
  }

  const connected = status?.connected;

  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-brand-100 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">WhatsApp Connection</h2>
          <p className="mt-1 text-sm text-slate-600">
            Connect your existing WhatsApp Business App number to the Cloud API
            without leaving the mobile app.
          </p>
        </div>
        <StatusBadge connected={connected} status={status?.onboarding_status} />
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {connected ? (
        <ConnectedDetails status={status} onRefresh={refreshStatus} />
      ) : (
        <div className="mt-6 space-y-4">
          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
            <li>WhatsApp Business App v2.24.17 or higher required</li>
            <li>Keep the Business App open during setup</li>
            <li>Open the app every 14 days to stay connected</li>
            <li>Only new messages are synced — no history import</li>
          </ul>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting || !sdkReady}
            className="inline-flex items-center rounded-xl bg-[#1877f2] hover:bg-[#166fe5] disabled:opacity-60 text-white font-semibold px-6 py-3 text-sm transition-colors"
          >
            {connecting ? "Connecting…" : "Connect WhatsApp Business App"}
          </button>
        </div>
      )}

      {status?.latest_session?.step_logs?.length > 0 && (
        <OnboardingLog session={status.latest_session} />
      )}
    </div>
  );
}

function StatusBadge({ connected, status }) {
  const label = connected
    ? "Connected (Coexistence)"
    : status === "failed"
    ? "Connection failed"
    : status === "disconnected"
    ? "Disconnected"
    : "Not connected";
  const color = connected
    ? "bg-green-100 text-green-800"
    : status === "failed" || status === "disconnected"
    ? "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

function ConnectedDetails({ status, onRefresh }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 text-sm">
      <Detail label="WABA ID" value={status.waba_id} />
      <Detail label="Phone Number ID" value={status.phone_number_id} />
      <Detail label="Display Number" value={status.display_phone_number} />
      <Detail label="Verified Name" value={status.verified_name} />
      <Detail label="Business Portfolio" value={status.business_id} />
      <Detail label="Coexistence" value={status.is_on_biz_app ? "Active" : "—"} />
      <Detail label="Platform" value={status.platform_type} />
      <Detail label="Sync" value="Future messages only" />
      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 text-sm transition-colors"
        >
          Refresh status
        </button>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800 break-all">{value || "—"}</dd>
    </div>
  );
}

function OnboardingLog({ session }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        {open ? "Hide" : "Show"} onboarding log ({session.status})
      </button>
      {open && (
        <ol className="mt-3 space-y-1 text-xs text-slate-600 font-mono max-h-48 overflow-y-auto">
          {(session.step_logs || []).map((entry, i) => (
            <li key={i}>
              <span className="text-slate-400">{entry.timestamp}</span>{" "}
              <span className={entry.level === "error" ? "text-red-600" : ""}>
                {entry.step}
                {entry.detail ? `: ${entry.detail}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
