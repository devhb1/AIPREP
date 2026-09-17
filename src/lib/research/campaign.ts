import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  claimConflicts,
  claimSources,
  claims,
  researchCampaigns,
  researchQueries,
  researchResults,
  sources,
  workspaces,
} from "@/lib/db/schema";
import { chatCompletion } from "@/lib/ai/responses";
import { webResearch } from "@/lib/ai/web-search";
import { MODELS } from "@/lib/ai/models";
import { claimExtractionSystem } from "@prompts";

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

export function buildKvsResearchQueries(topic: string) {
  return [
    {
      cluster: "official",
      query: `${topic} official notification selection process documents required site:gov.in OR site:kvsangathan.nic.in`,
    },
    {
      cluster: "official",
      query: `Kendriya Vidyalaya Sangathan PRT interview guidelines eligibility syllabus official`,
    },
    {
      cluster: "historical",
      query: `KVS PRT interview previous year experience panel questions duration`,
    },
    {
      cluster: "pyq",
      query: `KVS PRT interview memory based questions child development pedagogy`,
    },
    {
      cluster: "interview",
      query: `KVS PRT interview questions teaching demo document checklist`,
    },
    {
      cluster: "panel",
      query: `KVS PRT interview panel public process what to expect candidates experiences`,
    },
  ];
}

export async function runResearchCampaign(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(researchCampaigns)
    .where(eq(researchCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error("Campaign not found");

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, campaign.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  await db
    .update(researchCampaigns)
    .set({ status: "running", updatedAt: new Date(), errorMessage: null })
    .where(eq(researchCampaigns.id, campaignId));

  try {
    const queryRows = await db
      .select()
      .from(researchQueries)
      .where(eq(researchQueries.campaignId, campaignId));

    const notes: string[] = [];
    const urlToSourceId = new Map<string, string>();

    const limit =
      campaign.depth === "quick" ? 2 : campaign.depth === "deep" ? 6 : 4;
    const selected = queryRows.slice(0, limit);

    for (const queryRow of selected) {
      await db
        .update(researchQueries)
        .set({ status: "running" })
        .where(eq(researchQueries.id, queryRow.id));

      const research = await webResearch({
        query: queryRow.query,
        userId: campaign.userId,
        workspaceId: campaign.workspaceId,
        feature: "research_campaign",
      });

      notes.push(`### ${queryRow.cluster}\nQuery: ${queryRow.query}\n${research.text}`);

      let firstSourceId: string | null = null;
      for (const hit of research.hits.slice(0, 5)) {
        let sourceId = urlToSourceId.get(hit.url);
        if (!sourceId) {
          const [source] = await db
            .insert(sources)
            .values({
              workspaceId: campaign.workspaceId,
              campaignId,
              url: hit.url,
              title: hit.title,
              publisher: hit.publisher,
              sourceType: "web",
              snippet: hit.snippet,
              qualityScore: hit.url.includes("gov.in") || hit.url.includes("kvs") ? 0.9 : 0.6,
            })
            .returning();
          sourceId = source.id;
          urlToSourceId.set(hit.url, sourceId);
        }
        if (!firstSourceId) firstSourceId = sourceId;
      }

      if (research.hits.length === 0) {
        const [source] = await db
          .insert(sources)
          .values({
            workspaceId: campaign.workspaceId,
            campaignId,
            title: `Research note: ${queryRow.cluster}`,
            sourceType: "ai_web_research",
            snippet: research.text.slice(0, 500),
            rawContent: research.text,
            qualityScore: 0.4,
          })
          .returning();
        firstSourceId = source.id;
      }

      await db.insert(researchResults).values({
        campaignId,
        queryId: queryRow.id,
        sourceId: firstSourceId,
        content: research.text,
      });

      await db
        .update(researchQueries)
        .set({ status: "completed" })
        .where(eq(researchQueries.id, queryRow.id));
    }

    const extraction = await chatCompletion({
      model: MODELS.fast,
      system: claimExtractionSystem,
      user: `Workspace: ${workspace.name}
Topic: ${campaign.topic}

RESEARCH NOTES:
${notes.join("\n\n").slice(0, 24000)}`,
      userId: campaign.userId,
      workspaceId: campaign.workspaceId,
      feature: "claim_extraction",
      useCache: false,
      temperature: 0,
    });

    const jsonMatch = extraction.content.match(/\{[\s\S]*\}/);
    const parsed = claimSchema.safeParse(
      JSON.parse(jsonMatch ? jsonMatch[0] : '{"claims":[]}'),
    );
    const extractedClaims = parsed.success ? parsed.data.claims : [];

    const createdClaimIds: string[] = [];
    for (const claim of extractedClaims.slice(0, 20)) {
      const [row] = await db
        .insert(claims)
        .values({
          workspaceId: campaign.workspaceId,
          campaignId,
          statement: claim.statement,
          status: "CANDIDATE",
          confidence: claim.confidence ?? 0.5,
          assessment: claim.assessment ?? "Needs user review",
          topic: claim.topic ?? campaign.topic,
          conflictNote: claim.conflictNote ?? null,
          metadata: { sourceUrls: claim.sourceUrls ?? [] },
        })
        .returning();
      createdClaimIds.push(row.id);

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
    }

    // Basic conflict detection: similar opposing confidence notes
    for (let i = 0; i < createdClaimIds.length; i += 1) {
      for (let j = i + 1; j < createdClaimIds.length; j += 1) {
        const a = extractedClaims[i];
        const b = extractedClaims[j];
        if (!a || !b) continue;
        if (
          a.conflictNote ||
          b.conflictNote ||
          (a.topic && b.topic && a.topic === b.topic && a.statement !== b.statement)
        ) {
          if (
            a.statement.toLowerCase().includes("not") !==
              b.statement.toLowerCase().includes("not") &&
            a.topic === b.topic
          ) {
            await db.insert(claimConflicts).values({
              workspaceId: campaign.workspaceId,
              claimIdA: createdClaimIds[i]!,
              claimIdB: createdClaimIds[j]!,
              description: `Possible conflict on topic "${a.topic}": review before approving.`,
            });
            await db
              .update(claims)
              .set({ status: "CONFLICTING", updatedAt: new Date() })
              .where(eq(claims.id, createdClaimIds[i]!));
            await db
              .update(claims)
              .set({ status: "CONFLICTING", updatedAt: new Date() })
              .where(eq(claims.id, createdClaimIds[j]!));
          }
        }
      }
    }

    const summary = `Found ${urlToSourceId.size || notes.length} source notes and extracted ${createdClaimIds.length} candidate claims for review.`;

    await db
      .update(researchCampaigns)
      .set({
        status: "completed",
        summary,
        updatedAt: new Date(),
        finishedAt: new Date(),
        metadata: {
          queryCount: selected.length,
          claimCount: createdClaimIds.length,
          sourceCount: urlToSourceId.size,
        },
      })
      .where(eq(researchCampaigns.id, campaignId));

    return { claimCount: createdClaimIds.length, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed";
    await db
      .update(researchCampaigns)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(researchCampaigns.id, campaignId));
    throw error;
  }
}
