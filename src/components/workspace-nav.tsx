"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const PRIMARY = [
  { path: "", label: "Home", match: "exact" as const },
  { path: "memory", label: "Memory", match: "prefix" as const },
  { path: "plan", label: "Plan", match: "prefix" as const },
  { path: "interview", label: "Interview", match: "prefix" as const },
] as const;

const MORE_LINKS = [
  ["documents", "Documents"],
  ["research", "Research"],
  ["today", "Today"],
  ["practice", "Practice"],
  ["chat", "Mentor chat"],
  ["settings", "Settings"],
] as const;

export function WorkspaceMobileNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const base = `/workspace/${workspaceId}`;
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_LINKS.some(([path]) =>
    pathname.startsWith(`${base}/${path}`),
  );

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}
      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg rounded-t-2xl border border-line bg-panel p-3 shadow-lg lg:hidden">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            More
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {MORE_LINKS.map(([path, label]) => (
              <li key={path}>
                <Link
                  href={`${base}/${path}`}
                  onClick={() => setMoreOpen(false)}
                  className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold ${
                    pathname.startsWith(`${base}/${path}`)
                      ? "bg-accent text-white"
                      : "border border-line bg-white text-ink"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
          {PRIMARY.map((link) => {
            const href = link.path ? `${base}/${link.path}` : base;
            const active =
              link.match === "exact"
                ? pathname === base
                : pathname.startsWith(`${base}/${link.path}`);
            return (
              <li key={link.path || "home"} className="flex-1">
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex min-h-14 flex-col items-center justify-center px-1 text-[11px] font-semibold ${
                    active ? "text-accent" : "text-muted"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex min-h-14 w-full flex-col items-center justify-center px-1 text-[11px] font-semibold ${
                moreOpen || moreActive ? "text-accent" : "text-muted"
              }`}
            >
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

export function WorkspaceChipNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const base = `/workspace/${workspaceId}`;
  const chips = [
    ["memory", "Memory"],
    ["documents", "Documents"],
    ["research", "Research"],
    ["plan", "Plan"],
    ["today", "Today"],
    ["practice", "Practice"],
    ["interview", "Interview"],
    ["settings", "Settings"],
    ["chat", "Mentor chat"],
  ] as const;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map(([path, label]) => {
        const href = `${base}/${path}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={path}
            href={href}
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
