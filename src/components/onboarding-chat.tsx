"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PdfPickButton } from "@/components/pdf-pick-button";
import { uploadPdfToWorkspace } from "@/lib/documents/client-upload";
import { DEFAULT_ONBOARDING_AREAS } from "@/lib/planning/areas";

type Bubble = { role: "mentor" | "you"; text: string };

type PlanSummary = {
  plan?: { title?: string; summary?: string | null };
  tasks?: Array<{ id: string; title: string; dueDate: string | null }>;
};

const HOUR_CHIPS = [0.5, 1, 1.5, 2, 3, 4];
const DAY_CHIPS = [3, 4, 5, 6, 7];

const PROMPTS = [
  "What's your name, and where are you in the KVS PRT process right now?",
  "When's your interview, if you know the date? If not, roughly when do you expect it?",
  "How many days a week can you realistically study, and how many hours on a typical day?",
  "Which subjects or areas feel strong for you already?",
  "Which feel weak or unfamiliar?",
  "Anything else going on — a job, exams, travel — that affects your available time?",
  "Do you have any documents already — the official notification, notes, previous papers?",
];

export function OnboardingChat({
  workspaceId,
  areaOptions,
  onDone,
}: {
  workspaceId: string;
  areaOptions?: string[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const areas = areaOptions?.length ? areaOptions : DEFAULT_ONBOARDING_AREAS;
  const [step, setStep] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    {
      role: "mentor",
      text: "I'm your AIPREP mentor. A few short questions and I'll build a plan you can actually follow.",
    },
    { role: "mentor", text: PROMPTS[0]! },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [hoursPerDay, setHoursPerDay] = useState(1.5);
  const [strongAreas, setStrongAreas] = useState<string[]>([]);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<PlanSummary | null>(null);

  const canSkipRest = step >= 3 && !plan;

  function push(role: Bubble["role"], next: string) {
    setBubbles((prev) => [...prev, { role, text: next }]);
  }

  async function post(body: Record<string, unknown>): Promise<Record<string, any>> {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...body }),
    });
    const raw = await res.text();
    let data: Record<string, unknown> = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error(raw.slice(0, 180) || `Bad response (${res.status})`);
      }
    }
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Could not save that step",
      );
    }
    return data as Record<string, any>;
  }

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function finish(patch: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const data = (await post({
        action: "onboarding_finish",
        patch,
      })) as PlanSummary;
      setPlan(data);
      const nextTasks = (data.tasks ?? [])
        .slice(0, 7)
        .map((t) => `• ${t.title}`)
        .join("\n");
      push(
        "mentor",
        `Here's your plan${data.plan?.title ? ` — ${data.plan.title}` : ""}.\n${data.plan?.summary ?? ""}\n\nNext 7:\n${nextTasks || "Open Home for your next action."}`,
      );
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build plan");
    } finally {
      setBusy(false);
    }
  }

  async function advance(userText: string, patch: Record<string, unknown>) {
    push("you", userText);
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "intake_partial",
        patch: { ...patch, onboardingStep: step + 1 },
      });
      const next = step + 1;
      setStep(next);
      if (next < PROMPTS.length) {
        push("mentor", PROMPTS[next]!);
      } else {
        await finish(patch);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
      setText("");
    }
  }

  async function submitIntro(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (value.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      let extracted: {
        extracted?: {
          candidateName?: string;
          currentStage?: string;
          daysUntilInterview?: number;
        };
      } = {};
      try {
        extracted = (await post({
          action: "onboarding_extract",
          extractStep: "intro",
          text: value,
        })) as typeof extracted;
      } catch {
        extracted = {};
      }
      const daysMatch = value.match(/(\d{1,3})\s*(?:day|days)\b/i);
      const name = extracted.extracted?.candidateName;
      const stage = extracted.extracted?.currentStage;
      await advance(value, {
        candidateName: name ?? undefined,
        currentStage: stage ?? value.slice(0, 120),
        daysUntilInterview:
          extracted.extracted?.daysUntilInterview ??
          (daysMatch ? Number(daysMatch[1]) : undefined),
        goals: "Clear KVS PRT interview with calm, example-rich answers",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that");
      setBusy(false);
    }
  }

  async function submitDate(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    setBusy(true);
    setError(null);
    try {
      let daysUntilInterview = 21;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const target = new Date(`${value}T12:00:00`);
        daysUntilInterview = Math.max(
          1,
          Math.min(Math.ceil((target.getTime() - Date.now()) / 86400000), 120),
        );
      } else if (value) {
        const extracted = await post({
          action: "onboarding_extract",
          extractStep: "date",
          text: value,
        });
        if (typeof extracted.extracted?.daysUntilInterview === "number") {
          daysUntilInterview = extracted.extracted.daysUntilInterview;
        }
      }
      await advance(value || "I don't know yet — plan for about 3 weeks", {
        daysUntilInterview,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that date");
      setBusy(false);
    }
  }

  async function submitConstraints(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    let constraintsNote = value || undefined;
    if (value) {
      setBusy(true);
      try {
        const extracted = await post({
          action: "onboarding_extract",
          extractStep: "constraints",
          text: value,
        });
        if (typeof extracted.extracted?.constraintsNote === "string") {
          constraintsNote = extracted.extracted.constraintsNote;
        }
      } catch {
        constraintsNote = value;
      }
    }
    await advance(value || "Nothing extra — study time is as I said", {
      constraintsNote,
    });
  }

  async function submitPdf(e: FormEvent) {
    e.preventDefault();
    if (file) {
      setBusy(true);
      setError(null);
      try {
        await uploadPdfToWorkspace({ workspaceId, file });
        push("you", `Uploaded ${file.name}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setBusy(false);
        return;
      }
    } else {
      push("you", "I'll add documents later");
    }
    await finish({});
  }

  const composer = useMemo(() => {
    if (plan) return null;
    if (step === 0) {
      return (
        <form onSubmit={submitIntro} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Ananya, written exam done, waiting for interview"
            className="min-h-11 flex-1 rounded-xl border border-line px-3 py-2 text-sm"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || text.trim().length < 2}
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Send
          </button>
        </form>
      );
    }
    if (step === 1) {
      return (
        <form onSubmit={submitDate} className="space-y-2">
          <input
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""}
            onChange={(e) => setText(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2 text-sm"
            disabled={busy}
          />
          <input
            value={/^\d{4}-\d{2}-\d{2}$/.test(text) ? "" : text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or type: next month / not scheduled"
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2 text-sm"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Continue
          </button>
        </form>
      );
    }
    if (step === 2) {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {DAY_CHIPS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDaysPerWeek(n)}
                className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${
                  daysPerWeek === n ? "bg-accent text-white" : "border border-line bg-white"
                }`}
              >
                {n} days
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {HOUR_CHIPS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setHoursPerDay(n)}
                className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${
                  hoursPerDay === n ? "bg-accent text-white" : "border border-line bg-white"
                }`}
              >
                {n}h
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void advance(`${daysPerWeek} days / ${hoursPerDay}h`, {
                daysPerWeek,
                hoursPerDay,
              })
            }
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save time
          </button>
        </div>
      );
    }
    if (step === 3 || step === 4) {
      const selected = step === 3 ? strongAreas : weakAreas;
      const setter = step === 3 ? setStrongAreas : setWeakAreas;
      const options = step === 4 ? areas.filter((a) => !strongAreas.includes(a)) : areas;
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {options.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => toggle(selected, area, setter)}
                className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${
                  selected.includes(area)
                    ? "bg-accent text-white"
                    : "border border-line bg-white"
                }`}
              >
                {area}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void advance(
                selected.join(", ") || "Not sure yet",
                step === 3 ? { strongAreas: selected } : { weakAreas: selected },
              )
            }
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      );
    }
    if (step === 5) {
      return (
        <form onSubmit={submitConstraints} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Optional — job, travel, other exams"
            className="min-h-11 flex-1 rounded-xl border border-line px-3 py-2 text-sm"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {text.trim() ? "Send" : "Skip"}
          </button>
        </form>
      );
    }
    if (step === 6) {
      return (
        <form onSubmit={submitPdf} className="space-y-3">
          <PdfPickButton file={file} onFile={setFile} disabled={busy} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {file ? "Upload & build plan" : "Skip & build plan"}
            </button>
          </div>
        </form>
      );
    }
    return null;
  }, [
    plan,
    step,
    text,
    busy,
    daysPerWeek,
    hoursPerDay,
    strongAreas,
    weakAreas,
    areas,
    file,
  ]);

  return (
    <section className="rounded-2xl border border-accent/30 bg-panel p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
        Mentor onboarding
      </p>
      <div className="mt-4 space-y-3">
        {bubbles.map((bubble, index) => (
          <div
            key={`${bubble.role}-${index}`}
            className={
              bubble.role === "you"
                ? "ml-6 rounded-2xl bg-accent-soft px-4 py-3 text-sm"
                : "mr-6 rounded-2xl border border-line bg-white px-4 py-3 text-sm"
            }
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {bubble.role === "you" ? "You" : "Mentor"}
            </p>
            <p className="whitespace-pre-wrap text-ink">{bubble.text}</p>
          </div>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-4">{composer}</div>
      {canSkipRest ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void finish({ daysPerWeek, hoursPerDay, strongAreas, weakAreas })}
          className="mt-3 text-sm font-semibold text-accent disabled:opacity-60"
        >
          Skip the rest and build my plan
        </button>
      ) : null}
      {plan ? (
        <a
          href={`/workspace/${workspaceId}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white"
        >
          Go to Home
        </a>
      ) : null}
    </section>
  );
}
