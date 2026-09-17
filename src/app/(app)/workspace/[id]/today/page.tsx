"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

export default function TodayPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/plan?workspaceId=${workspaceId}`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  const todays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return tasks.filter((t) => {
      if (t.status !== "pending" || !t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d >= start && d < end;
    });
  }, [tasks]);

  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "pending")
        .filter((t) => !todays.some((x) => x.id === t.id))
        .slice(0, 8),
    [tasks, todays],
  );

  async function complete(taskId: string) {
    setBusyId(taskId);
    setError(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, action: "complete_task", taskId }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Could not complete task");
      return;
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Today</h2>
        <p className="mt-2 text-sm text-muted">
          Complete today&apos;s mission tasks. Quiz tasks open Practice.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="space-y-3">
        <h3 className="text-xl text-ink">Due today</h3>
        {todays.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No tasks due today.{" "}
            <Link className="text-accent" href={`/workspace/${workspaceId}/plan`}>
              Generate or open your plan
            </Link>
            .
          </p>
        ) : (
          todays.map((task) => (
            <div key={task.id} className="rounded-2xl border border-line bg-panel p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-medium text-ink">{task.title}</p>
                  <p className="text-muted">{task.description}</p>
                  <p className="mt-1 text-xs text-muted">
                    {task.priority} · ~{task.estimatedMinutes ?? 25} min · {task.taskType}
                  </p>
                </div>
                <div className="flex gap-2">
                  {task.taskType === "quiz" ? (
                    <Link
                      href={`/workspace/${workspaceId}/practice`}
                      className="rounded-lg border border-line px-3 py-1.5 font-semibold"
                    >
                      Practice
                    </Link>
                  ) : null}
                  <button
                    disabled={busyId === task.id}
                    onClick={() => void complete(task.id)}
                    className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white disabled:opacity-60"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xl text-ink">Up next</h3>
        {upcoming.map((task) => (
          <div key={task.id} className="rounded-2xl border border-line bg-panel p-4 text-sm">
            <p className="font-medium text-ink">{task.title}</p>
            <p className="text-muted">
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Unscheduled"} ·{" "}
              {task.taskType}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
