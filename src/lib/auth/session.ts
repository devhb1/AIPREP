import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, workspaceSettings, workspaces } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  return user;
}

export async function ensureProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email ?? "unknown@local",
      fullName:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null,
    })
    .returning();

  return created;
}

export async function ensureKvsSeedWorkspace(userId: string) {
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId));

  const seed = existing.find((w) => w.isSeed || w.name.includes("KVS PRT"));
  if (seed) return seed;

  const interviewDate = new Date("2026-06-15T09:00:00+05:30");

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId,
      name: "KVS PRT Interview 2026",
      preparationType: "Teaching Interview",
      organization: "Kendriya Vidyalaya Sangathan",
      role: "PRT",
      interviewDate,
      currentStage: "Interview preparation",
      location: "India",
      timezone: "Asia/Kolkata",
      preferredLanguage: "English / Hindi",
      dailyStudyHours: 2,
      preparationLevel: "Intermediate",
      isSeed: true,
    })
    .returning();

  await db.insert(workspaceSettings).values({
    workspaceId: workspace.id,
    maxDailyAiSpendUsd: 1.5,
    maxResearchQueries: 20,
    settings: {
      seedLabel: "KVS PRT Interview 2026",
      focus: ["pedagogy", "child development", "subject knowledge", "interview documents"],
      maxDailyVoiceSpendUsd: 0.5,
    },
  });

  return workspace;
}
