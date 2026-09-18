"use client";

import { ReactNode, useEffect } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-line bg-panel p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function Chip({
  active,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-[var(--radius-btn)] px-4 text-sm font-semibold disabled:opacity-50 ${
        active
          ? "bg-accent text-white dark:text-[#042f2e]"
          : "border border-line bg-panel text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-white"
      : variant === "danger"
        ? "text-[var(--danger)] border border-line"
        : "border border-line bg-panel text-ink";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-[var(--radius-btn)] px-4 text-sm font-semibold disabled:opacity-60 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function ProgressBar({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-[var(--background)] ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-card)] bg-[var(--background)] ${className}`}
    />
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </div>
  );
}

export function Timeline({
  phases,
}: {
  phases: Array<{
    id: string;
    label: string;
    detail?: string;
    active?: boolean;
  }>;
}) {
  return (
    <ol className="space-y-3">
      {phases.map((phase, i) => (
        <li key={phase.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-1 h-3 w-3 rounded-full ${
                phase.active ? "bg-accent" : "border border-line bg-panel"
              }`}
            />
            {i < phases.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-line" />
            ) : null}
          </div>
          <div className="pb-3">
            <p className="text-sm font-semibold text-ink">{phase.label}</p>
            {phase.detail ? (
              <p className="mt-0.5 text-sm text-muted">{phase.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg rounded-t-[var(--radius-card)] border border-line bg-panel p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-[var(--radius-card)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-2 text-sm font-semibold text-muted"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
