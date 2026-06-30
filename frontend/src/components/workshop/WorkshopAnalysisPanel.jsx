import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

import {
  fetchWorkshopAnalysis,
  fetchWorkshopStatus,
  uploadWorkshop,
  validateWorkshopVideoFile,
} from "../../api.js";
import { RateRing, Skeleton } from "../crm/CrmUI.jsx";

const POLL_MS = 5000;

const PROCESS_STEPS = [
  { key: "UPLOADING", label: "Uploading" },
  { key: "EXTRACTING_AUDIO", label: "Extracting Audio" },
  { key: "TRANSCRIBING", label: "Transcribing" },
  { key: "ANALYZING", label: "Analyzing" },
  { key: "COMPLETED", label: "Completed" },
];

const CATEGORY_ORDER = [
  "Communication",
  "Clarity",
  "Confidence",
  "Knowledge",
  "Structure",
  "Examples",
  "Engagement",
  "Audience Interaction",
  "Professionalism",
  "Delivery",
];

const CATEGORY_SHORT = {
  "Audience Interaction": "Interaction",
};

function stepIndex(status) {
  if (status === "FAILED") return -1;
  const idx = PROCESS_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function scoreColor(score) {
  if (score >= 8) return "#22c55e";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

function ScoreBar({ score, max = 10 }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: scoreColor(score) }}
      />
    </div>
  );
}

function CategoryCard({ name, data }) {
  const score = data?.score ?? 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">
          {CATEGORY_SHORT[name] || name}
        </h4>
        <span
          className="text-lg font-bold tabular-nums"
          style={{ color: scoreColor(score) }}
        >
          {score}/10
        </span>
      </div>
      <ScoreBar score={score} />
      <p className="mt-3 text-xs leading-relaxed text-slate-600">{data?.reasoning}</p>
      {data?.improvements && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-600">Improve: </span>
          {data.improvements}
        </p>
      )}
    </div>
  );
}

