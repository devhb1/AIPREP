/**
 * §150 acceptance pass against local app (API-level).
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Minimal stub so supabase-js can construct on Node without the `ws` package.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWebSocket.CLOSED;
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
}
(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;

const BASE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const EMAIL = `aiprep.s150.${Date.now()}@example.com`;
const PASSWORD = "AiprepS150!pass";

type Cookie = { name: string; value: string };
const cookieStore: Cookie[] = [];

function setCookies(list: Cookie[]) {
  for (const c of list) {
    const i = cookieStore.findIndex((x) => x.name === c.name);
    if (i >= 0) cookieStore[i] = c;
    else cookieStore.push(c);
  }
}

function cookieHeader() {
  return cookieStore.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const cookies = cookieHeader();
  if (cookies) headers.set("cookie", cookies);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

function log(step: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  let failed = 0;
  const check = (step: string, ok: boolean, detail?: string) => {
    if (!log(step, ok, detail)) failed += 1;
  };

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check("health", health.ok === true, `phase=${health.phase}`);

  // Admin create confirmed user (disable realtime transport issues)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch },
    },
  );
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "S150 Tester" },
  });
  check("admin.createUser", !created.error, created.error?.message || EMAIL);
  if (created.error) process.exit(1);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore,
        setAll: (cookies) => setCookies(cookies),
      },
    },
  );
  const signed = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  check("auth.signIn", !signed.error && Boolean(signed.data.session), signed.error?.message);
  if (signed.error) process.exit(1);

  // Seed workspace
  const wsRes = await api("/api/workspaces");
  const workspaces = wsRes.json?.workspaces || [];
  const workspaceId = workspaces[0]?.id as string | undefined;
  check(
    "workspace.seed",
    wsRes.status === 200 && Boolean(workspaceId),
    `${wsRes.status} ${workspaces[0]?.name || wsRes.text.slice(0, 120)}`,
  );
  if (!workspaceId) process.exit(1);

  // Upload PDF
  const pdf = readFileSync(resolve("tmp/kvs-sample.pdf"));
  const form = new FormData();
  form.set("workspaceId", workspaceId);
  form.set("file", new Blob([pdf], { type: "application/pdf" }), "kvs-sample.pdf");
  const up = await api("/api/documents/upload", { method: "POST", body: form });
  const documentId = up.json?.document?.id as string | undefined;
  check(
    "document.upload",
    up.status < 400 && Boolean(documentId),
    `${up.status} ${up.text.slice(0, 200)}`,
  );

  // Poll ready (upload route may already process inline)
  let docStatus = up.json?.document?.status || "";
  for (let i = 0; i < 20 && documentId && docStatus !== "ready" && docStatus !== "failed"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const d = await api(`/api/documents/${documentId}`);
    docStatus = d.json?.document?.status || "";
    if (docStatus === "queued" || docStatus === "uploaded") {
      await api(`/api/documents/${documentId}`, { method: "POST" });
    }
  }
  check("document.ready", docStatus === "ready", docStatus);

  // Mentor chat
  const chat = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      message: "What documents should I prepare for KVS PRT interview?",
    }),
  });
  check(
    "mentor.chat",
    chat.status === 200 && Boolean(chat.json?.message?.content),
    `${chat.status} ${(chat.json?.message?.content || chat.text).toString().slice(0, 140)}`,
  );

  // Research quick
  const research = await api("/api/research/campaigns", {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      topic: "KVS PRT interview documents eligibility public",
      depth: "quick",
    }),
  });
  check(
    "research.campaign",
    research.status < 400,
    `${research.status} ${research.text.slice(0, 180)}`,
  );

  // Approve a claim if any
  const claimsRes = await api(`/api/claims?workspaceId=${workspaceId}&status=inbox`);
  const claims = claimsRes.json?.claims || [];
  check("claims.list", claimsRes.status === 200, `count=${claims.length}`);
  if (claims[0]?.id) {
    const approve = await api("/api/claims", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        claimId: claims[0].id,
        action: "approve",
      }),
    });
    check("claims.approve", approve.status < 400, `${approve.status}`);
  } else {
    check("claims.approve", false, "no candidate claims (research may have returned empty)");
  }

  // Plan
  const plan = await api("/api/plan", {
    method: "POST",
    body: JSON.stringify({ workspaceId, action: "generate", days: 7 }),
  });
  check("plan.generate", plan.status < 400, `${plan.status} ${plan.text.slice(0, 140)}`);

  // Complete a task if present
  const planGet = await api(`/api/plan?workspaceId=${workspaceId}`);
  const taskId = planGet.json?.tasks?.[0]?.id || planGet.json?.today?.[0]?.id;
  if (taskId) {
    const done = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({ workspaceId, action: "complete_task", taskId }),
    });
    check("task.complete", done.status < 400, `${done.status}`);
  } else {
    check("task.complete", false, "no tasks returned");
  }

  // Practice
  const practice = await api("/api/practice", {
    method: "POST",
    body: JSON.stringify({ workspaceId, action: "generate", count: 2 }),
  });
  check(
    "practice.generate",
    practice.status < 400,
    `${practice.status} ${practice.text.slice(0, 140)}`,
  );

  // Interview
  const start = await api("/api/interview", {
    method: "POST",
    body: JSON.stringify({ workspaceId, action: "start", judgeMode: "easy" }),
  });
  const sessionId = start.json?.session?.id as string | undefined;
  check("interview.start", start.status < 400 && Boolean(sessionId), `${start.status}`);
  if (sessionId) {
    const ans = await api("/api/interview", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        action: "answer",
        sessionId,
        answer:
          "I use child-centered pedagogy with clear outcomes, formative checks, and inclusive seating so every learner participates.",
      }),
    });
    check("interview.answer", ans.status < 400, `${ans.status}`);
    const end = await api("/api/interview", {
      method: "POST",
      body: JSON.stringify({ workspaceId, action: "end", sessionId }),
    });
    check("interview.end", end.status < 400, `${end.status}`);
  }

  // Settings + export
  const settings = await api(`/api/settings?workspaceId=${workspaceId}`);
  check("settings.usage", settings.status < 400, `${settings.status}`);
  const exp = await api(`/api/settings?workspaceId=${workspaceId}&view=export`);
  check("settings.export_json", exp.status < 400 && Boolean(exp.json?.workspace), `${exp.status}`);
  const ics = await api(`/api/settings?workspaceId=${workspaceId}&view=calendar`);
  check("settings.export_ics", ics.status < 400 && ics.text.includes("BEGIN:VCALENDAR"), `${ics.status}`);

  console.log(`\n§150 complete: ${failed === 0 ? "ALL PASSED" : `${failed} failed`}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
