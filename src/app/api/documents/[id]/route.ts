import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, jobs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { processDocumentJob } from "@/lib/documents/process";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function POST(_request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job] = await db
    .insert(jobs)
    .values({
      workspaceId: doc.workspaceId,
      userId: user.id,
      type: "document.process",
      status: "queued",
      payload: { documentId: doc.id },
    })
    .returning();

  try {
    await processDocumentJob(job.id);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Processing failed",
        jobId: job.id,
      },
      { status: 500 },
    );
  }

  const [fresh] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return NextResponse.json({ document: fresh, jobId: job.id });
}
