// Sites Function 入口：浏览器 → 本站 Function → Qoder Cloud Agents。
// 浏览器永远拿不到 PAT；这里只转发经过校验的问题与已检索到的资料。
import { CloudAgentsError, createCloudAgentsClient } from "./cloud-agents.mjs";
import { encodeSSE, readSSE } from "./sse.mjs";
import { degradedAnswer, AGENT_SYSTEM } from "./app/prompt.ts";
import { heartKnowledge } from "./knowledge/heart-knowledge.ts";
import { createRetriever } from "./app/retrieval.ts";
import { truncate } from "./app/text.ts";
import { FOCUS_TITLES, planTurn } from "./app/turn.ts";

const CLOUD_ORIGIN = "https://api.qoder.com.cn";
const CONFIG_TAG = "tutor-v1";
const MAX_BODY_BYTES = 12 * 1024;
const MAX_QUESTION_CHARS = 400;
const SESSION_TTL_MS = 20 * 60 * 1000;
const STREAM_LIFETIME_MS = 90 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const DAILY_LIMIT = 800;
const MAX_CONCURRENT_AI = 3;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store, no-transform",
  "x-content-type-options": "nosniff",
};

const kb = heartKnowledge;
const retrieve = createRetriever(kb);
const cloud = createCloudAgentsClient({ origin: CLOUD_ORIGIN });

interface AgentBinding {
  agent: { type: "agent"; id: string; version: number };
  environment_id: string;
}

let resourcesPromise: Promise<AgentBinding> | null = null;
const sessions = new Map<string, { id: string; lastEventId?: string; touched: number }>();
const busyConversations = new Set<string>();
const rateBuckets = new Map<string, number[]>();
let dailyKey = "";
let dailyCount = 0;
let activeAi = 0;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeFailure(error: unknown): { code: string; diagnosticId?: string } {
  if (!(error instanceof CloudAgentsError)) return { code: "ai_service_unavailable" };
  const diagnosticId = (error as unknown as { diagnosticId?: unknown }).diagnosticId;
  return typeof diagnosticId === "string"
    ? { code: error.code, diagnosticId }
    : { code: error.code };
}

async function pickModel(): Promise<string> {
  const list = await cloud.request("/api/v1/cloud/models");
  const models: unknown[] = Array.isArray(list?.data) ? list.data : [];
  const enabled = models.find(
    (item) => item && typeof item === "object" && (item as { enabled?: boolean }).enabled !== false,
  ) as { id?: unknown } | undefined;
  if (!enabled || typeof enabled.id !== "string")
    throw new CloudAgentsError("ai_model_unavailable");
  return enabled.id;
}

async function ensureResources(): Promise<AgentBinding> {
  if (resourcesPromise) return resourcesPromise;
  const pending = (async (): Promise<AgentBinding> => {
    const scope = "anatomy-sketch";
    const agentMeta = { app: scope, role: "heart-tutor", config: CONFIG_TAG };
    const envMeta = { app: scope, role: "sandbox", config: CONFIG_TAG };

    const [agents, environments] = await Promise.all([
      cloud.findResources("agents", agentMeta),
      cloud.findResources("environments", envMeta),
    ]);

    let environment = environments[0];
    if (!environment) {
      environment = await cloud.request("/api/v1/cloud/environments", {
        method: "POST",
        body: {
          name: "anatomy-sketch-sandbox",
          config: { type: "cloud" },
          metadata: envMeta,
        },
      });
    }
    if (!environment || !/^env_[A-Za-z0-9_-]+$/.test(String(environment.id))) {
      throw new CloudAgentsError("ai_response_invalid");
    }

    let agent = agents[0];
    if (!agent) {
      const model = await pickModel();
      agent = await cloud.request("/api/v1/cloud/agents", {
        method: "POST",
        idempotencyKey: `anatomy-sketch-${CONFIG_TAG}`,
        body: {
          name: "anatomy-sketch-tutor",
          model,
          system: AGENT_SYSTEM,
          metadata: agentMeta,
        },
      });
    }
    const version = Number(agent?.version);
    if (
      !agent ||
      !/^agent_[A-Za-z0-9_-]+$/.test(String(agent.id)) ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      throw new CloudAgentsError("ai_response_invalid");
    }
    return {
      agent: { type: "agent" as const, id: String(agent.id), version },
      environment_id: String(environment.id),
    };
  })().catch((error: unknown) => {
    resourcesPromise = null;
    throw error;
  });
  resourcesPromise = pending;
  return pending;
}

