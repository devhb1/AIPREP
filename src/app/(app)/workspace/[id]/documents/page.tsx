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

const MULTIPART_MAX = 4 * 1024 * 1024;

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
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [workspaceId]);

  async function uploadViaSigned(pdf: File) {
    const signRes = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sign",
        workspaceId,
        fileName: pdf.name,
        byteSize: pdf.size,
      }),
    });
    const signData = await signRes.json().catch(() => ({}));
    if (!signRes.ok) {
      throw new Error(
        typeof signData.error === "string"
          ? signData.error
          : "Could not start direct upload",
      );
    }

    const put = await fetch(signData.signedUrl as string, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        ...(signData.token ? { "x-upsert": "false" } : {}),
      },
      body: pdf,
    });
    if (!put.ok) {
      const text = await put.text().catch(() => "");
      throw new Error(text.slice(0, 180) || `Direct storage upload failed (${put.status})`);
    }

    const completeRes = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        workspaceId,
        documentId: signData.document?.id,
      }),
    });
    const completeData = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok && completeRes.status !== 202) {
      throw new Error(
        typeof completeData.error === "string"
          ? completeData.error
          : "Could not finalize upload",
      );
    }
    return completeData;
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setError("Only PDF uploads are supported. On iPhone, Share → Save as PDF.");
        return;
      }

      let data: Record<string, unknown>;
      if (file.size > MULTIPART_MAX) {
        data = await uploadViaSigned(file);
      } else {
        const body = new FormData();
        body.append("file", file);
        body.append("workspaceId", workspaceId);
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body,
        });
        data = await res.json().catch(() => ({}));
        if (res.status === 413 || data.code === "USE_SIGNED_UPLOAD") {
          data = await uploadViaSigned(file);
        } else if (!res.ok && res.status !== 202) {
          throw new Error(
            typeof data.error === "string" ? data.error : `Upload failed (${res.status})`,
          );
        }
      }

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
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
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
            {file.size > MULTIPART_MAX ? " · direct upload" : ""}
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
