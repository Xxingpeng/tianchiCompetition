export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface DashScopeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_DASHSCOPE_MODEL = "qwen4-max";

// 站点 Secret 编辑框常被整行粘贴（`DASHSCOPE_API_KEY=...`）、连同引号或 `Bearer ` 前缀；
// 这里只做边界清洗，不猜测或改写密钥本身。内部换行仍视为配置错误。
function normalizeApiKey(raw: string | undefined): string {
  let key = (raw ?? "").trim();
  key = key.replace(/^(?:export\s+)?DASHSCOPE_API_KEY\s*=\s*/, "");
  for (const wrapper of ['"', "'", "`"]) {
    if (key.length > 1 && key.startsWith(wrapper) && key.endsWith(wrapper)) {
      key = key.slice(1, -1).trim();
    }
  }
  key = key.replace(/^Bearer\s+/i, "").trim();
  return key;
}

export function dashScopeConfig(
  getEnv: (name: string) => string | undefined,
): DashScopeConfig | null {
  const apiKey = normalizeApiKey(getEnv("DASHSCOPE_API_KEY"));
  if (!apiKey || /[\r\n]/.test(apiKey)) return null;
  const baseEnv = getEnv("DASHSCOPE_BASE_URL")?.trim();
  const rawBase = baseEnv?.length ? baseEnv : DEFAULT_DASHSCOPE_BASE_URL;
  if (rawBase.length > 300) return null;
  const baseUrl = rawBase.replace(/\/+$/, "");
  try {
    if (new URL(baseUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const modelEnv = getEnv("DASHSCOPE_MODEL")?.trim();
  const model = modelEnv?.length ? modelEnv : DEFAULT_DASHSCOPE_MODEL;
  if (!model || model.length > 100 || /[\r\n]/.test(model)) return null;
  return { apiKey, model, baseUrl };
}

export function buildChatMessages(
  system: string,
  history: readonly HistoryTurn[],
  userMessage: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  for (const turn of history) {
    const text = turn.text.trim();
    if (text) messages.push({ role: turn.role, content: text });
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

export interface DashScopeFrame {
  text?: string;
  done?: boolean;
  failed?: boolean;
  invalid?: boolean;
}

// OpenAI 兼容流：内容在 choices[0].delta.content，结束标记是 data: [DONE]。
export function parseDashScopeFrame(raw: string): DashScopeFrame {
  const data = raw.trim();
  if (!data) return {};
  if (data === "[DONE]") return { done: true };
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return { invalid: true };
  }
  if (!payload || typeof payload !== "object") return { invalid: true };
  const record = payload as Record<string, unknown>;
  if (record.error) return { failed: true };
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const delta = first?.delta as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = delta?.content ?? message?.content;
  return typeof content === "string" && content ? { text: content } : {};
}