async function resolveSession(
  conversationId: string,
): Promise<{ id: string; lastEventId?: string; cold: boolean }> {
  const now = Date.now();
  const existing = sessions.get(conversationId);
  if (existing && now - existing.touched < SESSION_TTL_MS) {
    existing.touched = now;
    return { id: existing.id, lastEventId: existing.lastEventId, cold: false };
  }
  const binding = await ensureResources();
  const created = await cloud.request("/api/v1/cloud/sessions", {
    method: "POST",
    body: { agent: binding.agent, environment_id: binding.environment_id },
  });
  const id = String(created?.id ?? "");
  if (!/^sess_[A-Za-z0-9_-]+$/.test(id)) throw new CloudAgentsError("ai_response_invalid");
  const record = { id, touched: now, lastEventId: undefined as string | undefined };
  sessions.set(conversationId, record);
  if (sessions.size > 64) {
    for (const [key, value] of sessions) {
      if (now - value.touched >= SESSION_TTL_MS) sessions.delete(key);
    }
  }
  return { id, cold: true };
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== dailyKey) {
    dailyKey = day;
    dailyCount = 0;
  }
  if (dailyCount >= DAILY_LIMIT) return true;
  const recent = (rateBuckets.get(ip) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (rateBuckets.size > 4096) {
    for (const [key, list] of rateBuckets) {
      if (list.every((stamp) => now - stamp >= RATE_WINDOW_MS)) rateBuckets.delete(key);
    }
  }
  dailyCount += 1;
  return false;
}

function extractText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const item = block as { text?: unknown };
      return typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

function extractDelta(
  event: unknown,
  eventName = "",
): { text: string; id?: string; type: string; failed: boolean; idle: boolean } {
  const record = (event ?? {}) as Record<string, unknown>;
  const type = typeof record.type === "string" && record.type ? record.type : eventName;
  const eventId = typeof record.event_id === "string" ? record.event_id : undefined;
  const delta = (record.delta ?? record.event_delta) as Record<string, unknown> | undefined;
  if (delta && typeof delta === "object") {
    const content = delta.content as Record<string, unknown> | undefined;
    if (typeof content?.text === "string" && content.text) {
      return { text: content.text, id: eventId, type, failed: false, idle: false };
    }
  }
  const failed = type === "session.error" || type.endsWith("generation.error");
  const idle = type === "session.status_idle" || type === "session.status.idle";
  if (type === "agent.message") {
    const content =
      record.content ?? (record.message as Record<string, unknown> | undefined)?.content;
    return { text: extractText(content), id: eventId, type, failed, idle };
  }
  return { text: "", id: eventId, type, failed, idle };
}

interface Sink {
  send: (event: string, data: unknown) => void;
  signal: AbortSignal;
}

async function runAnswer(
  session: { id: string; lastEventId?: string },
  userMessage: string,
  sink: Sink,
): Promise<boolean> {
  const upstream = await cloud.openStream(session.id, {
    lastEventId: session.lastEventId,
    signal: sink.signal,
  });
  try {
    await cloud.request(`/api/v1/cloud/sessions/${session.id}/events`, {
      method: "POST",
      body: { events: [{ type: "user.message", content: [{ type: "text", text: userMessage }] }] },
    });
    let streamed = false;
    let lastId = session.lastEventId;
    for await (const frame of readSSE(upstream.body, {
      signal: sink.signal,
    } as unknown as Parameters<typeof readSSE>[1])) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(frame.data);
      } catch {
        continue;
      }
      const result = extractDelta(parsed, frame.event);
      const frameId = frame.id || result.id;
      if (frameId && frameId === session.lastEventId) continue;
      if (result.failed) throw new CloudAgentsError("ai_generation_failed");
      if (result.text) {
        if (!streamed || result.type !== "agent.message") sink.send("delta", { text: result.text });
        streamed = true;
      }
      if (frameId) lastId = frameId;
      if (result.idle) break;
    }
    session.lastEventId = lastId;
    return streamed;
  } finally {
    upstream.close();
  }
}

