import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { claims, claimSources, sources } from "@/lib/db/schema";
import { chatCompletion } from "@/lib/ai/responses";
import { webResearch } from "@/lib/ai/web-search";
import { MODELS } from "@/lib/ai/models";
import { claimExtractionSystem } from "@prompts";
import { cacheGet, cacheSet, cacheKey, hashContent } from "@/lib/cache/ai-cache";
import { rateLimit } from "@/lib/rate-limit";

const QUICK_SEARCH_DAILY_CAP = 8;

const claimSchema = z.object({
  claims: z.array(
    z.object({
      statement: z.string().min(8),
      topic: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      assessment: z.string().optional(),
      sourceUrls: z.array(z.string()).optional(),
      conflictNote: z.string().optional(),
    }),
  ),
});

type CachedQuickSearch = {
  text: string;
  hits: Array<{ title: string; url: string; snippet: string; publisher?: string }>;
  extracted: z.infer<typeof claimSchema>["claims"];
};

function normalizeQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function runQuickSearch(params: {
  workspaceId: string;
  userId: string;
  query: string;
}) {
  const query = params.query.trim();
  if (query.length < 8) {
    throw new Error("Ask a fuller question (at least 8 characters).");
  }

  const cacheId = cacheKey([
    "ai",
    "quick_search",
    "v1",
    hashContent(normalizeQuery(query)),
  ]);
  const cached = await cacheGet<CachedQuickSearch>(cacheId);

  if (!cached) {
    const cap = await rateLimit({
      key: `quicksearch:${params.workspaceId}:${new Date().toISOString().slice(0, 10)}`,
      limit: QUICK_SEARCH_DAILY_CAP,
      windowSeconds: 60 * 60 * 26,
    });
    if (!cap.allowed) {
      throw new Error(
        `Quick-search daily cap reached (${QUICK_SEARCH_DAILY_CAP}). Use a research campaign or try tomorrow.`,
      );
    }
  }

  const research =
    cached ??
    (await (async () => {
      const result = await webResearch({
        query: `${query} KVS PRT interview official India`,
        userId: params.userId,
        workspaceId: params.workspaceId,
        feature: "quick_search_web",
      });

      const extraction = await chatCompletion({
        model: MODELS.fast,
        system: claimExtractionSystem,
        user: `User question: ${query}

Extract 1–3 atomic candidate claims only. Prefer official process/eligibility/document/interview facts. Never invent rules.

RESEARCH NOTES:
${result.text.slice(0, 8000)}

SOURCE URLS:
${result.hits.map((h) => h.url).join("\n")}`,
        userId: params.userId,
        workspaceId: params.workspaceId,
        feature: "quick_search_extract",
        useCache: false,
        temperature: 0,
        maxTokens: 700,
      });

      let extracted: CachedQuickSearch["extracted"] = [];
      try {
        const match = extraction.content.match(/\{[\s\S]*\}/);
        const parsed = claimSchema.safeParse(
          JSON.parse(match ? match[0] : '{"claims":[]}'),
        );
        extracted = parsed.success ? parsed.data.claims.slice(0, 3) : [];
      } catch {
        extracted = [];
      }

      const payload: CachedQuickSearch = {
        text: result.text,
        hits: result.hits,
        extracted,
      };
      await cacheSet(cacheId, payload, 60 * 60 * 24);
      return payload;
    })());

  const urlToSourceId = new Map<string, string>();
  for (const hit of research.hits.slice(0, 6)) {
    if (!hit.url) continue;
    const [source] = await db
      .insert(sources)
      .values({
        workspaceId: params.workspaceId,
        url: hit.url,
        title: hit.title,
        publisher: hit.publisher,
        sourceType: "web",
        snippet: hit.snippet,
        qualityScore:
          hit.url.includes("gov.in") || hit.url.includes("kvs") ? 0.9 : 0.6,
        metadata: { via: "quick_search" },
      })
      .returning();
    urlToSourceId.set(hit.url, source.id);
  }

  if (research.hits.length === 0 && research.text) {
    const [source] = await db
      .insert(sources)
      .values({
        workspaceId: params.workspaceId,
        title: `Quick search: ${query.slice(0, 80)}`,
        sourceType: "ai_web_research",
        snippet: research.text.slice(0, 500),
        rawContent: research.text,
        qualityScore: 0.4,
        metadata: { via: "quick_search" },
      })
      .returning();
    urlToSourceId.set("note", source.id);
  }

  const created = [];
  for (const claim of research.extracted) {
    const existing = await db
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.workspaceId, params.workspaceId),
          eq(claims.statement, claim.statement),
        ),
      )
      .limit(1);
    if (existing[0]) {
      created.push({
        id: existing[0].id,
        statement: claim.statement,
        topic: claim.topic ?? "Quick search",
        confidence: claim.confidence ?? 0.5,
        assessment: claim.assessment ?? "Needs user review",
        status: "CANDIDATE",
      });
      continue;
    }

    const [row] = await db
      .insert(claims)
      .values({
        workspaceId: params.workspaceId,
        statement: claim.statement,
        status: "CANDIDATE",
        confidence: claim.confidence ?? 0.5,
        assessment: claim.assessment ?? "Needs user review",
        topic: claim.topic ?? "Quick search",
        conflictNote: claim.conflictNote ?? null,
        metadata: { via: "quick_search", sourceUrls: claim.sourceUrls ?? [] },
      })
      .returning();

    for (const url of claim.sourceUrls ?? []) {
      const sourceId = urlToSourceId.get(url);
      if (!sourceId) continue;
      await db.insert(claimSources).values({
        claimId: row.id,
        sourceId,
        supportLevel: "supporting",
        excerpt: claim.statement.slice(0, 240),
      });
    }

    if ((claim.sourceUrls ?? []).length === 0) {
      const firstSourceId = [...urlToSourceId.values()][0];
      if (firstSourceId) {
        await db.insert(claimSources).values({
          claimId: row.id,
          sourceId: firstSourceId,
          supportLevel: "mentioned",
          excerpt: claim.statement.slice(0, 240),
        });
      }
    }

    created.push({
      id: row.id,
      statement: row.statement,
      topic: row.topic,
      confidence: row.confidence,
      assessment: row.assessment,
      status: row.status,
    });
  }

  return {
    synthesizedAnswer: research.text.slice(0, 900),
    claims: created,
    hits: research.hits.slice(0, 4),
    cached: Boolean(cached),
  };
}
