import { useEffect, useMemo, useRef, useState } from "react";

import { submitRegistration } from "../api.js";
import PlaneSky from "./PlaneSky.jsx";

const AGE_GROUPS = ["6-9 years", "10-14 years"];
const GRADES = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);
const BATCHES = ["May 4 - May 15", "May 11 - May 22"];
const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "USA/Canada (+1)" },
  { code: "+44", label: "UK (+44)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+971", label: "UAE (+971)" },
];
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const REQUIRED_FIELDS = [
  "parent_name",
  "child_name",
  "phone",
  "email",
  "age_group",
  "class_grade",
];

const ALL_FIELDS = [
  ...REQUIRED_FIELDS,
  "villa_flat_number",
  "batch_preference",
  "special_requirements",
];

const initialState = {
  parent_name: "",
  child_name: "",
  phone_country_code: "+91",
  phone: "",
  email: "",
  age_group: "",
  class_grade: "",
  villa_flat_number: "",
  batch_preference: "",
  special_requirements: "",
};

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isLikelyValidEmail(value) {
  if (!value || value.length > 254 || value.includes("..")) return false;
  if (!EMAIL_PATTERN.test(value)) return false;
  const [local = "", domain = ""] = value.split("@");
  if (!local || !domain || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

export default function RegistrationForm() {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState({});
  // idle | submitting | celebrating | success | error
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  // Bumped once per successful submit so PlaneSky can fire a fresh
  // one-shot celebration animation.
  const [celebrationKey, setCelebrationKey] = useState(0);
  const celebrationTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, []);

  const progress = useMemo(() => {
    const filled = ALL_FIELDS.filter((f) => String(form[f] || "").trim() !== "");
    return filled.length / ALL_FIELDS.length;
  }, [form]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function validate() {
    const next = {};
    for (const field of REQUIRED_FIELDS) {
      if (!String(form[field] || "").trim()) {
        next[field] = "Required";
      }
    }
    const normalizedEmail = normalizeEmail(form.email);
    if (normalizedEmail && !isLikelyValidEmail(normalizedEmail)) {
      next.email = "Enter a valid email address";
    }
    const phoneDigits = onlyDigits(form.phone);
    if (phoneDigits && phoneDigits.length < 10) {
      next.phone = "Phone number must have at least 10 digits";
    } else if (phoneDigits.length > 14) {
      next.phone = "Phone number is too long";
    } else if (phoneDigits && /^(\d)\1+$/.test(phoneDigits)) {
      next.phone = "Enter a valid phone number";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "submitting") return;
    if (!validate()) return;

    setStatus("submitting");
    setErrorMessage("");
    try {
      const phoneDigits = onlyDigits(form.phone);
      const payload = {
        ...form,
        phone: `${form.phone_country_code}${phoneDigits}`,
        email: normalizeEmail(form.email),
      };
      await submitRegistration(payload);
      // Fly the celebration plane across the sky, then swap in the
      // success card once it's cleared the screen.
      setCelebrationKey((k) => k + 1);
      setStatus("celebrating");
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => {
        setStatus("success");
      }, 1400);
    } catch (err) {
      setErrorMessage(err?.message || "Something went wrong.");
      setStatus("error");
    }
  }

  function resetForm() {
    setForm(initialState);
    setErrors({});
    setStatus("idle");
    setErrorMessage("");
  }

  return (
    <>
      <PlaneSky
        progress={
          status === "success" || status === "celebrating" ? 1 : progress
        }
        celebrationKey={celebrationKey}
      />

      <div className="w-full max-w-[600px]">
        <Header />
        {status === "success" ? (
          <SuccessCard onReset={resetForm} />
        ) : status === "celebrating" ? (
          <CelebratingCard />
        ) : (
          <div className="rounded-2xl bg-white/90 backdrop-blur shadow-card border border-brand-100 p-6 sm:p-8">
            <Badges />

            <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Parent / Guardian Name"
                required
                value={form.parent_name}
                onChange={(v) => updateField("parent_name", v)}
                placeholder="e.g. Priya Sharma"
                error={errors.parent_name}
              />
              <TextField
                label="Child's Name"
                required
                value={form.child_name}
                onChange={(v) => updateField("child_name", v)}
                placeholder="e.g. Arjun Sharma"
                error={errors.child_name}
              />

              <div className="grid sm:grid-cols-2 gap-5">
                <PhoneField
                  countryCode={form.phone_country_code}
                  onCountryCodeChange={(v) => updateField("phone_country_code", v)}
                  phoneValue={form.phone}
                  onPhoneChange={(v) => updateField("phone", v)}
                  required
                  error={errors.phone}
                />
                <TextField
                  label="Email"
                  required
                  type="email"
                  value={form.email}
                  onChange={(v) => updateField("email", v)}
                  placeholder="you@email.com"
                  error={errors.email}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <SelectField
                  label="Age Group"
                  required
                  value={form.age_group}
                  onChange={(v) => updateField("age_group", v)}
                  options={AGE_GROUPS}
                  placeholder="Select age group"
                  error={errors.age_group}
                />
                <SelectField
                  label="Class / Grade"
                  required
                  value={form.class_grade}
                  onChange={(v) => updateField("class_grade", v)}
                  options={GRADES}
                  placeholder="Select grade"
                  error={errors.class_grade}
                />
              </div>

              <TextField
                label="Villa / Flat Number"
                value={form.villa_flat_number}
                onChange={(v) => updateField("villa_flat_number", v)}
                placeholder="e.g. Villa 42, Block C"
                helper="Helps us coordinate logistics for Palm Meadows residents"
              />

              <SelectField
                label="Batch Preference"
                value={form.batch_preference}
                onChange={(v) => updateField("batch_preference", v)}
                options={BATCHES}
                placeholder="Choose a batch"
              />

              <TextAreaField
                label="Any Questions or Special Requirements"
                value={form.special_requirements}
                onChange={(v) => updateField("special_requirements", v)}
                placeholder="e.g. My child has a nut allergy, or — Can siblings join the same batch?"
              />

              {status === "error" && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300 disabled:cursor-not-allowed text-white font-semibold text-base py-3.5 shadow-card transition-colors"
              >
                {status === "submitting" ? (
                  <>
                    <Spinner />
                    Submitting...
                  </>
                ) : (
                  <>
                    Register &amp; Proceed to Payment
                    <span aria-hidden>→</span>
                  </>
                )}
              </button>

              <ProgressHint progress={progress} />
            </form>
          </div>
        )}
      </div>
    </>
  );
}

function Header() {
  return (
    <div className="text-center mb-6">
      <img
        src="/palm-meadows-logo.png"
        alt="Palm Meadows Resort"
        className="mx-auto mb-4 h-auto w-40 sm:w-44"
      />
      <div className="inline-flex items-center gap-2 text-brand-700 font-semibold tracking-wide text-xs uppercase">
        <span className="inline-block h-2 w-2 rounded-full bg-brand-500 animate-bob" />
        Palm Meadows Aeromodelling Club
      </div>
      <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">
        Summer Camp Registration
      </h1>
      <p className="mt-2 text-slate-600 text-sm sm:text-base max-w-md mx-auto">
        Ten days of building, flying, and a whole lot of fun for young pilots.
        Reserve your child's spot below.
      </p>
    </div>
  );
}

function Badges() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100 px-3 py-1 text-xs font-semibold">
        🛩 10-DAY CAMP · 2 HOURS/DAY
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 text-xs font-semibold">
        📍 Exclusive for Palm Meadows Residents · Limited Spots per Batch
      </span>
    </div>
  );
}

