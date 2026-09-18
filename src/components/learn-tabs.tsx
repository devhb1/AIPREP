"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "Mentor"],
  ["practice", "Practice"],
  ["mistakes", "Mistakes"],
] as const;

export function LearnTabs({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const base = `/workspace/${workspaceId}/learn`;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {TABS.map(([path, label]) => {
        const href = path ? `${base}/${path}` : base;
        const active = path
          ? pathname.startsWith(`${base}/${path}`)
          : pathname === base;
        return (
          <Link
            key={label}
            href={href}
            prefetch
            className={
              active
                ? "min-h-11 shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
                : "min-h-11 shrink-0 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold"
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
