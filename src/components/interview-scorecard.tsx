"use client";

type Dimensions = {
  content?: number;
  structure?: number;
  communication?: number;
  speech?: number | null;
};

export type ScorecardReport = {
  overallScore?: number;
  dimensions?: Dimensions;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  improvedAnswers?: Array<{ prompt: string; original: string; improved: string }>;
  drills?: string[];
  focusRecommendations?: Array<{
    topic: string;
    reason: string;
    suggestedAction: string;
    urgencyDays?: number;
  }>;
};

type Props = {
  report: ScorecardReport;
  mode?: "voice" | "text";
  language?: string;
  judgeMode?: string;
  speech?: {
    fillerCount?: number;
    elapsedSec?: number;
    candidateTurns?: number;
  };
  onClose?: () => void;
};

function DimBar({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--background)]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function InterviewScorecard({
  report,
  mode = "text",
  language,
  judgeMode,
  speech,
  onClose,
}: Props) {
  const dims = report.dimensions ?? {};
  const mm =
    speech?.elapsedSec != null
      ? `${String(Math.floor(speech.elapsedSec / 60)).padStart(2, "0")}:${String(
          speech.elapsedSec % 60,
        ).padStart(2, "0")}`
      : null;

  return (
    <section className="space-y-5 rounded-2xl border border-accent/30 bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Scorecard
          </p>
          <h3 className="mt-1 text-2xl text-ink sm:text-3xl">
            {report.overallScore != null ? `${report.overallScore}/10` : "—"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {mode === "voice" ? "Voice" : "Text"} mock
            {judgeMode ? ` · ${judgeMode}` : ""}
            {language
              ? ` · ${language === "hi" ? "Hindi" : language === "mix" ? "Hinglish" : "English"}`
              : ""}
            {mm ? ` · ${mm}` : ""}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-line px-3 py-2 text-sm font-semibold"
          >
            Dismiss
          </button>
        ) : null}
      </div>

      <p className="text-sm text-ink">{report.summary ?? ""}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DimBar label="Content" value={dims.content} />
        <DimBar label="Structure" value={dims.structure} />
        <DimBar label="Communication" value={dims.communication} />
        {mode === "voice" ? <DimBar label="Speech" value={dims.speech} /> : null}
      </div>

      {mode === "voice" && speech ? (
        <p className="text-xs text-muted">
          Fillers ≈ {speech.fillerCount ?? 0}
          {speech.candidateTurns != null ? ` · ${speech.candidateTurns} candidate turns` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-ink">Strengths</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {(report.strengths ?? []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Weaknesses</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {(report.weaknesses ?? []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {(report.improvedAnswers ?? []).length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">Improved answers</p>
          {(report.improvedAnswers ?? []).map((item) => (
            <article key={item.prompt} className="rounded-xl border border-line bg-panel p-3 text-sm">
              <p className="font-medium text-ink">{item.prompt}</p>
              <p className="mt-1 text-muted">You: {item.original}</p>
              <p className="mt-1 text-accent">Try: {item.improved}</p>
            </article>
          ))}
        </div>
      ) : null}

      {(report.focusRecommendations ?? []).length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-ink">What to focus on next</p>
          <ul className="mt-2 space-y-2 text-sm">
            {(report.focusRecommendations ?? []).map((rec) => (
              <li key={rec.topic} className="rounded-xl border border-line bg-panel px-3 py-2">
                <p className="font-medium text-ink">{rec.suggestedAction}</p>
                <p className="mt-0.5 text-muted">
                  {rec.topic}: {rec.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(report.drills ?? []).length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-ink">Drills queued</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {(report.drills ?? []).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
