import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, jobs, workspaces } from "@/lib/db/schema";
import { requireUser, ensureProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/cache/ai-cache";
import { rateLimit } from "@/lib/rate-limit";
import { processDocumentJob } from "@/lib/documents/process";

export const maxDuration = 60;

function isPdfUpload(file: File, buffer: Buffer) {
  const nameOk = /\.pdf$/i.test(file.name);
  const typeOk =
    !file.type ||
    file.type === "application/pdf" ||
    file.type === "application/octet-stream" ||
    file.type === "application/x-pdf";
  const magicOk = buffer.subarray(0, 5).toString("utf8") === "%PDF-";
  return (nameOk && typeOk) || magicOk;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `upload:${user.id}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Upload rate limit exceeded" }, { status: 429 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const workspaceId = String(form.get("workspaceId") ?? "");

  if (!workspaceId || !(file instanceof File)) {
    return NextResponse.json(
      { error: "workspaceId and file are required" },
      { status: 400 },
    );
  }

  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Max file size is 15MB" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!isPdfUpload(file, buffer)) {
    return NextResponse.json(
      { error: "Only PDF uploads are supported. On iPhone, export/share as PDF." },
      { status: 400 },
    );
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const storagePath = `${user.id}/${workspaceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        error: `Storage upload failed: ${uploadError.message}. Ensure private bucket "documents" exists.`,
      },
      { status: 500 },
    );
  }

  const [doc] = await db
    .insert(documents)
    .values({
      workspaceId,
      userId: user.id,
      title: file.name.replace(/\.pdf$/i, ""),
      fileName: file.name,
      mimeType: "application/pdf",
      storagePath,
      byteSize: file.size,
      status: "queued",
      category: "uploaded_source",
    })
    .returning();

  const [job] = await db
    .insert(jobs)
    .values({
      workspaceId,
      userId: user.id,
      type: "document.process",
      status: "queued",
      payload: { documentId: doc.id },
    })
    .returning();

  await enqueueJob("queue:document.process", job.id);

  // Return fast; index in background so iPhone/Vercel don't hang on embeds.
  after(async () => {
    try {
      await processDocumentJob(job.id);
    } catch (error) {
      console.error("document.process failed", job.id, error);
    }
  });

  return NextResponse.json(
    {
      document: doc,
      job,
      message: "Uploaded. Indexing in background — status will update to ready.",
    },
    { status: 202 },
  );
}
