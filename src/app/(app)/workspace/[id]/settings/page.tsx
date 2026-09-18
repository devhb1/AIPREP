"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Usage = {
  todaySpendUsd: number;
  todayCalls: number;
  weekSpendUsd: number;
  weekCalls: number;
  todayVoiceSpendUsd?: number;
  todayVoiceCalls?: number;
  maxDailyAiSpendUsd: number;
  maxDailyVoiceSpendUsd?: number;
  unlimitedBeta?: boolean;
  accountTokens?: number;
  accountTokenCap?: number | null;
  byFeature: Array<{ feature: string; totalUsd: number; calls: number }>;
};

type Settings = {
  maxDailyAiSpendUsd: number | null;
  maxResearchQueries: number | null;
  settings?: { maxDailyVoiceSpendUsd?: number };
};

type Notification = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dailyCap, setDailyCap] = useState("1.5");
  const [voiceCap, setVoiceCap] = useState("0.5");
  const [researchCap, setResearchCap] = useState("20");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  async function load() {
    const [mainRes, notifRes] = await Promise.all([
      fetch(`/api/settings?workspaceId=${workspaceId}`),
      fetch(`/api/settings?workspaceId=${workspaceId}&view=notifications`),
    ]);
    const main = await mainRes.json();
    const notif = await notifRes.json();
    setUsage(main.usage ?? null);
    setSettings(main.settings ?? null);
    setDailyCap(String(main.settings?.maxDailyAiSpendUsd ?? 1));
    setVoiceCap(
      String(
        main.usage?.maxDailyVoiceSpendUsd ??
          main.settings?.settings?.maxDailyVoiceSpendUsd ??
          0.5,
      ),
    );
    setResearchCap(String(main.settings?.maxResearchQueries ?? 20));
    setNotifications(notif.notifications ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "update_settings",
        maxDailyAiSpendUsd: Number(dailyCap),
        maxDailyVoiceSpendUsd: Number(voiceCap),
        maxResearchQueries: Number(researchCap),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to save settings");
      return;
    }
    setMessage("Settings saved.");
    setSettings(data.settings);
    await load();
  }

  async function downloadExport() {
    const res = await fetch(`/api/settings?workspaceId=${workspaceId}&view=export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aiprep-export-${workspaceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function resetWorkspace() {
    setError(null);
    setMessage(null);
    setResetting(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action: "reset_workspace",
          confirmText: resetConfirm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Reset failed");
        return;
      }
      setMessage(data.message ?? "Workspace reset.");
      setResetConfirm("");
    } catch {
      setError("Network error during reset");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Settings & costs</h2>
        <p className="mt-2 text-sm text-muted">
          Daily AI + separate voice budgets, usage dashboard, exports.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}

      {usage?.unlimitedBeta ? (
        <section className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft p-4 text-sm">
          <p className="font-semibold text-accent">Beta unlimited account</p>
          <p className="mt-1 text-muted">
            Daily $ caps are skipped. Allotment{" "}
            {(usage.accountTokens ?? 0).toLocaleString()} /{" "}
            {(usage.accountTokenCap ?? 10_000_000).toLocaleString()} tokens.
          </p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          ["Today AI $", usage ? usage.todaySpendUsd.toFixed(4) : "—"],
          ["Today voice $", usage ? (usage.todayVoiceSpendUsd ?? 0).toFixed(4) : "—"],
          ["Week $", usage ? usage.weekSpendUsd.toFixed(4) : "—"],
          ["AI cap $", usage ? String(usage.maxDailyAiSpendUsd) : "—"],
          ["Voice cap $", usage ? String(usage.maxDailyVoiceSpendUsd ?? 0.5) : "—"],
          ["Today calls", usage ? String(usage.todayCalls) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="mt-2 text-xl text-ink sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-xl text-ink">Spend by feature (7d)</h3>
        <div className="mt-3 space-y-2 text-sm">
          {(usage?.byFeature ?? []).length === 0 ? (
            <p className="text-muted">No AI usage yet.</p>
          ) : (
            usage?.byFeature.map((row) => (
              <div key={row.feature} className="flex justify-between border-b border-line pb-2">
                <span>{row.feature}</span>
                <span className="text-muted">
                  ${row.totalUsd.toFixed(4)} · {row.calls} calls
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <form
        onSubmit={saveSettings}
        className="space-y-4 rounded-2xl border border-line bg-panel p-5"
      >
        <h3 className="text-xl text-ink">Budget controls</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Max daily AI spend (USD)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Max daily voice spend (USD)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={voiceCap}
            onChange={(e) => setVoiceCap(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Max research queries setting</span>
          <input
            type="number"
            min={1}
            step={1}
            value={researchCap}
            onChange={(e) => setResearchCap(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Save settings
        </button>
      </form>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-xl text-ink">Exports</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void downloadExport()}
            className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold"
          >
            Download JSON export
          </button>
          <a
            href={`/api/settings?workspaceId=${workspaceId}&view=calendar`}
            className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold"
          >
            Download tasks calendar (.ics)
          </a>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--danger)]/30 bg-panel p-5">
        <h3 className="text-xl text-ink">Reset workspace</h3>
        <p className="text-sm text-muted">
          Clears research claims, memory, PDFs, plans, tasks, interviews, and stories
          for this workspace. Keeps your login. Type <span className="font-semibold">RESET</span>{" "}
          to confirm.
        </p>
        <input
          value={resetConfirm}
          onChange={(e) => setResetConfirm(e.target.value)}
          placeholder="Type RESET"
          className="min-h-11 w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={resetting || resetConfirm.trim().toUpperCase() !== "RESET"}
          onClick={() => void resetWorkspace()}
          className="min-h-11 rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Wipe prep data"}
        </button>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-xl text-ink">Add to Home Screen</h3>
        <p className="text-sm text-muted">
          On iPhone Safari: Share → Add to Home Screen. AIPREP opens as a full-screen
          mini app.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-xl text-ink">Notifications</h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <article key={n.id} className="border-b border-line pb-3 text-sm last:border-0">
              <p className="font-medium text-ink">{n.title}</p>
              <p className="text-muted">{n.body}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
