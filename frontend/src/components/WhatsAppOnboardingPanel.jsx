import { useCallback, useEffect, useRef, useState } from "react";

import {
  completeOnboarding,
  fetchOnboardingConfig,
  fetchOnboardingStatus,
  reportOnboardingCancel,
} from "../api.js";

const FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
const CONFIG_ID_FALLBACK = "2349378865592558";
/** Meta exchangeable codes expire in ~30s — wait window must stay under that once code arrives. */
const COMPLETION_WAIT_MS = 120_000;
const CODE_POLL_MS = 2_000;

const LOG_PREFIX = "[WA onboarding]";

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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

function isFinishEvent(eventName) {
  return (
    eventName === FINISH_EVENT ||
    eventName === "FINISH" ||
    eventName === "FINISH_ONLY_WABA"
  );
}

function extractCodeFromSession(sessionData) {
  if (!sessionData) return null;
  const inner = sessionData.data || sessionData;
  return inner.code || inner.auth_code || inner.exchangeable_token_code || null;
}

export default function WhatsAppOnboardingPanel({ adminKey }) {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [waitingPhase, setWaitingPhase] = useState("");
  const [error, setError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const sessionDataRef = useRef(null);
  const authCodeRef = useRef(null);
  const completionInFlightRef = useRef(false);
  const waitTimeoutRef = useRef(null);
  const codePollRef = useRef(null);
  const flowActiveRef = useRef(false);

  const appendLog = useCallback((step, detail = "", level = "info") => {
    const entry = {
      step,
      detail,
      level,
      timestamp: new Date().toISOString(),
    };
    console.log(`${LOG_PREFIX} [${level}] ${step}`, detail || "");
    setDebugLog((prev) => [...prev.slice(-49), entry]);
  }, []);

  const clearWaitTimers = useCallback(() => {
    if (waitTimeoutRef.current) {
      clearTimeout(waitTimeoutRef.current);
      waitTimeoutRef.current = null;
    }
    if (codePollRef.current) {
      clearInterval(codePollRef.current);
      codePollRef.current = null;
    }
  }, []);

  const setFlowState = useCallback(
    (nextConnecting, phase = "") => {
      appendLog("flow_state", `connecting=${nextConnecting} phase=${phase || "(none)"}`);
      setConnecting(nextConnecting);
      setWaitingPhase(phase);
    },
    [appendLog],
  );

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchOnboardingStatus(adminKey);
      setStatus(data);
    } catch (err) {
      setError(err?.message || "Could not load WhatsApp status.");
    }
  }, [adminKey]);

  const failFlow = useCallback(
    async (message, cancelPayload = null) => {
      clearWaitTimers();
      flowActiveRef.current = false;
      completionInFlightRef.current = false;
      setFlowState(false, "");
      setError(message);
      appendLog("flow_failed", message, "error");

      if (cancelPayload) {
        try {
          await reportOnboardingCancel(adminKey, cancelPayload);
          await refreshStatus();
        } catch (err) {
          appendLog("cancel_report_failed", err?.message || "unknown", "warning");
        }
      }
    },
    [adminKey, appendLog, clearWaitTimers, refreshStatus, setFlowState],
  );

  const tryCompleteOnboarding = useCallback(async () => {
    const sessionData = sessionDataRef.current;
    const code = authCodeRef.current;
    const hasSession = Boolean(sessionData && isFinishEvent(sessionData.event));
    const hasCode = Boolean(code);

    appendLog(
      "try_complete",
      safeJson({
        hasSession,
        hasCode,
        sessionEvent: sessionData?.event || null,
        codeLength: code ? code.length : 0,
        inFlight: completionInFlightRef.current,
      }),
    );

    if (!hasSession || !hasCode) {
      if (flowActiveRef.current) {
        const missing = !hasSession && !hasCode
          ? "session + code"
          : !hasSession
          ? "FINISH session event"
          : "OAuth code";
        setFlowState(true, `Waiting for ${missing}…`);
      }
      return;
    }

    if (completionInFlightRef.current) {
      appendLog("try_complete_skipped", "completion already in flight", "warning");
      return;
    }

    completionInFlightRef.current = true;
    clearWaitTimers();
    setFlowState(true, "Exchanging token with server…");
    setError("");

    appendLog("post_complete_start", safeJson({ event: sessionData.event }));

    try {
      const result = await completeOnboarding(adminKey, {
        code,
        session_data: sessionData,
      });
      appendLog("post_complete_success", safeJson({ connected: result.connected }));
      setStatus(result);
      authCodeRef.current = null;
      sessionDataRef.current = null;
      flowActiveRef.current = false;
      setError("");
    } catch (err) {
      appendLog("post_complete_error", err?.message || "unknown", "error");
      setError(err?.message || "Onboarding failed.");
      await refreshStatus();
    } finally {
      completionInFlightRef.current = false;
      flowActiveRef.current = false;
      setFlowState(false, "");
    }
  }, [adminKey, appendLog, clearWaitTimers, refreshStatus, setFlowState]);

  const pollForAuthCode = useCallback(() => {
    if (!window.FB || !flowActiveRef.current || authCodeRef.current) return;

    window.FB.getLoginStatus((response) => {
      appendLog("fb_get_login_status", safeJson(response));

      const code = response?.authResponse?.code;
      if (code) {
        authCodeRef.current = code;
        appendLog("code_from_get_login_status", `length=${code.length}`);
        tryCompleteOnboarding();
      }
    });
  }, [appendLog, tryCompleteOnboarding]);

  const startCompletionWait = useCallback(() => {
    clearWaitTimers();

    waitTimeoutRef.current = setTimeout(() => {
      if (!flowActiveRef.current) return;

      const hasSession = Boolean(
        sessionDataRef.current && isFinishEvent(sessionDataRef.current.event),
      );
      const hasCode = Boolean(authCodeRef.current);

      appendLog(
        "completion_timeout",
        safeJson({ hasSession, hasCode }),
        "error",
      );

      failFlow(
        hasSession && !hasCode
          ? "Embedded Signup finished but no OAuth code arrived. Close any popup blockers and try again."
          : !hasSession && hasCode
          ? "OAuth code received but Embedded Signup session data never arrived. Try again."
          : "WhatsApp setup timed out waiting for Meta. Please try again.",
        {
          error_message: "Completion wait timed out",
          session_data: {
            event: "CANCEL",
            data: {
              current_step: "TIMEOUT",
              has_session: hasSession,
              has_code: hasCode,
            },
          },
        },
      );
    }, COMPLETION_WAIT_MS);

    codePollRef.current = setInterval(pollForAuthCode, CODE_POLL_MS);
  }, [appendLog, clearWaitTimers, failFlow, pollForAuthCode]);

  const handleFbLoginResponse = useCallback(
    (response) => {
      appendLog("fb_login_callback", safeJson(response));

      const code = response?.authResponse?.code;
      if (code) {
        authCodeRef.current = code;
        appendLog("code_from_fb_login", `length=${code.length}`);
        tryCompleteOnboarding();
        return;
      }

      // IMPORTANT: Do NOT treat a missing code as cancellation.
      // Meta often closes/reopens the popup during reconnect steps and fires
      // FB.login with status "unknown" before the flow is actually finished.
      // The OAuth code and FINISH event may arrive asynchronously via postMessage.
      appendLog(
        "fb_login_no_code_yet",
        `status=${response?.status || "unknown"} — waiting for code and/or FINISH event`,
        "warning",
      );

      if (flowActiveRef.current) {
        setFlowState(true, "Popup closed — waiting for Meta…");
      }
    },
    [appendLog, setFlowState, tryCompleteOnboarding],
  );

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
        appendLog("sdk_ready", safeJson({ appId: cfg.app_id, version: cfg.graph_api_version }));
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to initialize WhatsApp onboarding.");
          appendLog("init_failed", err?.message || "unknown", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [adminKey, appendLog]);

  useEffect(() => {
    function handleMessage(event) {
      if (!event.origin.endsWith("facebook.com")) return;

      let data;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        appendLog("postmessage_unparsed", safeJson({ origin: event.origin, raw: event.data }));
        return;
      }

      appendLog("postmessage_raw", safeJson({ origin: event.origin, data }));

      if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;

      appendLog("wa_embedded_signup", safeJson(data));

      if (data.event === "CANCEL" || data.event === "ERROR") {
        const inner = data.data || {};
        failFlow(
          inner.error_message ||
            (inner.current_step
              ? `Setup cancelled at step: ${inner.current_step}`
              : "WhatsApp setup was cancelled."),
          {
            current_step: inner.current_step,
            error_code: inner.error_code,
            error_message: inner.error_message,
            meta_session_id: inner.session_id,
            session_data: data,
          },
        );
        return;
      }

      if (isFinishEvent(data.event)) {
        sessionDataRef.current = data;

        const embeddedCode = extractCodeFromSession(data);
        if (embeddedCode && !authCodeRef.current) {
          authCodeRef.current = embeddedCode;
          appendLog("code_from_session_event", `length=${embeddedCode.length}`);
        }

        appendLog("finish_event_received", data.event);
        tryCompleteOnboarding();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [appendLog, failFlow, tryCompleteOnboarding]);

  useEffect(() => {
    return () => clearWaitTimers();
  }, [clearWaitTimers]);

  function handleConnect() {
    if (!sdkReady || !window.FB) {
      setError("Facebook SDK is not ready yet. Please wait and try again.");
      return;
    }

    clearWaitTimers();
    flowActiveRef.current = true;
    completionInFlightRef.current = false;
    sessionDataRef.current = null;
    authCodeRef.current = null;
    setError("");
    setFlowState(true, "Opening Embedded Signup…");
    appendLog("connect_clicked", safeJson({ config_id: config?.config_id || CONFIG_ID_FALLBACK }));

    const configId = config?.config_id || CONFIG_ID_FALLBACK;

    startCompletionWait();

    window.FB.login(handleFbLoginResponse, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    });
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

      {waitingPhase && connecting && (
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3">
          {waitingPhase}
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

      {(debugLog.length > 0 || status?.latest_session?.step_logs?.length > 0) && (
        <DiagnosticLog clientLog={debugLog} serverSession={status?.latest_session} />
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

function DiagnosticLog({ clientLog, serverSession }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 border-t border-slate-100 pt-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        {open ? "Hide" : "Show"} diagnostic log
        {serverSession?.status ? ` (server: ${serverSession.status})` : ""}
      </button>
      {open && (
        <>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Client (this session)</div>
            <ol className="space-y-1 text-xs text-slate-600 font-mono max-h-40 overflow-y-auto bg-slate-50 rounded-lg p-3">
              {clientLog.map((entry, i) => (
                <li key={i}>
                  <span className="text-slate-400">{entry.timestamp}</span>{" "}
                  <span className={entry.level === "error" ? "text-red-600" : entry.level === "warning" ? "text-amber-700" : ""}>
                    {entry.step}
                    {entry.detail ? `: ${entry.detail}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {serverSession?.step_logs?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Server (latest attempt)</div>
              <ol className="space-y-1 text-xs text-slate-600 font-mono max-h-40 overflow-y-auto bg-slate-50 rounded-lg p-3">
                {serverSession.step_logs.map((entry, i) => (
                  <li key={i}>
                    <span className="text-slate-400">{entry.timestamp}</span>{" "}
                    <span className={entry.level === "error" ? "text-red-600" : ""}>
                      {entry.step}
                      {entry.detail ? `: ${entry.detail}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
