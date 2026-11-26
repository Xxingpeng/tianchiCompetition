// Sites Function 入口：浏览器 → 本站 Function → DashScope 兼容接口。
// 浏览器永远拿不到模型密钥；这里只转发经过校验的问题与已检索到的资料。
import { encodeSSE, readSSE } from "./sse.mjs";
import { AGENT_SYSTEM, degradedAnswer } from "./app/prompt.ts";
import { buildChatMessages, dashScopeConfig, parseDashScopeFrame } from "./app/llm.ts";
import { heartKnowledge } from "./knowledge/heart-knowledge.ts";
import { createRetriever } from "./app/retrieval.ts";
import { truncate } from "./app/text.ts";
import { FOCUS_TITLES, planTurn } from "./app/turn.ts";

const MAX_BODY_BYTES = 12 * 1024;
const MAX_QUESTION_CHARS = 400;
const STREAM_LIFETIME_MS = 90 * 1000;
const UPSTREAM_TIMEOUT_MS = 45 * 1000;
const MAX_ANSWER_CHARS = 6000;
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
const readEnv = (name: string) => globalThis.Deno?.env.get(name);

const busyConversations = new Set<string>();
const rateBuckets = new Map<string, number[]>();
let dailyKey = "";
let dailyCount = 0;
let activeAi = 0;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

class AiChannelError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function safeFailure(error: unknown): { code: string } {
  return {
    code: error instanceof AiChannelError ? error.code : "ai_service_unavailable",
  };
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

interface Sink {
  send: (event: string, data: unknown) => void;
  signal: AbortSignal;
}

async function runAnswer(
  plan: { userMessage: string },
  history: ChatInput["history"],
  sink: Sink,
): Promise<boolean> {
  const config = dashScopeConfig(readEnv);
  if (!config) throw new AiChannelError("ai_not_configured");

  const upstream = new AbortController();
  const abort = () => upstream.abort();
  sink.signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildChatMessages(AGENT_SYSTEM, history, plan.userMessage),
        stream: true,
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: upstream.signal,
    });
    if (!response.ok || !response.body) throw new AiChannelError("ai_service_unavailable");

    let streamed = false;
    let written = 0;
    for await (const frame of readSSE(response.body, {
      signal: upstream.signal,
    } as unknown as Parameters<typeof readSSE>[1])) {
      const parsed = parseDashScopeFrame(frame.data);
      if (parsed.done) break;
      if (parsed.failed) throw new AiChannelError("ai_generation_failed");
      if (!parsed.text) continue;
      const room = MAX_ANSWER_CHARS - written;
      if (room <= 0) break;
      const text = parsed.text.length > room ? parsed.text.slice(0, room) : parsed.text;
      written += text.length;
      sink.send("delta", { text });
      streamed = true;
    }
    return streamed;
  } catch (error) {
    if (error instanceof AiChannelError) throw error;
    throw new AiChannelError("ai_generation_failed");
  } finally {
    clearTimeout(timeout);
    sink.signal.removeEventListener("abort", abort);
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

  // 先规划一次：越界、问候与安全分流完全不碰云端，也不占用提问配额。
  const initial = planTurn(
    { text: parsed.text, focus: parsed.focus, history: parsed.history },
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
      sink.send("meta", {
        mode: initial.mode,
        topic: initial.topic,
        sources: initial.citations.map((citation) => ({
          n: citation.n,
          title: citation.title,
          url: citation.url,
          sourceName: citation.sourceName,
          license: citation.license,
          snippet: truncate(citation.text, 120),
        })),
      });

      let answered = false;
      try {
        answered = await runAnswer(initial, parsed.history, sink);
      } catch (error) {
        const failure = safeFailure(error);
        sink.send("status", { code: failure.code });
        answered = false;
      }
      if (!answered) sink.send("delta", { text: degradedAnswer(initial.citations) });
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
      aiConfigured: dashScopeConfig(readEnv) !== null,
    });
  }
  if (request.method !== "POST" || !pathname.endsWith("/chat")) {
    return json({ ok: false, code: "not_found", message: "Not found" }, 404);
  }
  return handleChat(request);
});
