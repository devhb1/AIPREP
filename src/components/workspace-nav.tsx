"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { path: "", label: "Home", match: "exact" as const },
  { path: "memory", label: "Memory" },
  { path: "interview", label: "Interview" },
  { path: "chat", label: "Chat" },
  { path: "research", label: "Research" },
];

export function WorkspaceMobileNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const base = `/workspace/${workspaceId}`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {LINKS.map((link) => {
          const href = link.path ? `${base}/${link.path}` : base;
          const active =
            link.match === "exact"
              ? pathname === base
              : pathname.startsWith(`${base}/${link.path}`);
          return (
            <li key={link.path || "home"} className="flex-1">
              <Link
                href={href}
                className={`flex min-h-14 flex-col items-center justify-center px-1 text-[11px] font-semibold ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function WorkspaceChipNav({ workspaceId }: { workspaceId: string }) {
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
      {chips.map(([path, label]) => (
        <Link
          key={path}
          href={`/workspace/${workspaceId}/${path}`}
          className={
            path === "interview" || path === "memory"
              ? "min-h-11 shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
              : "min-h-11 shrink-0 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold"
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
