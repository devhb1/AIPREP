import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  mistakeEvents,
  questionAttempts,
  questionOptions,
  questions,
  tasks,
  topics,
  userSkillStates,
} from "@/lib/db/schema";
import { chatCompletion } from "@/lib/ai/responses";
import { MODELS } from "@/lib/ai/models";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { generateSyllabus } from "@/lib/planning/syllabus";

const quizSchema = z.object({
  questions: z.array(
    z.object({
      prompt: z.string(),
      explanation: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      groundingNote: z.string().optional(),
      options: z.array(
        z.object({
          label: z.string(),
          content: z.string(),
          isCorrect: z.boolean(),
        }),
      ),
    }),
  ),
});

export async function generatePracticeSet(params: {
  workspaceId: string;
  userId: string;
  topicId?: string;
  count?: number;
}) {
  await generateSyllabus(params);
  const topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.workspaceId, params.workspaceId));
  const topic =
    (params.topicId
      ? topicRows.find((t) => t.id === params.topicId)
      : null) ?? topicRows[0];
  if (!topic) throw new Error("No topics available. Generate syllabus/plan first.");

  const chunks = await retrieveRelevantChunks({
    workspaceId: params.workspaceId,
    query: `${topic.name} ${topic.description ?? ""}`,
    userId: params.userId,
    limit: 6,
  });

  const evidence =
    chunks.map((c, i) => `[#${i + 1}] ${c.content}`).join("\n\n") ||
    `Topic: ${topic.name}. Create cautious PRT interview practice items and mark grounding as weak.`;

  const result = await chatCompletion({
    model: MODELS.fast,
    system: `Create MCQ practice questions grounded in evidence.
Return STRICT JSON:
{"questions":[{"prompt":"...","explanation":"...","difficulty":"medium","groundingNote":"...","options":[{"label":"A","content":"...","isCorrect":true},{"label":"B","content":"...","isCorrect":false},{"label":"C","content":"...","isCorrect":false},{"label":"D","content":"...","isCorrect":false}]}]}
Rules:
- Exactly one correct option per question.
- Do not invent official facts absent from evidence.
- If evidence is weak, ask conceptual pedagogy questions and say so in groundingNote.`,
    user: `Topic: ${topic.name}\nCount: ${params.count ?? 3}\n\nEVIDENCE:\n${evidence.slice(0, 10000)}`,
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "quiz_generate",
    useCache: false,
    temperature: 0.2,
  });

  let parsed = quizSchema.safeParse({ questions: [] });
  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    parsed = quizSchema.safeParse(JSON.parse(match ? match[0] : "{}"));
  } catch {
    // ignore
  }
  if (!parsed.success || !parsed.data.questions.length) {
    throw new Error("Could not generate grounded questions. Add documents/memory and retry.");
  }

  const created = [];
  for (const q of parsed.data.questions.slice(0, params.count ?? 3)) {
    const correctCount = q.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1 || q.options.length < 2) continue;
    const [question] = await db
      .insert(questions)
      .values({
        workspaceId: params.workspaceId,
        topicId: topic.id,
        subjectId: topic.subjectId,
        prompt: q.prompt,
        questionType: "mcq",
        difficulty: q.difficulty ?? "medium",
        explanation: q.explanation ?? null,
        sourceKind: chunks.length ? "grounded_generated" : "weak_grounding",
        groundingNote: q.groundingNote ?? null,
      })
      .returning();

    const options = await db
      .insert(questionOptions)
      .values(
        q.options.map((o) => ({
          questionId: question.id,
          label: o.label,
          content: o.content,
          isCorrect: o.isCorrect,
        })),
      )
      .returning();

    created.push({ ...question, options });
  }

  return { topic, questions: created };
}

export async function listPracticeQuestions(workspaceId: string) {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.workspaceId, workspaceId))
    .orderBy(desc(questions.createdAt))
    .limit(30);

  const withOptions = await Promise.all(
    rows.map(async (q) => {
      const options = await db
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionId, q.id));
      return { ...q, options };
    }),
  );
  return withOptions;
}

export async function submitAttempt(params: {
  workspaceId: string;
  userId: string;
  questionId: string;
  selectedOptionId: string;
}) {
  const [question] = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.id, params.questionId),
        eq(questions.workspaceId, params.workspaceId),
      ),
    )
    .limit(1);
  if (!question) throw new Error("Question not found");

  const options = await db
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, question.id));
  const selected = options.find((o) => o.id === params.selectedOptionId);
  if (!selected) throw new Error("Option not found");

  const isCorrect = Boolean(selected.isCorrect);
  const [attempt] = await db
    .insert(questionAttempts)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      questionId: question.id,
      selectedOptionId: selected.id,
      isCorrect,
    })
    .returning();

  if (question.topicId) {
    const existing = await db
      .select()
      .from(userSkillStates)
      .where(
        and(
          eq(userSkillStates.workspaceId, params.workspaceId),
          eq(userSkillStates.userId, params.userId),
          eq(userSkillStates.topicId, question.topicId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const attempts = existing[0].attempts + 1;
      const correct = existing[0].correct + (isCorrect ? 1 : 0);
      const mastery = Math.max(0.05, Math.min(0.95, correct / attempts));
      await db
        .update(userSkillStates)
        .set({
          attempts,
          correct,
          mastery,
          lastPracticedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userSkillStates.id, existing[0].id));
    } else {
      await db.insert(userSkillStates).values({
        workspaceId: params.workspaceId,
        userId: params.userId,
        topicId: question.topicId,
        subjectId: question.subjectId,
        attempts: 1,
        correct: isCorrect ? 1 : 0,
        mastery: isCorrect ? 0.4 : 0.15,
        lastPracticedAt: new Date(),
      });
    }
  }

  let remediationTaskId: string | null = null;
  if (!isCorrect) {
    const [remediation] = await db
      .insert(tasks)
      .values({
        workspaceId: params.workspaceId,
        topicId: question.topicId,
        title: `Remediate: ${question.prompt.slice(0, 80)}`,
        description:
          question.explanation ??
          "Review the explanation and retry a related practice set.",
        taskType: "remediation",
        status: "pending",
        priority: "high",
        estimatedMinutes: 15,
        dueDate: new Date(),
      })
      .returning();
    remediationTaskId = remediation.id;

    await db.insert(mistakeEvents).values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      questionId: question.id,
      topicId: question.topicId,
      note: `Incorrect option ${selected.label}: ${selected.content}`,
      remediationTaskId,
    });
  }

  return {
    attempt,
    isCorrect,
    explanation: question.explanation,
    correctOption: options.find((o) => o.isCorrect) ?? null,
    remediationTaskId,
  };
}

export async function listMistakes(workspaceId: string) {
  return db
    .select()
    .from(mistakeEvents)
    .where(eq(mistakeEvents.workspaceId, workspaceId))
    .orderBy(desc(mistakeEvents.createdAt))
    .limit(50);
}
