import type { CtContext } from "./ct";

export interface AssistantSource {
  n: number;
  title: string;
  url: string;
  sourceName: string;
  license: string;
  snippet: string;
}

export interface AssistantAnswer {
  text: string;
  sources: AssistantSource[];
  degraded: boolean;
}

export interface AskInput {
  text: string;
  conversationId: string;
  focus?: string;
  ct?: CtContext;
  history: { role: "user" | "assistant"; text: string }[];
  signal?: AbortSignal;
  onMeta?: (sources: AssistantSource[], mode: string) => void;
  onDelta?: (text: string) => void;
}

export class AssistantError extends Error {}

interface SseFrame {
  event: string;
  data: string;
}

export function createSseParser(
  emit: (frame: SseFrame) => void,
): (chunk: string, finalize?: boolean) => void {
  let buffer = "";
  return (chunk, finalize = false) => {
    buffer += chunk;
    while (true) {
      const boundary = /\r?\n\r?\n/.exec(buffer);
      if (!boundary) break;
      const raw = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const frame = parseFrame(raw);
      if (frame) emit(frame);
    }
    if (finalize && buffer.trim()) {
      const frame = parseFrame(buffer);
      buffer = "";
      if (frame) emit(frame);
    }
  };
}

function parseFrame(raw: string): SseFrame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

function readSources(value: unknown): AssistantSource[] {
  if (!Array.isArray(value)) return [];
  const sources: AssistantSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : "";
    if (!url.startsWith("https://")) continue;
    sources.push({
      n: typeof record.n === "number" ? record.n : sources.length + 1,
      title: typeof record.title === "string" ? record.title : "未命名资料",
      url,
      sourceName: typeof record.sourceName === "string" ? record.sourceName : "来源",
      license: typeof record.license === "string" ? record.license : "",
      snippet: typeof record.snippet === "string" ? record.snippet : "",
    });
  }
  return sources;
}

// 浏览器侧只认本站 Function 的 SSE 协议；任何解析失败都当作回答不可用，不猜内容。
export async function askAssistant(input: AskInput): Promise<AssistantAnswer> {
  const response = await fetch("/functions/v1/app/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      text: input.text,
      conversationId: input.conversationId,
      focus: input.focus ?? "",
      ct: input.ct,
      history: input.history,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    let message = `助手暂时不可用（HTTP ${response.status}），请稍后再试。`;
    try {
      const payload: unknown = await response.json();
      const record = payload as { message?: unknown };
      if (typeof record.message === "string") message = record.message;
    } catch {
      // 非 JSON 错误响应保留状态码提示。
    }
    throw new AssistantError(message);
  }
  if (!response.body) throw new AssistantError("回答通道没有返回内容。");

  const answer: AssistantAnswer = { text: "", sources: [], degraded: false };
  let failure: string | null = null;
  const parse = createSseParser((frame) => {
    let payload: unknown;
    try {
      payload = JSON.parse(frame.data);
    } catch {
      return;
    }
    const record = (payload ?? {}) as Record<string, unknown>;
    if (frame.event === "meta") {
      answer.sources = readSources(record.sources);
      input.onMeta?.(answer.sources, typeof record.mode === "string" ? record.mode : "");
    } else if (frame.event === "delta") {
      if (typeof record.text === "string" && record.text) {
        answer.text += record.text;
        input.onDelta?.(record.text);
      }
    } else if (frame.event === "done") {
      answer.degraded = record.degraded === true;
    } else if (frame.event === "error") {
      failure = typeof record.code === "string" ? record.code : "ai_service_unavailable";
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parse(decoder.decode(value, { stream: true }));
    }
    parse(decoder.decode(), true);
  } finally {
    reader.releaseLock();
  }

  if (failure) throw new AssistantError("回答生成中断，请重试。");
  if (!answer.text.trim()) throw new AssistantError("回答为空，请重试。");
  return answer;
}
