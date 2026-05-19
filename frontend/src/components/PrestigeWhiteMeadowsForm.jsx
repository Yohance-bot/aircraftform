import { useEffect, useMemo, useRef, useState } from "react";

import { submitPrestigeRegistration } from "../api.js";
import PlaneSky from "./PlaneSky.jsx";

const AGE_GROUPS = ["6-9 years", "10-14 years"];
const GRADES = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);
const BATCHES = ["25-29 May", "1-5 June"];
const TIMING_SLOTS = ["9-11 AM", "3-5 PM"];

const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "USA/Canada (+1)" },
  { code: "+44", label: "UK (+44)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+971", label: "UAE (+971)" },
  { code: "+974", label: "Qatar (+974)" },
  { code: "+966", label: "Saudi Arabia (+966)" },
  { code: "+968", label: "Oman (+968)" },
  { code: "+973", label: "Bahrain (+973)" },
  { code: "+965", label: "Kuwait (+965)" },
  { code: "+60", label: "Malaysia (+60)" },
  { code: "+1242", label: "Bahamas (+1 242)" },
  { code: "+1246", label: "Barbados (+1 246)" },
  { code: "+20", label: "Egypt (+20)" },
  { code: "+27", label: "South Africa (+27)" },
  { code: "+30", label: "Greece (+30)" },
  { code: "+31", label: "Netherlands (+31)" },
  { code: "+32", label: "Belgium (+32)" },
  { code: "+33", label: "France (+33)" },
  { code: "+34", label: "Spain (+34)" },
  { code: "+39", label: "Italy (+39)" },
  { code: "+41", label: "Switzerland (+41)" },
  { code: "+43", label: "Austria (+43)" },
  { code: "+45", label: "Denmark (+45)" },
  { code: "+46", label: "Sweden (+46)" },
  { code: "+47", label: "Norway (+47)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+52", label: "Mexico (+52)" },
  { code: "+55", label: "Brazil (+55)" },
  { code: "+62", label: "Indonesia (+62)" },
  { code: "+63", label: "Philippines (+63)" },
  { code: "+64", label: "New Zealand (+64)" },
  { code: "+66", label: "Thailand (+66)" },
  { code: "+81", label: "Japan (+81)" },
  { code: "+82", label: "South Korea (+82)" },
  { code: "+86", label: "China (+86)" },
  { code: "+90", label: "Turkey (+90)" },
  { code: "+92", label: "Pakistan (+92)" },
  { code: "+94", label: "Sri Lanka (+94)" },
  { code: "+880", label: "Bangladesh (+880)" },
  { code: "+977", label: "Nepal (+977)" },
];

const COUNTRY_CODE_OPTIONS = [...COUNTRY_CODES].sort((a, b) =>
  a.label.localeCompare(b.label)
);

const REQUIRED_FIELDS = [
  "parent_name",
  "child_name",
  "phone",
  "timing_slot",
  "age_group",
  "class_grade",
];

const ALL_FIELDS = [...REQUIRED_FIELDS, "batch_preference"];

