import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsageEvents, documents, workspaces } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { daysUntil } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.userId, user.id)))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, id))
    .orderBy(desc(documents.createdAt));

  const usage = await db
    .select()
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.workspaceId, id))
    .orderBy(desc(aiUsageEvents.createdAt))
    .limit(50);

  const readyDocs = docs.filter((d) => d.status === "ready").length;
  const pendingDocs = docs.filter((d) =>
    ["uploaded", "processing", "queued"].includes(d.status),
  ).length;
  const days = daysUntil(workspace.interviewDate ?? workspace.examDate);

  const nextBestAction =
    readyDocs === 0
      ? {
          title: "Upload your official notification / syllabus PDF",
          why: "The mentor can only ground answers in documents you provide in Phase 1.",
          priority: "HIGH",
          estimatedMinutes: 10,
        }
      : pendingDocs > 0
        ? {
            title: "Wait for document processing to finish",
            why: `${pendingDocs} document(s) are still being indexed for retrieval.`,
            priority: "MEDIUM",
            estimatedMinutes: 5,
          }
        : {
            title: "Ask the mentor what to prepare first for your interview",
            why: "Your documents are indexed. Start with a grounded briefing on priorities.",
            priority: "HIGH",
            estimatedMinutes: 15,
          };

  const todaySpend = usage
    .filter((u) => {
      const created = new Date(u.createdAt);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return created >= start;
    })
    .reduce((sum, u) => sum + (u.estimatedCostUsd ?? 0), 0);

  return NextResponse.json({
    workspace,
    documents: docs,
    nextBestAction,
    stats: {
      daysRemaining: days,
      documentCount: docs.length,
      readyDocuments: readyDocs,
      pendingDocuments: pendingDocs,
      todaySpendUsd: Number(todaySpend.toFixed(4)),
    },
  });
}
