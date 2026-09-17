import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  real,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    if (Array.isArray(value)) return value as number[];
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((v) => Number(v));
  },
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    preparationType: text("preparation_type").notNull(),
    organization: text("organization"),
    role: text("role"),
    examDate: timestamp("exam_date", { withTimezone: true }),
    interviewDate: timestamp("interview_date", { withTimezone: true }),
    currentStage: text("current_stage"),
    location: text("location"),
    timezone: text("timezone").default("Asia/Kolkata"),
    preferredLanguage: text("preferred_language").default("English"),
    dailyStudyHours: real("daily_study_hours"),
    preparationLevel: text("preparation_level"),
    isSeed: boolean("is_seed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("workspaces_user_id_idx").on(table.userId)],
);

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  maxDailyAiSpendUsd: real("max_daily_ai_spend_usd").default(1),
  maxResearchQueries: integer("max_research_queries").default(20),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    storagePath: text("storage_path").notNull(),
    byteSize: integer("byte_size"),
    status: text("status").notNull().default("uploaded"),
    pageCount: integer("page_count"),
    category: text("category"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("documents_workspace_id_idx").on(table.workspaceId),
    index("documents_status_idx").on(table.status),
  ],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_pages_doc_page_uidx").on(table.documentId, table.pageNumber),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number"),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate"),
    embedding: vector("embedding"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_chunks_workspace_id_idx").on(table.workspaceId),
    index("document_chunks_document_id_idx").on(table.documentId),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    result: jsonb("result").$type<Record<string, unknown>>().default({}),
    errorMessage: text("error_message"),
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_status_idx").on(table.status),
    index("jobs_type_idx").on(table.type),
  ],
);

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").default("Mentor chat"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<Array<Record<string, unknown>>>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    estimatedCostUsd: real("estimated_cost_usd").default(0),
    cached: boolean("cached").default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_usage_user_created_idx").on(table.userId, table.createdAt),
    index("ai_usage_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Job = typeof jobs.$inferSelect;