function TextField({
  label,
  required,
  value,
  onChange,
  placeholder,
  type = "text",
  helper,
  error,
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-brand-600">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass(error)}
        required={required}
      />
      {helper && !error && (
        <span className="mt-1 block text-xs text-slate-500">{helper}</span>
      )}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function PhoneField({
  countryCode,
  onCountryCodeChange,
  phoneValue,
  onPhoneChange,
  required,
  error,
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">
        Phone Number (WhatsApp No.) {required && <span className="text-brand-600">*</span>}
      </span>
      <div className="mt-1.5 grid grid-cols-[9.5rem,1fr] gap-2">
        <select
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          className={inputClass(error) + " mt-0 px-3"}
          required={required}
          aria-label="Country code"
        >
          {COUNTRY_CODES.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          value={phoneValue}
          onChange={(e) => onPhoneChange(onlyDigits(e.target.value))}
          placeholder="10+ digit mobile number"
          className={inputClass(error) + " mt-0"}
          required={required}
          minLength={10}
          maxLength={14}
        />
      </div>
      {!error && (
        <span className="mt-1 block text-xs text-slate-500">
          Enter at least 10 digits. Country code will be added automatically.
        </span>
      )}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function SelectField({ label, required, value, onChange, options, placeholder, error }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-brand-600">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(error) + " appearance-none bg-white pr-10"}
        required={required}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23B44408' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.9rem center",
        }}
      >
        <option value="" disabled>
          {placeholder || "Select..."}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className={inputClass(null) + " resize-y"}
      />
    </label>
  );
}

function inputClass(error) {
  return (
    "mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 " +
    (error ? "border-red-400" : "border-slate-200 hover:border-brand-200")
  );
}

function ProgressHint({ progress }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>Form {pct}% complete</span>
      <span className="inline-flex items-center gap-1">
        {progress >= 1 ? "🛬 Cleared for takeoff" : "🛫 Plane is taxiing…"}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M22 12a10 10 0 0 1-10 10" strokeLinecap="round" />
    </svg>
  );
}

function CelebratingCard() {
  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur shadow-card border border-brand-100 p-10 text-center">
      <div className="text-4xl">🛫</div>
      <h2 className="mt-3 text-xl font-bold text-slate-900">Lift-off!</h2>
      <p className="mt-2 text-slate-600 text-sm">
        Filing your registration…
      </p>
    </div>
  );
}

function SuccessCard({ onReset }) {
  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur shadow-card border border-green-100 p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-3xl">
        ✓
      </div>
      <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
        Registration received!
      </h2>
      <p className="mt-2 text-slate-600">
        We&apos;ll contact you within 24 hours with payment and batch details.
        Thanks for signing your young pilot up!
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex items-center justify-center rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50 font-semibold px-5 py-2.5 text-sm"
      >
        Register another child
      </button>
    </div>
  );
}

