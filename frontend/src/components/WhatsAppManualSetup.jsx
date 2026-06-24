import { useState } from "react";

import {
  connectWhatsAppFromEnv,
  connectWhatsAppManual,
} from "../api.js";

export default function WhatsAppManualSetup({ adminKey, status, onSuccess, onError }) {
  const [wabaId, setWabaId] = useState(status?.env_waba_id || "");
  const [phoneNumberId, setPhoneNumberId] = useState(status?.env_phone_number_id || "");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const result = await connectWhatsAppManual(adminKey, {
        waba_id: wabaId.trim(),
        phone_number_id: phoneNumberId.trim(),
        access_token: accessToken.trim(),
      });
      onSuccess(result);
      setAccessToken("");
    } catch (err) {
      onError(err?.message || "Failed to save WhatsApp credentials.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFromEnv() {
    setSaving(true);
    onError("");
    try {
      const result = await connectWhatsAppFromEnv(adminKey);
      onSuccess(result);
    } catch (err) {
      onError(err?.message || "Failed to activate credentials from .env.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 px-4 py-3 space-y-2">
        <p className="font-semibold text-slate-900">Cloud API setup</p>
        <p>
          Get these from Meta App Dashboard → <strong>Connect on WhatsApp</strong> →{" "}
          <strong>API Setup</strong>:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-slate-600">
          <li>Click <strong>Generate access token</strong> (copy the token)</li>
          <li>Copy <strong>Phone number ID</strong> and <strong>WhatsApp Business Account ID</strong></li>
          <li>Paste below or set them in <code className="text-xs">backend/.env</code> and click Activate from .env</li>
        </ol>
      </div>

      {status?.env_credentials_configured && (
        <button
          type="button"
          onClick={handleFromEnv}
          disabled={saving}
          className="inline-flex items-center rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 disabled:opacity-60 text-brand-800 font-semibold px-5 py-2.5 text-sm transition-colors"
        >
          {saving ? "Activating…" : "Activate credentials from server .env"}
        </button>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <Field
          label="WhatsApp Business Account ID (WABA)"
          value={wabaId}
          onChange={setWabaId}
          placeholder="1446016720121490"
        />
        <Field
          label="Phone Number ID"
          value={phoneNumberId}
          onChange={setPhoneNumberId}
          placeholder="1142663425587676"
        />
        <Field
          label="Access Token"
          value={accessToken}
          onChange={setAccessToken}
          placeholder="Paste token from Meta API Setup"
          type="password"
        />
        <button
          type="submit"
          disabled={saving || !wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim()}
          className="inline-flex items-center rounded-xl bg-[#1877f2] hover:bg-[#166fe5] disabled:opacity-60 text-white font-semibold px-6 py-3 text-sm transition-colors"
        >
          {saving ? "Verifying…" : "Save & connect"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
      />
    </div>
  );
}
