"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
    const res = await fetch(`/api/workspaces/${workspaceId}`);
    const data = await res.json();
    setDocs(data.documents ?? []);
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [workspaceId]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    body.append("workspaceId", workspaceId);
    const res = await fetch("/api/documents/upload", {
      method: "POST",
      body,
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok && res.status !== 202) {
      setError(data.error ?? "Upload failed");
      return;
    }
    if (data.warning) {
      setMessage(`Uploaded with warning: ${data.warning}`);
    } else {
      setMessage("Uploaded and indexed.");
    }
    setFile(null);
    await load();
  }

  async function retry(docId: string) {
    setError(null);
    const res = await fetch(`/api/documents/${docId}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Retry failed");
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Knowledge library</h2>
        <p className="mt-2 text-sm text-muted">
          Upload official PDFs. Phase 1 extracts text, chunks, embeds, and indexes
          them for grounded mentor answers.
        </p>
      </div>

      <form
        onSubmit={onUpload}
        className="rounded-2xl border border-line bg-panel p-5 space-y-4"
      >
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <button
          type="submit"
          disabled={!file || loading}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Uploading & indexing…" : "Upload PDF"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      </form>

      <section className="space-y-3">
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
                  Pages: {doc.pageCount ?? "—"} · Status: {doc.status}
                </p>
                {doc.errorMessage ? (
                  <p className="mt-1 text-[var(--danger)]">{doc.errorMessage}</p>
                ) : null}
              </div>
              {doc.status === "failed" ? (
                <button
                  onClick={() => void retry(doc.id)}
                  className="rounded-lg border border-line px-3 py-1.5 font-semibold"
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
