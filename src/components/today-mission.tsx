"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

export function TodayMission({ workspaceId }: { workspaceId: string }) {
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
    return tasks
      .filter((t) => {
        if (t.status !== "pending" || !t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= start && d < end;
      })
      .slice(0, 5);
  }, [tasks]);

  async function complete(taskId: string) {
    const snapshot = tasks;
    setBusyId(taskId);
    setError(null);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: "completed" } : t)),
    );
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, action: "complete_task", taskId }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setTasks(snapshot);
      setError(data.error ?? "Could not complete task");
      return;
    }
    await load();
  }

  return (
    <section className="space-y-3">
      <h3 className="text-lg text-ink">Today&apos;s mission</h3>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {todays.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
          No tasks due today.{" "}
          <Link className="font-semibold text-accent" href={`/workspace/${workspaceId}/plan`}>
            Open your plan
          </Link>
          .
        </p>
      ) : (
        todays.map((task) => (
          <div
            key={task.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-panel p-4 text-sm"
          >
            <div>
              <p className="font-medium text-ink">{task.title}</p>
              {task.description ? (
                <p className="mt-0.5 text-muted">{task.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                ~{task.estimatedMinutes ?? 25} min
                {task.taskType ? ` · ${task.taskType}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {task.taskType === "quiz" ? (
                <Link
                  href={`/workspace/${workspaceId}/learn/practice`}
                  className="min-h-10 rounded-xl border border-line px-3 py-2 font-semibold"
                >
                  Practice
                </Link>
              ) : null}
              <button
                type="button"
                disabled={busyId === task.id}
                onClick={() => void complete(task.id)}
                className="min-h-10 rounded-xl bg-accent px-3 py-2 font-semibold text-white disabled:opacity-60"
              >
                Done
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
