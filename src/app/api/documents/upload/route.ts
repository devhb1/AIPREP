import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, jobs, workspaces } from "@/lib/db/schema";
import { requireUser, ensureProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/cache/ai-cache";
import { rateLimit } from "@/lib/rate-limit";
import { processDocumentJob } from "@/lib/documents/process";

export const maxDuration = 60;

/** Vercel serverless body limit is ~4.5MB; keep multipart under this. */
const MULTIPART_MAX_BYTES = 4 * 1024 * 1024;
const ABSOLUTE_MAX_BYTES = 15 * 1024 * 1024;

function isPdfUpload(file: File, buffer: Buffer) {
  const nameOk = /\.pdf$/i.test(file.name);
  const typeOk =
    !file.type ||
    file.type === "application/pdf" ||
    file.type === "application/octet-stream" ||
    file.type === "application/x-pdf";
  const magicOk = buffer.subarray(0, 5).toString("utf8") === "%PDF-";
  return magicOk || (nameOk && typeOk);
}

async function assertWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);
  return workspace ?? null;
}

async function enqueueProcessJob(params: {
  workspaceId: string;
  userId: string;
  documentId: string;
}) {
  const [job] = await db
    .insert(jobs)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      type: "document.process",
      status: "queued",
      payload: { documentId: params.documentId },
    })
    .returning();

  await enqueueJob("queue:document.process", job.id);

  after(async () => {
    try {
      await processDocumentJob(job.id);
    } catch (error) {
      console.error("document.process failed", job.id, error);
    }
  });

  return job;
}

export async function POST(request: Request) {
  try {
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

    const contentType = request.headers.get("content-type") ?? "";

    // JSON flow: initiate signed upload OR finalize after browser PUT
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      const parsed = z
        .object({
          action: z.enum(["sign", "complete"]),
          workspaceId: z.string().uuid(),
          fileName: z.string().min(1).max(240).optional(),
          byteSize: z.number().int().positive().optional(),
          documentId: z.string().uuid().optional(),
        })
        .safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      if (parsed.data.action === "sign") {
        const fileName = parsed.data.fileName ?? "document.pdf";
        const byteSize = parsed.data.byteSize ?? 0;
        if (!/\.pdf$/i.test(fileName)) {
          return NextResponse.json(
            { error: "Only PDF uploads are supported." },
            { status: 400 },
          );
        }
        if (byteSize > ABSOLUTE_MAX_BYTES) {
          return NextResponse.json({ error: "Max file size is 15MB" }, { status: 400 });
        }

        const storagePath = `${user.id}/${parsed.data.workspaceId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        let admin;
        try {
          admin = createAdminClient();
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Supabase admin credentials are missing",
            },
            { status: 500 },
          );
        }

        const { data: signed, error: signError } = await admin.storage
          .from("documents")
          .createSignedUploadUrl(storagePath);

        if (signError || !signed) {
          return NextResponse.json(
            {
              error: `Could not create upload URL: ${signError?.message ?? "unknown"}. Ensure private bucket "documents" exists.`,
            },
            { status: 500 },
          );
        }

        const [doc] = await db
          .insert(documents)
          .values({
            workspaceId: parsed.data.workspaceId,
            userId: user.id,
            title: fileName.replace(/\.pdf$/i, ""),
            fileName,
            mimeType: "application/pdf",
            storagePath,
            byteSize,
            status: "uploaded",
            category: "uploaded_source",
          })
          .returning();

        return NextResponse.json({
          document: doc,
          signedUrl: signed.signedUrl,
          token: signed.token,
          path: signed.path,
          message: "Upload directly to storage, then call complete.",
        });
      }

      // complete
      if (!parsed.data.documentId) {
        return NextResponse.json({ error: "documentId required" }, { status: 400 });
      }
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, parsed.data.documentId),
            eq(documents.workspaceId, parsed.data.workspaceId),
            eq(documents.userId, user.id),
          ),
        )
        .limit(1);
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

      await db
        .update(documents)
        .set({ status: "queued", updatedAt: new Date(), errorMessage: null })
        .where(eq(documents.id, doc.id));

      const job = await enqueueProcessJob({
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
        documentId: doc.id,
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

    // Multipart flow (small files)
    const form = await request.formData();
    const file = form.get("file");
    const workspaceId = String(form.get("workspaceId") ?? "");

    if (!workspaceId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "workspaceId and file are required" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    if (file.size > ABSOLUTE_MAX_BYTES) {
      return NextResponse.json({ error: "Max file size is 15MB" }, { status: 400 });
    }

    if (file.size > MULTIPART_MAX_BYTES) {
      return NextResponse.json(
        {
          error:
            "File is larger than 4MB. The app will use direct storage upload — refresh and try again.",
          code: "USE_SIGNED_UPLOAD",
        },
        { status: 413 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!isPdfUpload(file, buffer)) {
      return NextResponse.json(
        { error: "Only PDF uploads are supported. On iPhone, export/share as PDF." },
        { status: 400 },
      );
    }

    const workspace = await assertWorkspace(user.id, workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const storagePath = `${user.id}/${workspaceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    let admin;
    try {
      admin = createAdminClient();
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Supabase admin credentials are missing",
        },
        { status: 500 },
      );
    }

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

    const job = await enqueueProcessJob({
      workspaceId,
      userId: user.id,
      documentId: doc.id,
    });

    return NextResponse.json(
      {
        document: doc,
        job,
        message: "Uploaded. Indexing in background — status will update to ready.",
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("documents.upload", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
}
