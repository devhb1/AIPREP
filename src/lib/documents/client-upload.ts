/** Shared PDF upload helpers for Documents + Memory. */

export const MULTIPART_MAX_BYTES = 4 * 1024 * 1024;

export async function uploadPdfToWorkspace(params: {
  workspaceId: string;
  file: File;
}) {
  const { workspaceId, file } = params;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new Error("Only PDF uploads are supported. On iPhone, Share → Save as PDF.");
  }

  if (file.size > MULTIPART_MAX_BYTES) {
    return uploadViaSigned(workspaceId, file);
  }

  const body = new FormData();
  body.append("file", file);
  body.append("workspaceId", workspaceId);
  const res = await fetch("/api/documents/upload", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 413 || data.code === "USE_SIGNED_UPLOAD") {
    return uploadViaSigned(workspaceId, file);
  }
  if (!res.ok && res.status !== 202) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Upload failed (${res.status})`,
    );
  }
  return data;
}

async function uploadViaSigned(workspaceId: string, pdf: File) {
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
  const signData = (await signRes.json().catch(() => ({}))) as Record<string, unknown>;
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

  const document = signData.document as { id?: string } | undefined;
  const completeRes = await fetch("/api/documents/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "complete",
      workspaceId,
      documentId: document?.id,
    }),
  });
  const completeData = (await completeRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!completeRes.ok && completeRes.status !== 202) {
    throw new Error(
      typeof completeData.error === "string"
        ? completeData.error
        : "Could not finalize upload",
    );
  }
  return completeData;
}

/** Poll only while jobs are in-flight; backs off and stops when idle. */
export function useBusyPoll(params: {
  enabled: boolean;
  refresh: () => void | Promise<void>;
  intervalMs?: number;
  maxMs?: number;
}) {
  const { enabled, refresh, intervalMs = 2500, maxMs = 90_000 } = params;
  // Imperative helper used from pages via useEffect — kept pure for reuse.
  return { enabled, refresh, intervalMs, maxMs };
}

export function startBusyPoll(params: {
  refresh: () => void | Promise<void>;
  isBusy: () => boolean;
  intervalMs?: number;
  maxMs?: number;
}) {
  const intervalMs = params.intervalMs ?? 2500;
  const maxMs = params.maxMs ?? 90_000;
  const started = Date.now();
  const id = setInterval(() => {
    if (!params.isBusy() || Date.now() - started > maxMs) {
      clearInterval(id);
      return;
    }
    void params.refresh();
  }, intervalMs);
  return () => clearInterval(id);
}
