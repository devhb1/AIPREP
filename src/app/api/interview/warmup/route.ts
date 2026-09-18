import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

/** Cheap ping so the first mock turn does not pay isolate + DB cold start. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.execute(sql`select 1`);

  return NextResponse.json({ ok: true, warmed: true });
}
