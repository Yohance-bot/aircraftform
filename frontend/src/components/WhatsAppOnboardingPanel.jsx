import { useCallback, useEffect, useState } from "react";

import { fetchOnboardingStatus } from "../api.js";

import WhatsAppManualSetup from "./WhatsAppManualSetup.jsx";

export default function WhatsAppOnboardingPanel({ adminKey }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchOnboardingStatus(adminKey);
      setStatus(data);
    } catch (err) {
      setError(err?.message || "Could not load WhatsApp status.");
    }
  }, [adminKey]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError("");
      try {
        const stat = await fetchOnboardingStatus(adminKey);
        if (!cancelled) setStatus(stat);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load WhatsApp connection status.");
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
            Connect WhatsApp Cloud API using credentials from Meta API Setup.
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
        <WhatsAppManualSetup
          adminKey={adminKey}
          status={status}
          onSuccess={(result) => {
            setStatus(result);
            setError("");
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function StatusBadge({ connected, status }) {
  const label = connected
    ? "Connected (Cloud API)"
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
      <Detail label="Platform" value={status.platform_type} />
      <Detail label="Webhooks" value={status.webhook_subscribed ? "Subscribed" : "Not subscribed"} />
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
