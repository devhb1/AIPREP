import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getWorkspaceBootstrap } from "@/lib/workspaces/bootstrap";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await getWorkspaceBootstrap({ workspaceId: id, userId: user.id });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
