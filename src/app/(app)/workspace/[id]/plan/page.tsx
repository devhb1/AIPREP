"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export default function PlanPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/plan?workspaceId=${workspaceId}`);
    const data = await res.json();
    setPlan(data.plan ?? null);
    setTasks(data.tasks ?? []);
    setSubjects(data.subjects ?? []);
    setTopics(data.topics ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

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

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Study plan</h2>
        <p className="mt-2 text-sm text-muted">
          Adaptive plan from syllabus importance and mastery. Weak topics get
          earlier slots.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-5">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Generating…" : plan ? "Regenerate adaptive plan" : "Generate adaptive plan"}
        </button>
        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      {plan ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <h3 className="text-2xl text-ink">{plan.title}</h3>
          <p className="mt-2 text-sm text-muted">{plan.summary}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-xl text-ink">Syllabus</h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted">Generate a plan to create the syllabus.</p>
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
