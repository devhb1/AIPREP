import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { assertWithinDailyBudget } from "@/lib/analytics/usage";
import { runQuickSearch } from "@/lib/memory/quick-search";

export const maxDuration = 60;

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().min(8).max(400),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "workspaceId and a question are required" }, { status: 400 });
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, parsed.data.workspaceId),
        eq(workspaces.userId, user.id),
      ),
    )
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertWithinDailyBudget({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
    });
    const result = await runQuickSearch({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
      query: parsed.data.query,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quick search failed";
    const status = /cap reached/i.test(message) ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
