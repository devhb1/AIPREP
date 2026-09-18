"use client";

import { useRef, useState } from "react";
import { MULTIPART_MAX_BYTES } from "@/lib/documents/client-upload";

type Props = {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
};

export function PdfPickButton({ file, onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function takeFiles(list: FileList | null) {
    const next = list?.[0] ?? null;
    onFile(next);
  }

  return (
    <div className="space-y-2">
      <div
        className={`relative flex min-h-28 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
          dragging
            ? "border-accent bg-accent-soft"
            : "border-line bg-white hover:border-accent/50 hover:bg-accent-soft/40"
        } ${disabled ? "opacity-60" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          takeFiles(e.dataTransfer.files);
        }}
      >
        {/* Full-area file input — reliable on desktop + iOS Safari (label/htmlFor alone often fails). */}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={disabled}
          aria-label="Choose PDF file"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(e) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="pointer-events-none relative z-0 text-sm font-semibold text-ink">
          {file ? "Change PDF" : "Tap to choose a PDF"}
        </span>
        <span className="pointer-events-none relative z-0 mt-1 text-xs text-muted">
          Or drop a file here · up to 15MB · iPhone: Files → Share as PDF
        </span>
      </div>
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm">
          <p className="text-ink">
            {file.name}{" "}
            <span className="text-muted">
              · {(file.size / (1024 * 1024)).toFixed(2)} MB
              {file.size > MULTIPART_MAX_BYTES ? " · direct upload" : ""}
            </span>
          </p>
          <button
            type="button"
            className="relative z-20 min-h-10 rounded-lg px-2 text-xs font-semibold text-muted"
            onClick={() => {
              onFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
