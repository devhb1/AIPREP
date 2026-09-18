import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  claims,
  documents,
  interviewSessions,
  jobs,
  memoryItems,
  mistakeEvents,
  personalStories,
  questions,
  researchCampaigns,
  sources,
  studyPlans,
  subjects,
  tasks,
  userSkillStates,
  workspaceSettings,
  workspaces,
} from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Wipe prep content for a workspace but keep the workspace + settings shell.
 * Storage objects are removed best-effort.
 */
export async function resetWorkspaceContent(params: {
  workspaceId: string;
  userId: string;
}) {
  const [workspace] = await db
    .select({ id: workspaces.id, userId: workspaces.userId })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, params.workspaceId),
        eq(workspaces.userId, params.userId),
      ),
    )
    .limit(1);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const docs = await db
    .select({ id: documents.id, storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.workspaceId, params.workspaceId));

  await db
    .delete(interviewSessions)
    .where(eq(interviewSessions.workspaceId, params.workspaceId));
  await db
    .delete(mistakeEvents)
    .where(eq(mistakeEvents.workspaceId, params.workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, params.workspaceId));
  await db.delete(studyPlans).where(eq(studyPlans.workspaceId, params.workspaceId));
  await db
    .delete(userSkillStates)
    .where(eq(userSkillStates.workspaceId, params.workspaceId));
  await db.delete(questions).where(eq(questions.workspaceId, params.workspaceId));
  await db.delete(subjects).where(eq(subjects.workspaceId, params.workspaceId));
  await db.delete(memoryItems).where(eq(memoryItems.workspaceId, params.workspaceId));
  await db
    .delete(personalStories)
    .where(eq(personalStories.workspaceId, params.workspaceId));
  await db.delete(claims).where(eq(claims.workspaceId, params.workspaceId));
  await db
    .delete(researchCampaigns)
    .where(eq(researchCampaigns.workspaceId, params.workspaceId));
  await db.delete(sources).where(eq(sources.workspaceId, params.workspaceId));
  await db.delete(jobs).where(eq(jobs.workspaceId, params.workspaceId));
  if (docs.length) {
    await db.delete(documents).where(
      inArray(
        documents.id,
        docs.map((d) => d.id),
      ),
    );
  }

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .limit(1);
  if (settings) {
    const next = { ...(settings.settings ?? {}) };
    delete next.intake;
    await db
      .update(workspaceSettings)
      .set({ settings: next, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, params.workspaceId));
  }

  await db
    .update(workspaces)
    .set({ updatedAt: new Date(), currentStage: "Fresh start" })
    .where(eq(workspaces.id, params.workspaceId));

  try {
    const admin = createAdminClient();
    const paths = docs
      .map((d) => d.storagePath)
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      await admin.storage.from("documents").remove(paths);
    }
  } catch (error) {
    console.error("resetWorkspaceContent storage cleanup", error);
  }

  return { ok: true as const, clearedDocuments: docs.length };
}
