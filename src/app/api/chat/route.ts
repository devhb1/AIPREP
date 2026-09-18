import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatMessages, chatThreads, workspaces } from "@/lib/db/schema";
import { requireUser, ensureProfile } from "@/lib/auth/session";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { streamChatCompletion } from "@/lib/ai/responses";
import { rateLimit } from "@/lib/rate-limit";
import { assertWithinDailyBudget } from "@/lib/analytics/usage";
import { mentorSystem } from "@prompts";

export const maxDuration = 60;

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `chat:${user.id}`,
    limit: 40,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return new Response(JSON.stringify({ error: "Chat rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { workspaceId, message, threadId } = parsed.data;

  try {
    await assertWithinDailyBudget({
      workspaceId,
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Budget exceeded",
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) {
    return new Response(JSON.stringify({ error: "Workspace not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send("started", { threadId: thread!.id });

        const chunks = await retrieveRelevantChunks({
          workspaceId,
          query: message,
          userId: user.id,
          limit: 8,
        });

        const contextBlock =
          chunks.length === 0
            ? "No trusted memory, indexed documents, or AIPREP Knowledge Base excerpts were retrieved. Say that evidence is missing and ask the user to upload PDFs and/or approve research claims."
            : chunks
                .map((c, i) => {
                  const origin =
                    c.kind === "kb"
                      ? "AIPREP Knowledge Base (admin-verified, not user-approved)"
                      : c.kind === "memory"
                        ? "Your Verified Notes"
                        : `Your Documents · ${c.title}${c.pageNumber ? ` p.${c.pageNumber}` : ""}`;
                  return `[#${i + 1}] (${c.kind}) ${origin}\n${c.content}`;
                })
                .join("\n\n");

        const system = mentorSystem(workspace.name, {
          preparationType: workspace.preparationType,
          organization: workspace.organization,
          role: workspace.role,
        });

        const userPrompt = `USER QUESTION:
${message}

SOURCE EXCERPTS:
${contextBlock}`;

        const citations = chunks.map((c, i) => ({
          index: i + 1,
          kind: c.kind,
          sourceLabel:
            c.kind === "kb"
              ? "AIPREP Knowledge Base"
              : c.kind === "memory"
                ? "Your Verified Notes"
                : "Your Documents",
          documentId: c.documentId,
          memoryId: c.memoryId ?? null,
          kbItemId: c.kbItemId ?? null,
          title: c.title,
          pageNumber: c.pageNumber,
          excerpt: c.content.slice(0, 280),
          distance: c.distance,
        }));

        send("meta", { threadId: thread!.id, citations });
        let full = "";
        await streamChatCompletion({
          system,
          user: userPrompt,
          userId: user.id,
          workspaceId,
          feature: "mentor_chat",
          onToken: (token) => {
            full += token;
            send("token", { token });
          },
        });

        const [assistantMessage] = await db
          .insert(chatMessages)
          .values({
            threadId: thread!.id,
            role: "assistant",
            content: full.trim(),
            citations,
          })
          .returning();

        send("done", {
          threadId: thread!.id,
          message: assistantMessage,
          citations,
        });
      } catch (error) {
        send("error", {
          error: error instanceof Error ? error.message : "Chat failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