function BulletList({ title, items, accent }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: accent }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProcessingView({ status, progress, error }) {
  const current = stepIndex(status?.status);
  const failed = status?.status === "FAILED";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-6 flex items-center gap-3">
        {failed ? (
          <AlertCircle className="text-red-500" size={22} />
        ) : (
          <Loader2 className="animate-spin text-brand-500" size={22} />
        )}
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {failed ? "Processing failed" : "Processing workshop video"}
          </h3>
          <p className="text-sm text-slate-500">
            {failed ? (error || status?.error || "An error occurred.") : "This may take several minutes for long videos."}
          </p>
        </div>
      </div>

      {!failed && (
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
            <span>Progress</span>
            <span>{progress ?? 0}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {PROCESS_STEPS.map((step, i) => {
          const done = !failed && current > i;
          const active = !failed && current === i;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                done
                  ? "border-green-200 bg-green-50 text-green-800"
                  : active
                  ? "border-brand-300 bg-brand-50 text-brand-800 font-semibold"
                  : failed && i <= current
                  ? "border-red-100 bg-red-50 text-red-700"
                  : "border-slate-100 bg-slate-50 text-slate-400"
              }`}
            >
              {done ? (
                <CheckCircle2 size={16} className="flex-shrink-0 text-green-600" />
              ) : active ? (
                <Loader2 size={16} className="flex-shrink-0 animate-spin" />
              ) : (
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-current text-[10px]">
                  {i + 1}
                </span>
              )}
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeAnalysisPayload(data) {
  if (!data || typeof data !== "object") return null;
  let analysis = data.analysis;
  if (typeof analysis === "string") {
    try {
      analysis = JSON.parse(analysis);
    } catch {
      analysis = {};
    }
  }
  return {
    ...data,
    analysis: analysis && typeof analysis === "object" ? analysis : {},
  };
}

function ResultsView({ data, onReset }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const normalized = normalizeAnalysisPayload(data);
  const analysis = normalized?.analysis || {};
  const categories = analysis.categories || {};
  const overall = normalized?.overall_score ?? analysis.overall_score ?? 0;
  const summary = normalized?.summary || analysis.executive_summary || "";

  if (!normalized) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{normalized.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Trainer: <span className="font-medium text-slate-700">{normalized.trainer}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={15} /> Analyze another
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6">
          <div
            className="text-4xl font-bold tabular-nums"
            style={{ color: scoreColor(overall) }}
          >
            {overall}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overall / 10</div>
          <div className="mt-4">
            <RateRing value={overall * 10} label="Score" color={scoreColor(overall)} size={88} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Executive Summary</h3>
          <p className="text-sm leading-relaxed text-slate-700">{summary}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowTranscript((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-semibold text-slate-800">Transcript</span>
          {showTranscript ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showTranscript && (
          <div className="max-h-64 overflow-y-auto border-t border-slate-100 px-5 py-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-600">
              {normalized.transcript || "No transcript available."}
            </pre>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Category Scores</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORY_ORDER.map((name) => (
            <CategoryCard key={name} name={name} data={categories[name]} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BulletList title="Strengths" items={analysis.strengths} accent="#22c55e" />
        <BulletList title="Weaknesses" items={analysis.weaknesses} accent="#f59e0b" />
        <BulletList title="Recommendations" items={analysis.recommendations} accent="#0E90F1" />
      </div>
    </div>
  );
}

export default function WorkshopAnalysisPanel({ adminKey }) {
  const [title, setTitle] = useState("");
  const [trainer, setTrainer] = useState("");
  const [workshopDate, setWorkshopDate] = useState("");
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState("");
  const [phase, setPhase] = useState("form"); // form | uploading | processing | loading_results | results | failed
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workshopId, setWorkshopId] = useState(null);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);

  const reset = useCallback(() => {
    setPhase("form");
    setUploadProgress(0);
    setWorkshopId(null);
    setStatus(null);
    setResults(null);
    setFormError("");
    setFile(null);
    setTitle("");
    setTrainer("");
    setWorkshopDate("");
  }, []);

  const pickFile = useCallback((next) => {
    const err = validateWorkshopVideoFile(next);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError("");
    setFile(next);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  }, [pickFile]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!title.trim()) return setFormError("Title is required.");
    if (!trainer.trim()) return setFormError("Trainer name is required.");
    if (!workshopDate) return setFormError("Workshop date is required.");
    const fileErr = validateWorkshopVideoFile(file);
    if (fileErr) return setFormError(fileErr);

    setPhase("uploading");
    setUploadProgress(0);
    try {
      const res = await uploadWorkshop(
        adminKey,
        {
          title: title.trim(),
          trainer: trainer.trim(),
          workshop_date: workshopDate,
          video: file,
        },
        setUploadProgress,
      );
      setWorkshopId(res.workshop_id);
      setPhase("processing");
      setStatus({ status: "UPLOADING", progress: 10 });
    } catch (err) {
      setFormError(err?.message || "Upload failed.");
      setPhase("form");
    }
  }

  // Poll processing status every 5s until COMPLETED or FAILED
  useEffect(() => {
    if (phase !== "processing" || !workshopId) return undefined;

    let cancelled = false;

    async function poll() {
      try {
        const data = await fetchWorkshopStatus(adminKey, workshopId);
        if (cancelled) return;
        setStatus(data);

        if (data.status === "COMPLETED") {
          setPhase("loading_results");
          return;
        }

        if (data.status === "FAILED") {
          setFormError(data.error || "Processing failed.");
          setPhase("failed");
        }
      } catch (err) {
        if (!cancelled) {
          setFormError(err?.message || "Status check failed.");
          setPhase("failed");
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, workshopId, adminKey]);

  // Fetch analysis in a separate effect so polling cleanup cannot cancel the request
  useEffect(() => {
    if (phase !== "loading_results" || !workshopId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const analysis = await fetchWorkshopAnalysis(adminKey, workshopId);
        if (cancelled) return;
        setResults(analysis);
        setFormError("");
        setPhase("results");
      } catch (err) {
        if (!cancelled) {
          setFormError(err?.message || "Could not load analysis.");
          setPhase("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, workshopId, adminKey]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="text-brand-500" size={22} />
        <div>
          <h2 className="text-lg font-bold text-slate-900">Workshop AI Analysis</h2>
          <p className="text-sm text-slate-500">Upload a workshop recording for transcription and AI coaching feedback.</p>
        </div>
      </div>

      {formError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {phase === "form" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Workshop title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Drone Building Basics"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Trainer *</label>
              <input
                value={trainer}
                onChange={(e) => setTrainer(e.target.value)}
                placeholder="Trainer name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Workshop date *</label>
              <input
                type="date"
                value={workshopDate}
                onChange={(e) => setWorkshopDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.avi,.mkv,.webm,.m4v,.mpeg,.mpg,video/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] || null)}
            />
            <FileVideo className="mx-auto text-slate-400" size={36} />
            {file ? (
              <div className="mt-3">
                <p className="font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-sm font-medium text-brand-600 hover:underline"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm font-medium text-slate-700">Drag and drop your workshop video here</p>
                <p className="mt-1 text-xs text-slate-500">MP4, MOV, AVI, MKV, WebM — up to 2 GB</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  <Upload size={16} /> Browse files
                </button>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!file}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:bg-brand-300"
            >
              <Sparkles size={16} /> Start analysis
            </button>
          </div>
        </form>
      )}

      {phase === "uploading" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Loader2 size={18} className="animate-spin text-brand-500" />
            Uploading video…
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{uploadProgress}% — please keep this tab open</p>
        </div>
      )}

      {(phase === "processing" || phase === "failed") && (
        <ProcessingView status={status} progress={status?.progress} error={formError} />
      )}

      {phase === "failed" && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Try again
          </button>
        </div>
      )}

      {phase === "loading_results" && (
        <div className="space-y-4">
          <ProcessingView status={{ status: "COMPLETED", progress: 100 }} progress={100} />
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          </div>
        </div>
      )}

      {phase === "results" && results && (
        <ResultsView data={results} onReset={reset} />
      )}

      {phase === "results" && !results && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Analysis loaded but no data was returned. Try refreshing or analyze another workshop.
        </div>
      )}
    </div>
  );
}
