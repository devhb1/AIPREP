import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import {
  ensureKvsSeedWorkspace,
  ensureProfile,
  requireUser,
} from "@/lib/auth/session";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureProfile(user);
  await ensureKvsSeedWorkspace(user.id);

  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, user.id))
    .orderBy(desc(workspaces.createdAt));

  return NextResponse.json({ workspaces: rows });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const preparationType = String(body.preparationType ?? "Other").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId: user.id,
      name,
      preparationType,
      organization: body.organization ?? null,
      role: body.role ?? null,
      interviewDate: body.interviewDate ? new Date(body.interviewDate) : null,
      examDate: body.examDate ? new Date(body.examDate) : null,
      currentStage: body.currentStage ?? null,
      preferredLanguage: body.preferredLanguage ?? "English",
      dailyStudyHours: body.dailyStudyHours ?? null,
      preparationLevel: body.preparationLevel ?? null,
    })
    .returning();

  return NextResponse.json({ workspace });
}
