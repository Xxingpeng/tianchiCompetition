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

// Qoder Sites 网关按单字节转发请求体，非 ASCII 的中文会变成乱码；
// 纯 ASCII 的 \uXXXX 转义可以原样穿过网关，再由服务端 JSON.parse 还原。
function encodeChatBody(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => {
    return "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
  });
}

// 面向用户的错误只用中文短句；上游/网关的英文报文一律不透传。
const STATUS_FALLBACK: Record<number, string> = {
  400: "问题格式不正确，请修改后重试。",
  413: "问题或请求太大，请精简后重试。",
  429: "提问太频繁了，请过几分钟再试。",
};
const CJK = /[\u4e00-\u9fff]/;

async function failureMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    const record = (payload ?? {}) as { message?: unknown };
    // 只接受站内 Function 给出的中文提示，其余（网关/上游英文）按状态码兜底。
    if (typeof record.message === "string" && CJK.test(record.message)) return record.message;
  } catch {
    // 非 JSON 错误响应按状态码兜底。
  }
  return STATUS_FALLBACK[response.status] ?? "助手暂时不可用，请稍后再试。";
}

// 浏览器侧只认本站 Function 的 SSE 协议；任何解析失败都当作回答不可用，不猜内容。
export async function askAssistant(input: AskInput): Promise<AssistantAnswer> {
  let response: Response;
  try {
    response = await fetch("/functions/v1/app/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: encodeChatBody({
        text: input.text,
        conversationId: input.conversationId,
        focus: input.focus ?? "",
        ct: input.ct,
        history: input.history,
      }),
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AssistantError("网络连接失败，请检查网络后重试。");
  }

  if (!response.ok) throw new AssistantError(await failureMessage(response));
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AssistantError("回答传输中断，请重试。");
  } finally {
    reader.releaseLock();
  }

  if (failure) throw new AssistantError("回答生成中断，请重试。");
  if (!answer.text.trim()) throw new AssistantError("回答为空，请重试。");
  return answer;
}