function sseResponse(handler: (sink: Sink) => Promise<void>): Response {
  const lifetime = new AbortController();
  const timer = setTimeout(() => lifetime.abort(), STREAM_LIFETIME_MS);
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encodeSSE(event, data));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 10_000);
      try {
        await handler({ send, signal: lifetime.signal });
      } catch {
        send("error", { code: "ai_service_unavailable" });
      } finally {
        clearInterval(ping);
        clearTimeout(timer);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // 已断开时无需再关。
          }
        }
      }
    },
    cancel() {
      closed = true;
      lifetime.abort();
      clearTimeout(timer);
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

interface ChatInput {
  text: string;
  conversationId: string;
  focus?: string;
  history: { role: "user" | "assistant"; text: string }[];
}

function parseInput(raw: string): ChatInput | { error: string } {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: "请求格式不正确。" };
  }
  if (!body || typeof body !== "object") return { error: "请求格式不正确。" };
  const record = body as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return { error: "请输入一个问题。" };
  if ([...text].length > MAX_QUESTION_CHARS)
    return { error: `问题请控制在 ${MAX_QUESTION_CHARS} 字以内。` };
  const conversationId = typeof record.conversationId === "string" ? record.conversationId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
    return { error: "会话标识缺失。" };
  }
  const history: ChatInput["history"] = [];
  if (Array.isArray(record.history)) {
    for (const item of record.history.slice(-6)) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { role?: unknown; text?: unknown };
      if (entry.role !== "user" && entry.role !== "assistant") continue;
      if (typeof entry.text !== "string" || !entry.text.trim()) continue;
      history.push({ role: entry.role, text: truncate(entry.text, 300) });
    }
  }
  return {
    text,
    conversationId,
    history,
    ...(typeof record.focus === "string" ? { focus: record.focus } : {}),
  };
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

async function handleChat(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const requestHost = new URL(request.url).host;
      const loopback = (host: string) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
      if (originHost !== requestHost && !(loopback(originHost) && loopback(requestHost))) {
        return json(
          { ok: false, code: "origin_rejected", message: "仅接受本站页面发起的请求。" },
          403,
        );
      }
    } catch {
      return json(
        { ok: false, code: "origin_rejected", message: "仅接受本站页面发起的请求。" },
        403,
      );
    }
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ ok: false, code: "request_too_large", message: "请求体过大。" }, 413);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, code: "request_too_large", message: "请求体过大。" }, 413);
  }
  const parsed = parseInput(raw);
  if ("error" in parsed)
    return json({ ok: false, code: "invalid_request", message: parsed.error }, 400);

  const ip = clientIp(request);

  // 先做一次不依赖会话的规划：越界、问候与安全分流完全不碰云端，也不占用提问配额。
  const initial = planTurn(
    { text: parsed.text, history: parsed.history, focus: parsed.focus },
    retrieve,
  );
  if (initial.kind !== "answer") {
    return sseResponse(async ({ send }) => {
      send("meta", { mode: "static", sources: [] });
      send("delta", { text: initial.reply });
      send("done", { degraded: false });
    });
  }

  if (rateLimited(ip)) {
    return json(
      { ok: false, code: "rate_limited", message: "提问太频繁了，请过几分钟再试。" },
      429,
    );
  }
  if (busyConversations.has(parsed.conversationId)) {
    return json(
      { ok: false, code: "conversation_busy", message: "上一条回答还在生成，请稍候。" },
      429,
    );
  }

  if (activeAi >= MAX_CONCURRENT_AI) {
    return json({ ok: false, code: "busy", message: "当前使用人数较多，请稍后再试。" }, 429);
  }

  busyConversations.add(parsed.conversationId);
  activeAi += 1;
  return sseResponse(async (sink) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      busyConversations.delete(parsed.conversationId);
      activeAi = Math.max(0, activeAi - 1);
    };
    try {
      let plan = initial;
      let session: { id: string; lastEventId?: string } | null = null;
      try {
        const resolved = await resolveSession(parsed.conversationId);
        session = resolved;
        if (resolved.cold) {
          const replanned = planTurn(
            { text: parsed.text, history: parsed.history, focus: parsed.focus },
            retrieve,
            true,
          );
          if (replanned.kind === "answer") plan = replanned;
        }
      } catch {
        session = null;
      }

      sink.send("meta", {
        mode: plan.mode,
        topic: plan.topic,
        sources: plan.citations.map((citation) => ({
          n: citation.n,
          title: citation.title,
          url: citation.url,
          sourceName: citation.sourceName,
          license: citation.license,
          snippet: truncate(citation.text, 120),
        })),
      });

      let answered = false;
      if (session) {
        try {
          answered = await runAnswer(session, plan.userMessage, sink);
        } catch (error) {
          const failure = safeFailure(error);
          sink.send("status", { code: failure.code });
          answered = false;
        }
      }
      if (!answered) sink.send("delta", { text: degradedAnswer(plan.citations) });
      sink.send("done", { degraded: !answered });
    } finally {
      release();
    }
  });
}

Deno.serve((request) => {
  const { pathname } = new URL(request.url);
  if (request.method === "GET" && pathname.endsWith("/health")) {
    return json({
      ok: true,
      service: "anatomy-sketch-chat",
      knowledgeChunks: kb.chunks.length,
      structureIds: Object.keys(FOCUS_TITLES),
    });
  }
  if (request.method !== "POST" || !pathname.endsWith("/chat")) {
    return json({ ok: false, code: "not_found", message: "Not found" }, 404);
  }
  return handleChat(request);
});
