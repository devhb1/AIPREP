import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatMessages, chatThreads, workspaces } from "@/lib/db/schema";
import { requireUser, ensureProfile } from "@/lib/auth/session";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { chatCompletion } from "@/lib/ai/responses";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `chat:${user.id}`,
    limit: 40,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Chat rate limit exceeded" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { workspaceId, message, threadId } = parsed.data;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let thread =
    threadId
      ? (
          await db
            .select()
            .from(chatThreads)
            .where(
              and(
                eq(chatThreads.id, threadId),
                eq(chatThreads.userId, user.id),
                eq(chatThreads.workspaceId, workspaceId),
              ),
            )
            .limit(1)
        )[0]
      : undefined;

  if (!thread) {
    [thread] = await db
      .insert(chatThreads)
      .values({
        workspaceId,
        userId: user.id,
        title: message.slice(0, 60),
      })
      .returning();
  }

  await db.insert(chatMessages).values({
    threadId: thread.id,
    role: "user",
    content: message,
  });

  const chunks = await retrieveRelevantChunks({
    workspaceId,
    query: message,
    userId: user.id,
    limit: 6,
  });

  const contextBlock =
    chunks.length === 0
      ? "No indexed document excerpts were retrieved. Say that you lack uploaded source evidence for this workspace and ask the user to upload official PDFs."
      : chunks
          .map(
            (c, i) =>
              `[#${i + 1}] ${c.title}${c.pageNumber ? ` p.${c.pageNumber}` : ""}\n${c.content}`,
          )
          .join("\n\n");

  const system = `You are the personal AI mentor inside AIPREP for workspace "${workspace.name}".
Preparation type: ${workspace.preparationType}.
Organization: ${workspace.organization ?? "n/a"}.
Role: ${workspace.role ?? "n/a"}.

Rules:
- Ground answers in the provided SOURCE EXCERPTS when available.
- Never invent official rules, dates, or syllabus items that are not supported by excerpts.
- If evidence is weak or missing, say so clearly using uncertainty language.
- Prefer actionable next steps for KVS PRT interview preparation.
- Include a short "Sources" section referencing [#n] citations when used.`;

  const userPrompt = `USER QUESTION:
${message}

SOURCE EXCERPTS:
${contextBlock}`;

  const result = await chatCompletion({
    system,
    user: userPrompt,
    userId: user.id,
    workspaceId,
    feature: "mentor_chat",
    useCache: false,
  });

  const citations = chunks.map((c, i) => ({
    index: i + 1,
    documentId: c.documentId,
    title: c.title,
    pageNumber: c.pageNumber,
    excerpt: c.content.slice(0, 280),
    distance: c.distance,
  }));

  const [assistantMessage] = await db
    .insert(chatMessages)
    .values({
      threadId: thread.id,
      role: "assistant",
      content: result.content,
      citations,
    })
    .returning();

  return NextResponse.json({
    threadId: thread.id,
    message: assistantMessage,
    citations,
  });
}
