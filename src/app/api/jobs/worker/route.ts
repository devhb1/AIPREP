import { NextResponse } from "next/server";
import { processQueuedJobs } from "@/lib/jobs/runner";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.JOB_WORKER_SECRET;
  if (!secret) {
    // Allow in development without secret
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const query = new URL(request.url).searchParams.get("secret");
  return bearer === secret || query === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processQueuedJobs(5);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return GET(request);
}
