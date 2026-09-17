import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, jobs, workspaces } from "@/lib/db/schema";
import { requireUser, ensureProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/cache/ai-cache";
import { rateLimit } from "@/lib/rate-limit";
import { processDocumentJob } from "@/lib/documents/process";

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

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF uploads are supported in Phase 1" }, { status: 400 });
  }

  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Max file size is 15MB in Phase 1" }, { status: 400 });
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const storagePath = `${user.id}/${workspaceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const [doc] = await db
    .insert(documents)
    .values({
      workspaceId,
      userId: user.id,
      title: file.name.replace(/\.pdf$/i, ""),
      fileName: file.name,
      mimeType: file.type,
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

  // Process inline for Phase 1 reliability on free tiers (also queued for retry).
  try {
    await processDocumentJob(job.id);
  } catch (error) {
    return NextResponse.json(
      {
        document: doc,
        job,
        warning:
          error instanceof Error
            ? error.message
            : "Upload saved but processing failed. Retry from documents page.",
      },
      { status: 202 },
    );
  }

  const [fresh] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, doc.id))
    .limit(1);

  return NextResponse.json({ document: fresh, job });
}
