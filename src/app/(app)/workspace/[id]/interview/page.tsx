"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Session = {
  id: string;
  judgeMode: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  createdAt: string;
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

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; items: ChecklistItem[] } | null>(
    null,
  );
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [judgeMode, setJudgeMode] = useState<"easy" | "normal" | "strict">("normal");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyContent, setStoryContent] = useState("");

  async function loadMeta() {
    const [sRes, cRes, lRes, stRes] = await Promise.all([
      fetch(`/api/interview?workspaceId=${workspaceId}`),
      fetch(`/api/interview?workspaceId=${workspaceId}&view=checklist`),
      fetch(`/api/interview?workspaceId=${workspaceId}&view=library`),
      fetch(`/api/interview?workspaceId=${workspaceId}&view=stories`),
    ]);
    const sData = await sRes.json();
    const cData = await cRes.json();
    const lData = await lRes.json();
    const stData = await stRes.json();
    setSessions(sData.sessions ?? []);
    setChecklist(cData.checklist ?? null);
    setLibrary(lData.library ?? []);
    setStories(stData.stories ?? []);
  }

  useEffect(() => {
    void loadMeta();
  }, [workspaceId]);

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
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Interview coach</h2>
        <p className="mt-2 text-sm text-muted">
          Practice answers in text (fast). After each mock we score you, save
          improved answers, and queue drills. Use voice for spoken practice.
        </p>
      </div>

      <Link
        href={`/workspace/${workspaceId}/interview/live`}
        className="block rounded-2xl border border-accent/40 bg-accent-soft/50 p-4"
      >
        <p className="text-sm font-semibold text-accent">Live voice interview</p>
        <p className="mt-1 text-sm text-muted">
          Talk with the panel on mic → transcript → evaluate. Needs Safari mic
          permission + HTTPS. Tap to open.
        </p>
      </Link>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-xl text-ink">Text mock interview</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Judge mode</span>
          <select
            value={judgeMode}
            onChange={(e) => setJudgeMode(e.target.value as typeof judgeMode)}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 sm:w-auto"
            disabled={Boolean(activeSessionId) || loading}
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="strict">Strict</option>
          </select>
        </label>
        {!activeSessionId ? (
          <button
            onClick={() => void startMock()}
            disabled={loading}
            className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Starting…" : "Start text mock"}
          </button>
        ) : (
          <button
            onClick={() => void endMock()}
            disabled={loading}
            className="min-h-11 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Evaluating…" : "End & evaluate"}
          </button>
        )}
      </section>

      {activeSessionId ? (
        <section className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-line bg-panel p-5">
            {turns.map((turn, idx) => (
              <div
                key={`${turn.id}-${idx}`}
                className={
                  turn.role === "candidate"
                    ? "ml-6 rounded-xl bg-accent-soft px-4 py-3 text-sm"
                    : "mr-6 rounded-xl border border-line bg-white px-4 py-3 text-sm"
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
              className="min-h-24 flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none ring-accent focus:ring-2"
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
        </section>
      ) : null}

      {report ? (
        <section className="rounded-2xl border border-line bg-panel p-5 space-y-3 text-sm">
          <h3 className="text-xl text-ink">Mock report</h3>
          <p className="text-muted">
            Overall score: {String(report.overallScore ?? "—")} / 10
          </p>
          <p className="text-ink">{String(report.summary ?? "")}</p>
          <div>
            <p className="font-semibold">Strengths</p>
            <ul className="list-disc pl-5 text-muted">
              {((report.strengths as string[]) ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">Weaknesses</p>
            <ul className="list-disc pl-5 text-muted">
              {((report.weaknesses as string[]) ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">Drills queued</p>
            <ul className="list-disc pl-5 text-muted">
              {((report.drills as string[]) ?? []).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-5 space-y-3">
        <h3 className="text-xl text-ink">Interview-day checklist</h3>
        {(checklist?.items ?? []).map((item) => (
          <label key={item.id} className="flex items-start gap-3 text-sm">
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
        ))}
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
              className="w-full rounded-xl border border-line px-3 py-2 text-sm"
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
              className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold"
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
          <div
            key={s.id}
            className="rounded-2xl border border-line bg-panel p-4 text-sm flex flex-wrap justify-between gap-2"
          >
            <div>
              <p className="font-medium text-ink">
                {s.judgeMode} · {s.status}
              </p>
              <p className="text-muted">{s.summary ?? "No summary yet"}</p>
            </div>
            <span className="text-accent font-semibold">
              {s.overallScore != null ? `${s.overallScore}/10` : "—"}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
