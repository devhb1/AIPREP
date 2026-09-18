"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const WORKSPACE_NAV = [
  { path: "", label: "Home", match: "exact" as const },
  { path: "learn", label: "Learn", match: "prefix" as const },
  { path: "memory", label: "Memory", match: "prefix" as const },
  { path: "interview", label: "Interview", match: "prefix" as const },
  { path: "plan", label: "Plan", match: "prefix" as const },
] as const;

function useNavPath() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready ? pathname : "";
}

function isActive(
  pathname: string,
  base: string,
  link: (typeof WORKSPACE_NAV)[number],
) {
  if (link.match === "exact") return pathname === base;
  return pathname.startsWith(`${base}/${link.path}`);
}

export function WorkspaceMobileNav({ workspaceId }: { workspaceId: string }) {
  const pathname = useNavPath();
  const base = `/workspace/${workspaceId}`;

  return (
    <nav className="workspace-nav-mobile fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {WORKSPACE_NAV.map((link) => {
          const href = link.path ? `${base}/${link.path}` : base;
          const active = isActive(pathname, base, link);
          return (
            <li key={link.path || "home"} className="flex-1">
              <Link
                href={href}
                prefetch
                className={`flex min-h-14 flex-col items-center justify-center px-1 text-[11px] font-semibold duration-150 active:bg-accent-soft active:text-accent ${
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

export function WorkspaceRail({ workspaceId }: { workspaceId: string }) {
  const pathname = useNavPath();
  const base = `/workspace/${workspaceId}`;

  return (
    <nav className="workspace-rail hidden lg:block">
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        Workspace
      </p>
      <ul className="space-y-1">
        {WORKSPACE_NAV.map((link) => {
          const href = link.path ? `${base}/${link.path}` : base;
          const active = isActive(pathname, base, link);
          return (
            <li key={link.path || "home"}>
              <Link
                href={href}
                prefetch
                className={`block min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  active
                    ? "bg-accent text-white"
                    : "text-ink hover:bg-accent-soft"
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

/** @deprecated chips replaced by 5-item rail + bottom nav */
export function WorkspaceChipNav({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceRail workspaceId={workspaceId} />;
}
