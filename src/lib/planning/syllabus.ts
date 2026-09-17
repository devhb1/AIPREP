import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  documentChunks,
  documents,
  memoryItems,
  subjects,
  topics,
  workspaces,
} from "@/lib/db/schema";
import { chatCompletion } from "@/lib/ai/responses";
import { MODELS } from "@/lib/ai/models";

const syllabusSchema = z.object({
  subjects: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      weight: z.number().optional(),
      topics: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          importance: z.number().optional(),
        }),
      ),
    }),
  ),
});

const KVS_FALLBACK: z.infer<typeof syllabusSchema> = {
  subjects: [
    {
      name: "Child Development & Pedagogy",
      description: "Core PRT interview pedagogy themes",
      weight: 1.2,
      topics: [
        { name: "Child development stages", importance: 0.9 },
        { name: "Inclusive education", importance: 0.8 },
        { name: "Learning theories", importance: 0.85 },
        { name: "Classroom management", importance: 0.8 },
      ],
    },
    {
      name: "Subject Knowledge",
      description: "Language, EVS, Maths fundamentals for PRT",
      weight: 1,
      topics: [
        { name: "Language teaching methods", importance: 0.75 },
        { name: "EVS concepts", importance: 0.7 },
        { name: "Primary maths pedagogy", importance: 0.75 },
      ],
    },
    {
      name: "Interview & Documents",
      description: "Process awareness and logistics",
      weight: 0.9,
      topics: [
        { name: "Document checklist", importance: 0.95 },
        { name: "Interview etiquette", importance: 0.7 },
        { name: "Teaching demo readiness", importance: 0.85 },
      ],
    },
  ],
};

export async function generateSyllabus(params: {
  workspaceId: string;
  userId: string;
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const existingSubjects = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, params.workspaceId));
  if (existingSubjects.length > 0) {
    const existingTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.workspaceId, params.workspaceId));
    return { subjects: existingSubjects, topics: existingTopics, reused: true };
  }

  const trusted = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.workspaceId, params.workspaceId),
        eq(memoryItems.namespace, "trusted"),
        eq(memoryItems.status, "USER_APPROVED"),
      ),
    )
    .limit(30);

  const readyDocs = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.workspaceId, params.workspaceId), eq(documents.status, "ready")),
    )
    .limit(5);

  let docSnippets = "";
  for (const doc of readyDocs.slice(0, 3)) {
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, doc.id))
      .limit(4);
    docSnippets += `\n# ${doc.title}\n${chunks.map((c) => c.content).join("\n")}`;
  }

  const evidence = [
    trusted.map((m) => m.content).join("\n"),
    docSnippets,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);

  let parsed = KVS_FALLBACK;
  if (evidence.trim()) {
    const result = await chatCompletion({
      model: MODELS.fast,
      system: `Build a compact KVS PRT interview syllabus from evidence only.
Return STRICT JSON:
{"subjects":[{"name":"...","description":"...","weight":1,"topics":[{"name":"...","description":"...","importance":0.8}]}]}
Rules: do not invent official syllabus items absent from evidence; if evidence is thin, stick to broadly known PRT interview themes and mark descriptions cautiously.`,
      user: `Workspace: ${workspace.name}\n\nEVIDENCE:\n${evidence || "None"}`,
      userId: params.userId,
      workspaceId: params.workspaceId,
      feature: "syllabus_generate",
      useCache: false,
      temperature: 0,
    });
    try {
      const match = result.content.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : "{}");
      const safe = syllabusSchema.safeParse(json);
      if (safe.success && safe.data.subjects.length) parsed = safe.data;
    } catch {
      // fallback
    }
  }

  const createdSubjects = [];
  const createdTopics = [];
  for (const subject of parsed.subjects) {
    const [row] = await db
      .insert(subjects)
      .values({
        workspaceId: params.workspaceId,
        name: subject.name,
        description: subject.description ?? null,
        weight: subject.weight ?? 1,
      })
      .returning();
    createdSubjects.push(row);
    for (const topic of subject.topics) {
      const [t] = await db
        .insert(topics)
        .values({
          workspaceId: params.workspaceId,
          subjectId: row.id,
          name: topic.name,
          description: topic.description ?? null,
          importance: topic.importance ?? 0.5,
        })
        .returning();
      createdTopics.push(t);
    }
  }

  return { subjects: createdSubjects, topics: createdTopics, reused: false };
}

export async function listSyllabus(workspaceId: string) {
  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, workspaceId))
    .orderBy(desc(subjects.weight));
  const topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.workspaceId, workspaceId))
    .orderBy(desc(topics.importance));
  return { subjects: subjectRows, topics: topicRows };
}
