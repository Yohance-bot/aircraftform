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
  { code: "+1242", label: "Bahamas (+1 242)" },
  { code: "+1246", label: "Barbados (+1 246)" },
  { code: "+1264", label: "Anguilla (+1 264)" },
  { code: "+1268", label: "Antigua & Barbuda (+1 268)" },
  { code: "+1284", label: "British Virgin Islands (+1 284)" },
  { code: "+1340", label: "U.S. Virgin Islands (+1 340)" },
  { code: "+1345", label: "Cayman Islands (+1 345)" },
  { code: "+1441", label: "Bermuda (+1 441)" },
  { code: "+1473", label: "Grenada (+1 473)" },
  { code: "+1649", label: "Turks & Caicos (+1 649)" },
  { code: "+1664", label: "Montserrat (+1 664)" },
  { code: "+1670", label: "Northern Mariana Islands (+1 670)" },
  { code: "+1671", label: "Guam (+1 671)" },
  { code: "+1684", label: "American Samoa (+1 684)" },
  { code: "+1721", label: "Sint Maarten (+1 721)" },
  { code: "+1758", label: "Saint Lucia (+1 758)" },
  { code: "+1767", label: "Dominica (+1 767)" },
  { code: "+1784", label: "St. Vincent & the Grenadines (+1 784)" },
  { code: "+1809", label: "Dominican Republic (+1 809)" },
  { code: "+1829", label: "Dominican Republic (+1 829)" },
  { code: "+1849", label: "Dominican Republic (+1 849)" },
  { code: "+20", label: "Egypt (+20)" },
  { code: "+27", label: "South Africa (+27)" },
  { code: "+30", label: "Greece (+30)" },
  { code: "+31", label: "Netherlands (+31)" },
  { code: "+32", label: "Belgium (+32)" },
  { code: "+33", label: "France (+33)" },
  { code: "+34", label: "Spain (+34)" },
  { code: "+36", label: "Hungary (+36)" },
  { code: "+39", label: "Italy (+39)" },
  { code: "+41", label: "Switzerland (+41)" },
  { code: "+43", label: "Austria (+43)" },
  { code: "+45", label: "Denmark (+45)" },
  { code: "+46", label: "Sweden (+46)" },
  { code: "+47", label: "Norway (+47)" },
  { code: "+48", label: "Poland (+48)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+52", label: "Mexico (+52)" },
  { code: "+53", label: "Cuba (+53)" },
  { code: "+54", label: "Argentina (+54)" },
  { code: "+55", label: "Brazil (+55)" },
  { code: "+56", label: "Chile (+56)" },
  { code: "+57", label: "Colombia (+57)" },
  { code: "+58", label: "Venezuela (+58)" },
  { code: "+60", label: "Malaysia (+60)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+62", label: "Indonesia (+62)" },
  { code: "+63", label: "Philippines (+63)" },
  { code: "+64", label: "New Zealand (+64)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+66", label: "Thailand (+66)" },
  { code: "+81", label: "Japan (+81)" },
  { code: "+82", label: "South Korea (+82)" },
  { code: "+84", label: "Vietnam (+84)" },
  { code: "+86", label: "China (+86)" },
  { code: "+90", label: "Turkey (+90)" },
  { code: "+92", label: "Pakistan (+92)" },
  { code: "+93", label: "Afghanistan (+93)" },
  { code: "+94", label: "Sri Lanka (+94)" },
  { code: "+95", label: "Myanmar (+95)" },
  { code: "+98", label: "Iran (+98)" },
  { code: "+211", label: "South Sudan (+211)" },
  { code: "+212", label: "Morocco (+212)" },
  { code: "+213", label: "Algeria (+213)" },
  { code: "+216", label: "Tunisia (+216)" },
  { code: "+218", label: "Libya (+218)" },
  { code: "+220", label: "Gambia (+220)" },
  { code: "+221", label: "Senegal (+221)" },
  { code: "+222", label: "Mauritania (+222)" },
  { code: "+223", label: "Mali (+223)" },
  { code: "+224", label: "Guinea (+224)" },
  { code: "+225", label: "Cote d'Ivoire (+225)" },
  { code: "+226", label: "Burkina Faso (+226)" },
  { code: "+227", label: "Niger (+227)" },
  { code: "+228", label: "Togo (+228)" },
  { code: "+229", label: "Benin (+229)" },
  { code: "+230", label: "Mauritius (+230)" },
  { code: "+231", label: "Liberia (+231)" },
  { code: "+232", label: "Sierra Leone (+232)" },
  { code: "+233", label: "Ghana (+233)" },
  { code: "+234", label: "Nigeria (+234)" },
  { code: "+235", label: "Chad (+235)" },
  { code: "+236", label: "Central African Republic (+236)" },
  { code: "+237", label: "Cameroon (+237)" },
  { code: "+238", label: "Cape Verde (+238)" },
  { code: "+239", label: "Sao Tome & Principe (+239)" },
  { code: "+240", label: "Equatorial Guinea (+240)" },
  { code: "+241", label: "Gabon (+241)" },
  { code: "+242", label: "Republic of the Congo (+242)" },
  { code: "+243", label: "DR Congo (+243)" },
  { code: "+244", label: "Angola (+244)" },
  { code: "+245", label: "Guinea-Bissau (+245)" },
  { code: "+246", label: "Diego Garcia (+246)" },
  { code: "+247", label: "Ascension Island (+247)" },
  { code: "+248", label: "Seychelles (+248)" },
  { code: "+249", label: "Sudan (+249)" },
  { code: "+250", label: "Rwanda (+250)" },
  { code: "+251", label: "Ethiopia (+251)" },
  { code: "+252", label: "Somalia (+252)" },
  { code: "+253", label: "Djibouti (+253)" },
  { code: "+254", label: "Kenya (+254)" },
  { code: "+255", label: "Tanzania (+255)" },
  { code: "+256", label: "Uganda (+256)" },
  { code: "+257", label: "Burundi (+257)" },
  { code: "+258", label: "Mozambique (+258)" },
  { code: "+260", label: "Zambia (+260)" },
  { code: "+261", label: "Madagascar (+261)" },
  { code: "+262", label: "Reunion (+262)" },
  { code: "+263", label: "Zimbabwe (+263)" },
  { code: "+264", label: "Namibia (+264)" },
  { code: "+265", label: "Malawi (+265)" },
  { code: "+266", label: "Lesotho (+266)" },
  { code: "+267", label: "Botswana (+267)" },
  { code: "+268", label: "Eswatini (+268)" },
  { code: "+269", label: "Comoros (+269)" },
  { code: "+290", label: "Saint Helena (+290)" },
  { code: "+291", label: "Eritrea (+291)" },
  { code: "+297", label: "Aruba (+297)" },
  { code: "+298", label: "Faroe Islands (+298)" },
  { code: "+299", label: "Greenland (+299)" },
  { code: "+350", label: "Gibraltar (+350)" },
  { code: "+351", label: "Portugal (+351)" },
  { code: "+352", label: "Luxembourg (+352)" },
  { code: "+353", label: "Ireland (+353)" },
  { code: "+354", label: "Iceland (+354)" },
  { code: "+355", label: "Albania (+355)" },
  { code: "+356", label: "Malta (+356)" },
  { code: "+357", label: "Cyprus (+357)" },
  { code: "+358", label: "Finland (+358)" },
  { code: "+359", label: "Bulgaria (+359)" },
  { code: "+370", label: "Lithuania (+370)" },
  { code: "+371", label: "Latvia (+371)" },
  { code: "+372", label: "Estonia (+372)" },
  { code: "+373", label: "Moldova (+373)" },
  { code: "+374", label: "Armenia (+374)" },
  { code: "+375", label: "Belarus (+375)" },
  { code: "+376", label: "Andorra (+376)" },
  { code: "+377", label: "Monaco (+377)" },
  { code: "+378", label: "San Marino (+378)" },
  { code: "+380", label: "Ukraine (+380)" },
  { code: "+381", label: "Serbia (+381)" },
  { code: "+382", label: "Montenegro (+382)" },
  { code: "+383", label: "Kosovo (+383)" },
  { code: "+385", label: "Croatia (+385)" },
  { code: "+386", label: "Slovenia (+386)" },
  { code: "+387", label: "Bosnia & Herzegovina (+387)" },
  { code: "+389", label: "North Macedonia (+389)" },
  { code: "+420", label: "Czech Republic (+420)" },
  { code: "+421", label: "Slovakia (+421)" },
  { code: "+423", label: "Liechtenstein (+423)" },
  { code: "+500", label: "Falkland Islands (+500)" },
  { code: "+501", label: "Belize (+501)" },
  { code: "+502", label: "Guatemala (+502)" },
  { code: "+503", label: "El Salvador (+503)" },
  { code: "+504", label: "Honduras (+504)" },
  { code: "+505", label: "Nicaragua (+505)" },
  { code: "+506", label: "Costa Rica (+506)" },
  { code: "+507", label: "Panama (+507)" },
  { code: "+508", label: "Saint Pierre & Miquelon (+508)" },
  { code: "+509", label: "Haiti (+509)" },
  { code: "+590", label: "Guadeloupe (+590)" },
  { code: "+591", label: "Bolivia (+591)" },
  { code: "+592", label: "Guyana (+592)" },
  { code: "+593", label: "Ecuador (+593)" },
  { code: "+594", label: "French Guiana (+594)" },
  { code: "+595", label: "Paraguay (+595)" },
  { code: "+596", label: "Martinique (+596)" },
  { code: "+597", label: "Suriname (+597)" },
  { code: "+598", label: "Uruguay (+598)" },
  { code: "+599", label: "Curaçao (+599)" },
  { code: "+670", label: "Timor-Leste (+670)" },
  { code: "+672", label: "Antarctica/External (+672)" },
  { code: "+673", label: "Brunei (+673)" },
  { code: "+674", label: "Nauru (+674)" },
  { code: "+675", label: "Papua New Guinea (+675)" },
  { code: "+676", label: "Tonga (+676)" },
  { code: "+677", label: "Solomon Islands (+677)" },
  { code: "+678", label: "Vanuatu (+678)" },
  { code: "+679", label: "Fiji (+679)" },
  { code: "+680", label: "Palau (+680)" },
  { code: "+681", label: "Wallis & Futuna (+681)" },
  { code: "+682", label: "Cook Islands (+682)" },
  { code: "+683", label: "Niue (+683)" },
  { code: "+685", label: "Samoa (+685)" },
  { code: "+686", label: "Kiribati (+686)" },
  { code: "+687", label: "New Caledonia (+687)" },
  { code: "+688", label: "Tuvalu (+688)" },
  { code: "+689", label: "French Polynesia (+689)" },
  { code: "+690", label: "Tokelau (+690)" },
  { code: "+691", label: "Micronesia (+691)" },
  { code: "+692", label: "Marshall Islands (+692)" },
  { code: "+850", label: "North Korea (+850)" },
  { code: "+852", label: "Hong Kong (+852)" },
  { code: "+853", label: "Macau (+853)" },
  { code: "+855", label: "Cambodia (+855)" },
  { code: "+856", label: "Laos (+856)" },
  { code: "+880", label: "Bangladesh (+880)" },
  { code: "+886", label: "Taiwan (+886)" },
  { code: "+960", label: "Maldives (+960)" },
  { code: "+961", label: "Lebanon (+961)" },
  { code: "+962", label: "Jordan (+962)" },
  { code: "+963", label: "Syria (+963)" },
  { code: "+964", label: "Iraq (+964)" },
  { code: "+965", label: "Kuwait (+965)" },
  { code: "+966", label: "Saudi Arabia (+966)" },
  { code: "+967", label: "Yemen (+967)" },
  { code: "+968", label: "Oman (+968)" },
  { code: "+970", label: "Palestine (+970)" },
  { code: "+971", label: "UAE (+971)" },
  { code: "+972", label: "Israel (+972)" },
  { code: "+973", label: "Bahrain (+973)" },
  { code: "+974", label: "Qatar (+974)" },
  { code: "+975", label: "Bhutan (+975)" },
  { code: "+976", label: "Mongolia (+976)" },
  { code: "+977", label: "Nepal (+977)" },
  { code: "+992", label: "Tajikistan (+992)" },
  { code: "+993", label: "Turkmenistan (+993)" },
  { code: "+994", label: "Azerbaijan (+994)" },
  { code: "+995", label: "Georgia (+995)" },
  { code: "+996", label: "Kyrgyzstan (+996)" },
  { code: "+998", label: "Uzbekistan (+998)" },
];
const COUNTRY_CODE_OPTIONS = [...COUNTRY_CODES].sort((a, b) =>
  a.label.localeCompare(b.label)
);
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
  const [countrySearch, setCountrySearch] = useState(
    COUNTRY_CODE_OPTIONS.find((opt) => opt.code === initialState.phone_country_code)?.label || ""
  );
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

  function updateCountryCode(code) {
    const nextCode = code || initialState.phone_country_code;
    const match = COUNTRY_CODE_OPTIONS.find((opt) => opt.code === nextCode);
    setForm((prev) => ({ ...prev, phone_country_code: nextCode }));
    setCountrySearch(match ? match.label : nextCode);
    if (errors.phone_country_code) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.phone_country_code;
        return next;
      });
    }
  }

  const filteredCountryCodes = useMemo(() => {
    const query = String(countrySearch || "").trim().toLowerCase();
    if (!query) return COUNTRY_CODE_OPTIONS;
    return COUNTRY_CODE_OPTIONS.filter((opt) => {
      const haystack = `${opt.label} ${opt.code}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [countrySearch]);

  function validate() {
    const next = {};
    for (const field of REQUIRED_FIELDS) {
      if (!String(form[field] || "").trim()) {
        next[field] = "Required";
      }
    }
    if (!COUNTRY_CODE_OPTIONS.some((opt) => opt.code === form.phone_country_code)) {
      next.phone_country_code = "Select a country or region";
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
    if (!countrySearch.trim()) {
      const match = COUNTRY_CODE_OPTIONS.find((opt) => opt.code === form.phone_country_code);
      setCountrySearch(match ? match.label : "");
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
                  countrySearch={countrySearch}
                  onCountrySearchChange={setCountrySearch}
                  onCountryCodeChange={updateCountryCode}
                  filteredCountryCodes={filteredCountryCodes}
                  phoneValue={form.phone}
                  onPhoneChange={(v) => updateField("phone", v)}
                  required
                  error={errors.phone}
                  countryError={errors.phone_country_code}
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
  countrySearch,
  onCountrySearchChange,
  onCountryCodeChange,
  filteredCountryCodes,
  phoneValue,
  onPhoneChange,
  required,
  error,
  countryError,
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700">
        Phone Number (WhatsApp No.) {required && <span className="text-brand-600">*</span>}
      </span>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1.15fr),1fr] gap-2">
        <div className="relative">
          <input
            type="text"
            value={countrySearch}
            onChange={(e) => {
              onCountrySearchChange(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              setTimeout(() => setIsOpen(false), 120);
            }}
            placeholder="Search country / region"
            className={inputClass(countryError) + " mt-0 px-3 pr-8"}
            required={required}
            aria-label="Search country or region"
          />
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Toggle country list"
          >
            ▾
          </button>
          {isOpen && filteredCountryCodes.length > 0 && (
            <div className="absolute z-20 mt-2 w-full max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {filteredCountryCodes.slice(0, 20).map((opt) => (
                <button
                  key={opt.code + opt.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onCountryCodeChange(opt.code);
                    onCountrySearchChange(opt.label);
                    setIsOpen(false);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 " +
                    (countryCode === opt.code ? "bg-brand-50 text-brand-700" : "text-slate-700")
                  }
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                  <span className="shrink-0 text-xs font-semibold text-slate-400">{opt.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
      {countryError && <span className="mt-1 block text-xs text-red-600">{countryError}</span>}
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

