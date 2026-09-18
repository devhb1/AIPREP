"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  InterviewScorecard,
  type ScorecardReport,
} from "@/components/interview-scorecard";
import { Button, Chip, Skeleton } from "@/components/ui";

type Session = {
  id: string;
  judgeMode: string;
  status: string;
  mode?: string;
  overallScore: number | null;
  summary: string | null;
  createdAt: string;
  speechMetrics?: { language?: string };
};

type Turn = {
  id: string;
  role: string;
  content: string;
  score: number | null;
  feedback: string | null;
};

type ChecklistItem = { id: string; label: string; done: boolean };
type LibraryItem = {
  id: string;
  prompt: string;
  answer: string;
  improvedAnswer: string | null;
};
type Story = { id: string; title: string; content: string };

type InterviewLanguage = "en" | "hi" | "mix";

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; items: ChecklistItem[] } | null>(
    null,
  );
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [judgeMode, setJudgeMode] = useState<"easy" | "normal" | "strict">("normal");
  const [language, setLanguage] = useState<InterviewLanguage>("en");
  const [minutes, setMinutes] = useState(10);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [report, setReport] = useState<ScorecardReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyContent, setStoryContent] = useState("");
  const [showTextMock, setShowTextMock] = useState(false);

  async function loadMeta() {
    setMetaLoading(true);
    try {
      const res = await fetch(`/api/interview?workspaceId=${workspaceId}&view=hub`);
      const data = await res.json().catch(() => ({}));
      setSessions(data.sessions ?? []);
      setChecklist(data.checklist ?? null);
      setLibrary(data.library ?? []);
      setStories(data.stories ?? []);
    } finally {
      setMetaLoading(false);
    }
  }

  useEffect(() => {
    void loadMeta();
  }, [workspaceId]);

  useEffect(() => {
    void fetch(`/api/interview/warmup?workspaceId=${workspaceId}`);
  }, [workspaceId]);

  useEffect(() => {
    const lang = searchParams.get("lang");
    if (lang === "en" || lang === "hi" || lang === "mix") setLanguage(lang);
    const mode = searchParams.get("mode");
    if (mode === "easy" || mode === "normal" || mode === "strict") setJudgeMode(mode);
  }, [searchParams]);

  function startLive() {
    const q = new URLSearchParams({
      lang: language,
      mode: judgeMode,
      consent: "1",
    });
    router.push(`/workspace/${workspaceId}/interview/live?${q.toString()}`);
  }

  async function startMock() {
    setLoading(true);
    setError(null);
    setReport(null);
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, action: "start", judgeMode }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not start interview");
      return;
    }
    setActiveSessionId(data.session.id);
    setTurns([
      {
        id: "open",
        role: "interviewer",
        content: data.openingQuestion,
        score: null,
        feedback: null,
      },
    ]);
    await loadMeta();
  }

  async function sendAnswer(e: FormEvent) {
    e.preventDefault();
    if (!activeSessionId || !answer.trim()) return;
    setLoading(true);
    setError(null);
    const candidateText = answer.trim();
    setAnswer("");
    setTurns((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        role: "candidate",
        content: candidateText,
        score: null,
        feedback: null,
      },
    ]);

    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "answer",
        sessionId: activeSessionId,
        answer: candidateText,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Answer failed");
      return;
    }

    setTurns((prev) => {
      const copy = [...prev];
      const lastCandidate = [...copy].reverse().find((t) => t.role === "candidate");
      if (lastCandidate) {
        lastCandidate.score = data.score;
        lastCandidate.feedback = data.feedback;
      }
      copy.push({
        id: data.interviewerTurn.id,
        role: "interviewer",
        content: data.interviewerTurn.content,
        score: null,
        feedback: null,
      });
      return copy;
    });
  }

  async function endMock() {
    if (!activeSessionId) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "end",
        sessionId: activeSessionId,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not end interview");
      return;
    }
    setReport(data.report ?? null);
    setActiveSessionId(null);
    await loadMeta();
  }

  async function toggleItem(itemId: string) {
    await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "toggle_checklist_item",
        itemId,
      }),
    });
    await loadMeta();
  }

  async function addStory(e: FormEvent) {
    e.preventDefault();
    if (!storyTitle.trim() || !storyContent.trim()) return;
    await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "add_story",
        title: storyTitle.trim(),
        content: storyContent.trim(),
        tags: ["personal"],
      }),
    });
    setStoryTitle("");
    setStoryContent("");
    await loadMeta();
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Interview hub</h2>
        <p className="mt-2 text-sm text-muted">
          {sessions.length === 0
            ? "First panel run — this is the front door of your prep. HR opens, pedagogy probes, GA, then HR closes."
            : "Voice-first mocks in English, Hindi, or Hinglish — then a real scorecard."}
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="surface-card space-y-5 border-accent/40 bg-gradient-to-br from-accent-soft/80 to-panel">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {sessions.length === 0 ? "First panel run" : "Primary"}
          </p>
          <h3 className="mt-2 text-2xl text-ink">
            {sessions.length === 0
              ? "Run your first mock panel interview"
              : "Start mock panel interview"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            HR opens, pedagogy probes, general awareness, HR closes. Speak or type.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Duration
          </p>
          <div className="flex flex-wrap gap-2">
            {[5, 10, 15].map((m) => (
              <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Judge
          </p>
          <div className="flex flex-wrap gap-2">
            {(["easy", "normal", "strict"] as const).map((m) => (
              <Chip key={m} active={judgeMode === m} onClick={() => setJudgeMode(m)}>
                {m}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Language
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["en", "EN"],
                ["hi", "HI"],
                ["mix", "Mix"],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                active={language === value}
                onClick={() => setLanguage(value)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const q = new URLSearchParams({
                lang: language,
                mode: judgeMode,
                mins: String(minutes),
                consent: "1",
              });
              router.push(`/workspace/${workspaceId}/interview/mock?${q.toString()}`);
            }}
          >
            {sessions.length === 0 ? "Start first mock →" : "Start mock panel →"}
          </Button>
          <Button variant="ghost" onClick={() => setShowTextMock(true)}>
            Type instead
          </Button>
        </div>
        <p className="text-xs text-muted">
          Type answers if the mic is unreliable.
          {process.env.NEXT_PUBLIC_ENABLE_REALTIME_VOICE === "true" ? (
            <>
              {" "}
              <button
                type="button"
                onClick={startLive}
                className="font-semibold text-accent underline"
              >
                Open experimental Realtime
              </button>
              .
            </>
          ) : null}
        </p>
      </section>

      {report ? (
        <InterviewScorecard
          report={report}
          mode="text"
          judgeMode={judgeMode}
          workspaceId={workspaceId}
          onClose={() => setReport(null)}
        />
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-5">
        <button
          type="button"
          onClick={() => setShowTextMock((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h3 className="text-lg text-ink">Text mock (secondary)</h3>
            <p className="text-sm text-muted">Silent practice when you cannot use the mic.</p>
          </div>
          <span className="text-accent">{showTextMock ? "Hide" : "Show"}</span>
        </button>

        {showTextMock ? (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            {!activeSessionId ? (
              <button
                onClick={() => void startMock()}
                disabled={loading}
                className="min-h-11 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-60 sm:w-auto"
              >
                {loading ? "Starting…" : "Start text mock"}
              </button>
            ) : (
              <button
                onClick={() => void endMock()}
                disabled={loading}
                className="min-h-11 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-60 sm:w-auto"
              >
                {loading ? "Evaluating…" : "End & scorecard"}
              </button>
            )}

            {activeSessionId ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  {turns.map((turn, idx) => (
                    <div
                      key={`${turn.id}-${idx}`}
                      className={
                        turn.role === "candidate"
                          ? "ml-4 rounded-xl bg-accent-soft px-4 py-3 text-sm sm:ml-6"
                          : "mr-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm sm:mr-6"
                      }
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        {turn.role}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-ink">{turn.content}</p>
                      {turn.feedback ? (
                        <p className="mt-2 text-xs text-muted">
                          Score: {turn.score ?? "—"} · {turn.feedback}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                <form onSubmit={sendAnswer} className="flex flex-col gap-2 sm:flex-row">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={3}
                    placeholder="Answer as you would in the interview…"
                    className="min-h-24 flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-sm"
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !answer.trim()}
                    className="min-h-11 self-stretch rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:self-end"
                  >
                    {loading ? "Thinking…" : "Send"}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5 space-y-3">
        <h3 className="text-xl text-ink">Interview-day checklist</h3>
        {metaLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : (
          (checklist?.items ?? []).map((item) => (
            <label key={item.id} className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => void toggleItem(item.id)}
                className="mt-1"
              />
              <span className={item.done ? "text-muted line-through" : "text-ink"}>
                {item.label}
              </span>
            </label>
          ))
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-panel p-5 space-y-3">
          <h3 className="text-xl text-ink">Answer library</h3>
          {library.length === 0 ? (
            <p className="text-sm text-muted">Improved answers appear after mocks.</p>
          ) : (
            library.slice(0, 5).map((item) => (
              <article key={item.id} className="border-b border-line pb-3 text-sm last:border-0">
                <p className="font-medium text-ink">{item.prompt}</p>
                <p className="mt-1 text-muted">You: {item.answer}</p>
                {item.improvedAnswer ? (
                  <p className="mt-1 text-accent">Improved: {item.improvedAnswer}</p>
                ) : null}
              </article>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5 space-y-3">
          <h3 className="text-xl text-ink">Personal stories</h3>
          <form onSubmit={addStory} className="space-y-2">
            <input
              value={storyTitle}
              onChange={(e) => setStoryTitle(e.target.value)}
              placeholder="Story title"
              className="min-h-11 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <textarea
              value={storyContent}
              onChange={(e) => setStoryContent(e.target.value)}
              placeholder="A classroom / teaching story you can reuse"
              rows={3}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-line px-3 py-2 text-sm font-semibold"
            >
              Save story
            </button>
          </form>
          {stories.map((story) => (
            <article key={story.id} className="border-t border-line pt-3 text-sm">
              <p className="font-medium text-ink">{story.title}</p>
              <p className="text-muted">{story.content}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl text-ink">Past sessions</h3>
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/workspace/${workspaceId}/interview/scorecard?sessionId=${s.id}`}
            className="flex flex-wrap justify-between gap-2 rounded-2xl border border-line bg-panel p-4 text-sm"
          >
            <div>
              <p className="font-medium text-ink">
                {s.mode === "voice" ? "Voice" : "Text"} · {s.judgeMode} · {s.status}
                {s.speechMetrics?.language
                  ? ` · ${s.speechMetrics.language}`
                  : ""}
              </p>
              <p className="text-muted">{s.summary ?? "No summary yet"}</p>
            </div>
            <span className="font-semibold text-accent">
              {s.overallScore != null ? `${s.overallScore}/10` : "—"}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
