import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  claims,
  documents,
  interviewAnswersLibrary,
  interviewSessions,
  memoryItems,
  personalStories,
  tasks,
  workspaces,
} from "@/lib/db/schema";

export async function exportWorkspaceBundle(params: {
  workspaceId: string;
  userId: string;
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(eq(workspaces.id, params.workspaceId), eq(workspaces.userId, params.userId)),
    )
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const [
    docs,
    memory,
    claimRows,
    taskRows,
    sessions,
    library,
    stories,
  ] = await Promise.all([
    db.select().from(documents).where(eq(documents.workspaceId, params.workspaceId)),
    db.select().from(memoryItems).where(eq(memoryItems.workspaceId, params.workspaceId)),
    db.select().from(claims).where(eq(claims.workspaceId, params.workspaceId)),
    db.select().from(tasks).where(eq(tasks.workspaceId, params.workspaceId)),
    db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.workspaceId, params.workspaceId))
      .orderBy(desc(interviewSessions.createdAt)),
    db
      .select()
      .from(interviewAnswersLibrary)
      .where(eq(interviewAnswersLibrary.workspaceId, params.workspaceId)),
    db
      .select()
      .from(personalStories)
      .where(eq(personalStories.workspaceId, params.workspaceId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    workspace,
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      status: d.status,
      pageCount: d.pageCount,
      createdAt: d.createdAt,
    })),
    memory,
    claims: claimRows,
    tasks: taskRows,
    interviewSessions: sessions.map((s) => ({
      id: s.id,
      mode: s.mode,
      judgeMode: s.judgeMode,
      status: s.status,
      overallScore: s.overallScore,
      summary: s.summary,
      speechMetrics: s.speechMetrics,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    })),
    answerLibrary: library,
    stories,
  };
}

export async function buildTasksIcs(params: {
  workspaceId: string;
  userId: string;
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(eq(workspaces.id, params.workspaceId), eq(workspaces.userId, params.userId)),
    )
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, params.workspaceId), eq(tasks.status, "pending")))
    .orderBy(asc(tasks.dueDate));

  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AIPREP//Preparation Tasks//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const task of taskRows) {
    if (!task.dueDate) continue;
    const dt = new Date(task.dueDate);
    const stamp = dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const end = new Date(dt.getTime() + (task.estimatedMinutes ?? 25) * 60_000);
    const endStamp = end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@aiprep`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${stamp}`,
      `DTEND:${endStamp}`,
      `SUMMARY:${escape(task.title)}`,
      `DESCRIPTION:${escape(task.description ?? workspace.name)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
