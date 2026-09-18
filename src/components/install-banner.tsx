"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "aiprep.install.dismissed";

function isStandalone() {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(nav.standalone)
  );
}

function isIos() {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function InstallHomeScreenBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (isStandalone()) return;
      if (!isIos()) return;
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setShow(true);
    } catch {
      setShow(isIos() && !isStandalone());
    }
  }, []);

  if (!show) return null;

  return (
    <div className="install-nudge mb-4 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-ink">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-accent">Add AIPREP to your Home Screen</p>
          <p className="mt-1 text-muted">
            {isIos()
              ? "Safari → Share → Add to Home Screen. Opens as a mini app (full screen, no browser chrome)."
              : "Use your browser Install / Add to Home Screen for a faster app-like launch."}
          </p>
        </div>
        <button
          type="button"
          className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-semibold text-muted"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              // ignore
            }
            setShow(false);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
