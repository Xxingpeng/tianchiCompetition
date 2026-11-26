// Sites Function 入口：浏览器 → 本站 Function → DashScope 兼容接口。
// 浏览器永远拿不到模型密钥；这里只转发经过校验的问题与已检索到的资料。
import { encodeSSE, readSSE } from "./sse.mjs";
import { parseCt } from "./app/ct.ts";
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
  reason?: string;
  constructor(code: string, reason?: string) {
    super(code);
    this.code = code;
    this.reason = reason;
  }
}

function safeFailure(error: unknown): { code: string; reason?: string } {
  if (!(error instanceof AiChannelError)) return { code: "ai_service_unavailable" };
  return error.reason ? { code: error.code, reason: error.reason } : { code: error.code };
}

// 失败分类只用于诊断：只描述错在哪一层，不带主机、密钥或上游报文。
function networkReason(error: unknown): string {
  const message = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/dns|name or service|resolve/i.test(message)) return "dns";
  if (/certificate|tls|ssl|cert/i.test(message)) return "tls";
  if (/timed? ?out|timeout|abort/i.test(message)) return "timeout";
  if (/connection refused|connect/i.test(message)) return "connect";
  return "network";
}

// 401 时附带的形状标记：只说明像不像一段单独的 DashScope key（前缀与长度区间），
// 不包含任何字符内容，便于区分整行粘贴、贴错字段与旧 key。
function keyShapeTag(apiKey: string): string {
  const prefix = /^sk-[A-Za-z0-9]/.test(apiKey) ? "ksk" : "knosk";
  const length = apiKey.length;
  const band =
    length < 80 ? "lt80" : length <= 110 ? "80to110" : length <= 130 ? "111to130" : "gt130";
  return `${prefix}_${band}`;
}

// 上游拒绝时只保留粗粒度类别（invalid_key/workspace/permission/model），
// 不把错误报文、主机或凭据带出 Function。
async function upstreamFailureReason(
  response: Response,
  keyShape: string,
): Promise<string> {
  let kind = response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : "other";
  try {
    const raw = (await response.text()).slice(0, 1024);
    const payload = JSON.parse(raw) as { error?: { code?: unknown; type?: unknown } };
    const marker = `${String(payload?.error?.code ?? "")} ${String(payload?.error?.type ?? "")}`;
    if (/invalid[_\s-]?api[_\s-]?key/i.test(marker)) kind = "invalid_key";
    else if (/workspace/i.test(marker)) kind = "workspace";
    else if (/access|permission|forbidden/i.test(marker)) kind = "permission";
    else if (/model/i.test(marker)) kind = "model";
  } catch {
    // 非 JSON 错误体（如网关 HTML）：保留状态类别。
  }
  return `http_${response.status}_${kind}_${keyShape}`;
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

// 失败诊断只写私有函数日志：HTTP 状态、错误类型与 base URL 的协议+路径，
// 不记录主机、密钥或上游报文，避免私有端点与凭证进入任何可读输出。
function baseShape(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}${url.pathname}`;
  } catch {
    return "invalid";
  }
}

function logUpstreamFailure(detail: string): void {
  try {
    console.error("dashscope_upstream", detail.slice(0, 200));
  } catch {
    // 日志通道不可用时不影响降级回答。
  }
}

async function runAnswer(
  plan: { userMessage: string },
  history: ChatInput["history"],
  sink: Sink,
): Promise<boolean> {
  const config = dashScopeConfig(readEnv);
  if (!config) {
    logUpstreamFailure("config-missing");
    throw new AiChannelError("ai_not_configured");
  }

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
    if (!response.ok) {
      const reason = await upstreamFailureReason(response, keyShapeTag(config.apiKey));
      logUpstreamFailure(
        `http ${response.status} base ${baseShape(config.baseUrl)} class ${reason}`,
      );
      throw new AiChannelError("ai_service_unavailable", reason);
    }
    if (!response.body) {
      throw new AiChannelError("ai_service_unavailable", "no_body");
    }

    let streamed = false;
    let written = 0;
    for await (const frame of readSSE(response.body, {
      signal: upstream.signal,
    } as unknown as Parameters<typeof readSSE>[1])) {
      const parsed = parseDashScopeFrame(frame.data);
      if (parsed.done) break;
      if (parsed.failed) throw new AiChannelError("ai_generation_failed", "upstream_error");
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
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
    logUpstreamFailure(
      `${message.replace(/https?:\/\/\S+/g, "<url>")} base ${baseShape(config.baseUrl)}`,
    );
    throw new AiChannelError("ai_generation_failed", networkReason(error));
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
  ct?: unknown;
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
    ...(record.ct !== undefined ? { ct: record.ct } : {}),
  };
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

async function handleChat(request: Request): Promise<Response> {
  // 同源写请求由 Sites Gateway 在转发前校验（无/跨站 Origin 直接 sites_gateway_origin_forbidden），
  // 这里不再比较 host：网关转发时内部 URL 的 host 与公开域名不同，重复校验会误杀合法页面请求。
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
    {
      text: parsed.text,
      focus: parsed.focus,
      ct: parseCt(parsed.ct),
      history: parsed.history,
    },
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
        sink.send(
          "status",
          failure.reason ? { code: failure.code, reason: failure.reason } : { code: failure.code },
        );
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
