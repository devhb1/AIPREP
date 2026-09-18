"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  MULTIPART_MAX_BYTES,
  uploadPdfToWorkspace,
} from "@/lib/documents/client-upload";

type Doc = {
  id: string;
  title: string;
  fileName: string;
  status: string;
  pageCount: number | null;
  errorMessage: string | null;
};

export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/documents?workspaceId=${workspaceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not load documents",
        );
        return;
      }
      setDocs(data.documents ?? []);
      setError(null);
    } catch {
      setError("Network error loading documents");
    }
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  useEffect(() => {
    const busy = docs.some(
      (d) => d.status === "queued" || d.status === "processing" || d.status === "uploaded",
    );
    if (!busy) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 90_000) {
        clearInterval(id);
        return;
      }
      void load();
    }, 2500);
    return () => clearInterval(id);
  }, [
    workspaceId,
    docs.some(
      (d) => d.status === "queued" || d.status === "processing" || d.status === "uploaded",
    ),
  ]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await uploadPdfToWorkspace({ workspaceId, file });
      setMessage(
        typeof data.message === "string"
          ? data.message
          : "Uploaded. Indexing in background — watch status below.",
      );
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload network error — try Wi‑Fi");
    } finally {
      setLoading(false);
    }
  }

  async function retry(docId: string) {
    setError(null);
    const res = await fetch(`/api/documents/${docId}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Retry failed");
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}/memory?tab=documents`} className="text-sm text-accent">
          ← Memory
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Documents</h2>
        <p className="mt-2 text-sm text-muted">
          Upload official PDFs for Memory + mentor grounding. Files over 4MB use
          direct storage upload. On iPhone: Files → Share as PDF.
        </p>
      </div>

      <form
        onSubmit={onUpload}
        className="space-y-4 rounded-2xl border border-line bg-panel p-5"
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        {file ? (
          <p className="text-xs text-muted">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
            {file.size > MULTIPART_MAX_BYTES ? " · direct upload" : ""}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!file || loading}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Uploading…" : "Upload PDF"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      </form>

      <section className="space-y-3">
        {docs.length === 0 ? (
          <p className="text-sm text-muted">No documents yet.</p>
        ) : null}
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="rounded-2xl border border-line bg-panel p-4 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-medium text-ink">{doc.title}</p>
                <p className="text-muted">{doc.fileName}</p>
                <p className="mt-1 text-muted">
                  Pages: {doc.pageCount ?? "—"} · Status:{" "}
                  <span className="font-semibold text-ink">{doc.status}</span>
                </p>
                {doc.status === "queued" || doc.status === "processing" ? (
                  <p className="mt-1 text-xs text-accent">
                    Indexing under the hood (extract → chunk → embed)…
                  </p>
                ) : null}
                {doc.errorMessage ? (
                  <p className="mt-1 text-[var(--danger)]">{doc.errorMessage}</p>
                ) : null}
              </div>
              {doc.status === "failed" ? (
                <button
                  onClick={() => void retry(doc.id)}
                  className="min-h-11 rounded-lg border border-line px-3 py-2 font-semibold"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