const initialState = {
  parent_name: "",
  child_name: "",
  phone_country_code: "+91",
  phone: "",
  timing_slot: "",
  age_group: "",
  class_grade: "",
  batch_preference: "",
};

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export default function PrestigeWhiteMeadowsForm() {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
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
    if (submitStatus === "submitting") return;
    if (!validate()) return;

    setSubmitStatus("submitting");
    setErrorMessage("");
    try {
      const phoneDigits = onlyDigits(form.phone);
      const payload = {
        parent_name: form.parent_name.trim(),
        child_name: form.child_name.trim(),
        phone: `${form.phone_country_code}${phoneDigits}`,
        timing_slot: form.timing_slot,
        age_group: form.age_group,
        class_grade: form.class_grade,
        batch_preference: form.batch_preference || null,
        society: "prestige-white-meadows",
      };
      await submitPrestigeRegistration(payload);
      setCelebrationKey((k) => k + 1);
      setSubmitStatus("celebrating");
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => {
        setSubmitStatus("success");
      }, 1400);
    } catch (err) {
      setErrorMessage(err?.message || "Something went wrong.");
      setSubmitStatus("error");
    }
  }

  function resetForm() {
    setForm(initialState);
    setErrors({});
    setSubmitStatus("idle");
    setErrorMessage("");
  }

  return (
    <>
      <PlaneSky
        progress={
          submitStatus === "success" || submitStatus === "celebrating" ? 1 : progress
        }
        celebrationKey={celebrationKey}
      />

      <div className="w-full max-w-[600px]">
        <Header />
        {submitStatus === "success" ? (
          <SuccessCard onReset={resetForm} />
        ) : submitStatus === "celebrating" ? (
          <CelebratingCard />
        ) : (
          <div className="rounded-2xl bg-white/90 backdrop-blur shadow-card border border-slate-200 p-6 sm:p-8">
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

              <PhoneField
                countryCode={form.phone_country_code}
                onCountryCodeChange={(v) => updateField("phone_country_code", v)}
                phoneValue={form.phone}
                onPhoneChange={(v) => updateField("phone", v)}
                required
                error={errors.phone}
              />

              <SelectField
                label="Timing Slot"
                required
                value={form.timing_slot}
                onChange={(v) => updateField("timing_slot", v)}
                options={TIMING_SLOTS}
                placeholder="Select your preferred timing"
                error={errors.timing_slot}
              />

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

              <SelectField
                label="Batch Preference"
                value={form.batch_preference}
                onChange={(v) => updateField("batch_preference", v)}
                options={BATCHES}
                placeholder="Choose a batch (optional)"
              />

              {submitStatus === "error" && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitStatus === "submitting"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-800 active:bg-slate-900 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold text-base py-3.5 shadow-card transition-colors"
              >
                {submitStatus === "submitting" ? (
                  <>
                    <Spinner />
                    Submitting...
                  </>
                ) : (
                  <>
                    Register Now
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
        src="/prestigewhite.jpg"
        alt="Prestige White Meadows"
        className="mx-auto mb-4 h-auto w-40 sm:w-44 rounded-lg"
      />
      <div className="inline-flex items-center gap-2 text-slate-600 font-semibold tracking-wide text-xs uppercase">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-bob" />
        Prestige White Meadows Aeromodelling Club
      </div>
      <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">
        Summer Camp Registration
      </h1>
      <p className="mt-2 text-slate-600 text-sm sm:text-base max-w-md mx-auto">
        Five days of building, flying, and a whole lot of fun for young pilots.
        Reserve your child's spot below.
      </p>
    </div>
  );
}

function Badges() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 text-xs font-semibold">
        🛩 5-DAY CAMP · 2 HOURS/DAY
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 text-xs font-semibold">
        📍 Prestige White Meadows · Limited Spots per Batch
      </span>
    </div>
  );
}

function TextField({ label, required, value, onChange, placeholder, type = "text", helper, error }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-slate-500">*</span>}
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

function PhoneField({ countryCode, onCountryCodeChange, phoneValue, onPhoneChange, required, error }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">
        Phone Number (WhatsApp No.) {required && <span className="text-slate-500">*</span>}
      </span>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1.15fr),1fr] gap-2">
        <select
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          className={inputClass(null) + " mt-0 px-3 appearance-none bg-white pr-10"}
          required={required}
          aria-label="Country code"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.9rem center",
          }}
        >
          {COUNTRY_CODE_OPTIONS.map((opt) => (
            <option key={opt.code + opt.label} value={opt.code}>
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
        {label} {required && <span className="text-slate-500">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(error) + " appearance-none bg-white pr-10"}
        required={required}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
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

function inputClass(error) {
  return (
    "mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 " +
    (error ? "border-red-400" : "border-slate-200 hover:border-slate-300")
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
    <div className="rounded-2xl bg-white/80 backdrop-blur shadow-card border border-slate-200 p-10 text-center">
      <div className="text-4xl">🛫</div>
      <h2 className="mt-3 text-xl font-bold text-slate-900">Lift-off!</h2>
      <p className="mt-2 text-slate-600 text-sm">Filing your registration…</p>
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
        We&apos;ll contact you shortly with batch and timing details.
        Thanks for signing your young pilot up!
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold px-5 py-2.5 text-sm"
      >
        Register another child
      </button>
    </div>
  );
}
