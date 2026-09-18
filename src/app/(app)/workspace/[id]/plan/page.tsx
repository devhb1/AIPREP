"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Topic = {
  id: string;
  name: string;
  importance: number | null;
  subjectId: string;
};
type Subject = { id: string; name: string; description: string | null };
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  taskType: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  priority: string | null;
};
type Plan = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
};

type Intake = {
  daysUntilInterview: number;
  hoursPerDay: number;
  weakAreas: string[];
  strongAreas: string[];
  goals: string;
};

const AREA_OPTIONS = [
  "Child development",
  "Inclusive education",
  "Classroom management",
  "Language pedagogy",
  "EVS",
  "Primary maths",
  "Document checklist",
  "Teaching demo",
];

export default function PlanPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  const [daysUntilInterview, setDaysUntilInterview] = useState(21);
  const [hoursPerDay, setHoursPerDay] = useState(1.5);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [strongAreas, setStrongAreas] = useState<string[]>([]);
  const [goals, setGoals] = useState("Clear KVS PRT interview with calm, example-rich answers");

  async function load() {
    setBooting(true);
    const res = await fetch(`/api/plan?workspaceId=${workspaceId}`);
    const data = await res.json();
    setPlan(data.plan ?? null);
    setTasks(data.tasks ?? []);
    setSubjects(data.subjects ?? []);
    setTopics(data.topics ?? []);
    setIntake(data.intake ?? null);
    if (!data.intake) setShowWizard(true);
    if (data.intake) {
      setDaysUntilInterview(data.intake.daysUntilInterview ?? 21);
      setHoursPerDay(data.intake.hoursPerDay ?? 1.5);
      setWeakAreas(data.intake.weakAreas ?? []);
      setStrongAreas(data.intake.strongAreas ?? []);
      setGoals(data.intake.goals ?? goals);
    }
    setBooting(false);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function submitIntake(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "intake",
        intake: {
          daysUntilInterview,
          hoursPerDay,
          weakAreas,
          strongAreas,
          goals,
        },
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Intake failed");
      return;
    }
    setShowWizard(false);
    await load();
  }

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, action: "generate" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to generate plan");
      return;
    }
    await load();
  }

  const topicsBySubject = useMemo(() => {
    const map = new Map<string, Topic[]>();
    for (const topic of topics) {
      const list = map.get(topic.subjectId) ?? [];
      list.push(topic);
      map.set(topic.subjectId, list);
    }
    return map;
  }, [topics]);

  const wizardSteps = [
    {
      title: "When is your interview?",
      body: (
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Days until interview</span>
          <input
            type="number"
            min={1}
            max={120}
            value={daysUntilInterview}
            onChange={(e) => setDaysUntilInterview(Number(e.target.value))}
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
      ),
    },
    {
      title: "How many hours can you study per day?",
      body: (
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Hours / day</span>
          <input
            type="number"
            min={0.5}
            max={8}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Number(e.target.value))}
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
      ),
    },
    {
      title: "Where do you feel weaker?",
      body: (
        <div className="flex flex-wrap gap-2">
          {AREA_OPTIONS.map((area) => (
            <button
              key={area}
              type="button"
              onClick={() => toggle(weakAreas, area, setWeakAreas)}
              className={`min-h-10 rounded-xl px-3 py-2 text-sm font-semibold ${
                weakAreas.includes(area)
                  ? "bg-accent text-white"
                  : "border border-line bg-white"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Where are you already strong?",
      body: (
        <div className="flex flex-wrap gap-2">
          {AREA_OPTIONS.map((area) => (
            <button
              key={area}
              type="button"
              onClick={() => toggle(strongAreas, area, setStrongAreas)}
              className={`min-h-10 rounded-xl px-3 py-2 text-sm font-semibold ${
                strongAreas.includes(area)
                  ? "bg-accent text-white"
                  : "border border-line bg-white"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "What is your main goal?",
      body: (
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Study plan</h2>
        <p className="mt-2 text-sm text-muted">
          Answer five questions once — we seed mastery and build a personal plan.
        </p>
      </div>

      {booting ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--background)]" />
          ))}
        </div>
      ) : null}

      {showWizard ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < wizardSteps.length - 1) setStep((s) => s + 1);
            else void submitIntake();
          }}
          className="space-y-4 rounded-2xl border border-accent/30 bg-panel p-5 sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Intake · step {step + 1} / {wizardSteps.length}
          </p>
          <h3 className="text-2xl text-ink">{wizardSteps[step]!.title}</h3>
          {wizardSteps[step]!.body}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold"
              >
                Back
              </button>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading
                ? "Building plan…"
                : step < wizardSteps.length - 1
                  ? "Next"
                  : "Create my plan"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setShowWizard(true);
              setStep(0);
            }}
            className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold"
          >
            {intake ? "Update intake" : "Start intake"}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Generating…" : plan ? "Regenerate plan" : "Generate plan"}
          </button>
        </div>
      )}

      {error && !showWizard ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {intake && !showWizard ? (
        <section className="rounded-2xl border border-line bg-panel p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Your intake
          </p>
          <p className="mt-2 text-ink">
            {intake.daysUntilInterview} days · {intake.hoursPerDay}h/day
          </p>
          <p className="mt-1 text-muted">Goal: {intake.goals}</p>
          <p className="mt-1 text-muted">
            Weak: {intake.weakAreas.join(", ") || "—"} · Strong:{" "}
            {intake.strongAreas.join(", ") || "—"}
          </p>
        </section>
      ) : null}

      {plan ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <h3 className="text-2xl text-ink">{plan.title}</h3>
          <p className="mt-2 text-sm text-muted">{plan.summary}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-xl text-ink">Syllabus</h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted">Complete intake to create the syllabus.</p>
        ) : (
          subjects.map((s) => (
            <div key={s.id} className="rounded-2xl border border-line bg-panel p-4 text-sm">
              <p className="font-semibold text-ink">{s.name}</p>
              <p className="text-muted">{s.description}</p>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {(topicsBySubject.get(s.id) ?? []).map((t) => (
                  <li key={t.id}>
                    {t.name}
                    {t.importance != null ? ` · importance ${t.importance}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl text-ink">Tasks</h3>
          <Link href={`/workspace/${workspaceId}/today`} className="text-sm text-accent">
            Today view →
          </Link>
        </div>
        {tasks.slice(0, 12).map((task) => (
          <div key={task.id} className="rounded-2xl border border-line bg-panel p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">{task.title}</p>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                {task.status} · {task.taskType}
              </span>
            </div>
            <p className="mt-1 text-muted">{task.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
