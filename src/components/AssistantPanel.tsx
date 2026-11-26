import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import logo from "../assets/xiaoyi.webp";
import { askAssistant, type AssistantSource } from "../data/assistant";
import type { StructureRecord } from "../types";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: AssistantSource[];
  degraded: boolean;
  mode?: string;
  pending?: boolean;
  failed?: boolean;
}

const WELCOME: Turn = {
  id: "welcome",
  role: "assistant",
  text: "你好，我是小医。可以问我心脏结构、瓣膜与血流、传导系统，或者 CT 的窗宽窗位这类基础知识。每个回答都会列出所用资料的来源。",
  sources: [],
  degraded: false,
};

const SUGGESTIONS = ["左心室为什么比右心室壁厚？", "窗宽窗位是什么？", "心动周期分几个时相？"];

function newConversationId(): string {
  try {
    const key = "anatomy-sketch-assistant-id";
    const existing = sessionStorage.getItem(key);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function AssistantPanel({ focus }: { focus: StructureRecord | null }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [turns, setTurns] = useState<Turn[]>([WELCOME]);
  const [conversationId] = useState(newConversationId);
  const abortRef = useRef<AbortController | null>(null);
  const turnSeq = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function update(id: string, patch: Partial<Turn>) {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }

  async function submit(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    turnSeq.current += 1;
    const assistantId = `assistant-${turnSeq.current}`;
    const history = turns
      .filter((turn) => turn.id !== "welcome" && !turn.pending && !turn.failed)
      .slice(-6)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    setTurns((prev) => [
      ...prev,
      { id: `user-${assistantId}`, role: "user", text, sources: [], degraded: false },
      { id: assistantId, role: "assistant", text: "", sources: [], degraded: false, pending: true },
    ]);
    setInput("");
    setBusy(true);
    setNotice("正在检索资料…");
    const controller = new AbortController();
    abortRef.current = controller;
    let streamed = "";
    try {
      const answer = await askAssistant({
        text,
        conversationId,
        focus: focus?.id,
        history,
        signal: controller.signal,
        onMeta: (sources, mode) => {
          update(assistantId, { sources, mode });
          setNotice("正在作答…");
        },
        onDelta: (chunk) => {
          streamed += chunk;
          update(assistantId, { text: streamed });
        },
      });
      update(assistantId, { pending: false, degraded: answer.degraded });
      setNotice("回答完成");
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const message = aborted
        ? "（已停止）"
        : error instanceof Error
          ? error.message
          : "回答失败，请重试。";
      update(assistantId, {
        text: streamed ? `${streamed}\n\n${message}` : message,
        pending: false,
        failed: !aborted,
      });
      setNotice(aborted ? "已停止" : "回答失败");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="assistant" onKeyDown={handleKeyDown}>
      {open && (
        <section id="assistant-panel" className="assistant-panel" aria-label="小医 · 心脏学习助手">
          <header className="assistant-head">
            <img className="assistant-avatar" src={logo} alt="" width={40} height={40} />
            <div className="assistant-identity">
              <h2>小医</h2>
              <p className="assistant-sub">
                心脏学习助手 · 范围：心脏解剖与 CT 基础 · 基于公开资料检索 · 不提供医疗建议
              </p>
            </div>
          </header>

          <div
            className="assistant-log"
            ref={logRef}
            role="group"
            aria-label="对话记录"
            tabIndex={0}
          >
            {turns.map((turn) =>
              turn.role === "user" ? (
                <p key={turn.id} className="assistant-bubble user">
                  {turn.text}
                </p>
              ) : (
                <div key={turn.id} className="assistant-bubble bot">
                  {turn.pending && !turn.text ? (
                    <p className="assistant-thinking">
                      {turn.sources.length > 0
                        ? `已找到 ${turn.sources.length} 条资料，正在作答…`
                        : "正在检索资料…"}
                    </p>
                  ) : (
                    <p
                      className={`assistant-text${turn.failed ? " failed" : ""}${
                        turn.pending ? " streaming" : ""
                      }`}
                    >
                      {turn.text}
                    </p>
                  )}
                  {turn.mode === "tot" && <p className="assistant-badge">深入模式</p>}
                  {turn.degraded && <p className="assistant-badge">知识库直答 · AI 通道暂不可用</p>}
                  {turn.sources.length > 0 && (!turn.pending || turn.text.length > 0) ? (
                    <ol className="assistant-sources">
                      {turn.sources.map((source) => (
                        <li key={`${source.n}-${source.url}`}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            [{source.n}] {source.title}
                          </a>
                          <span className="assistant-source-meta">
                            {source.sourceName}
                            {source.license ? ` · ${source.license}` : ""}
                          </span>
                          {source.snippet && (
                            <span className="assistant-snippet">{source.snippet}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    turn.id !== "welcome" &&
                    !turn.pending &&
                    !turn.failed && <p className="assistant-nosource">本次未使用外部资料</p>
                  )}
                </div>
              ),
            )}
          </div>

          <p className="visually-hidden" role="status">
            {notice}
          </p>

          {turns.length <= 1 && (
            <div className="assistant-chips" aria-label="示例问题">
              {SUGGESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="chip"
                  disabled={busy}
                  onClick={() => void submit(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          <form
            className="assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(input);
            }}
          >
            <label htmlFor="assistant-question" className="visually-hidden">
              向助手提问
            </label>
            <textarea
              id="assistant-question"
              ref={inputRef}
              rows={2}
              maxLength={400}
              value={input}
              placeholder="例如：左心室为什么比右心室壁厚？"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit(input);
                }
              }}
            />
            <div className="assistant-actions">
              <p className="assistant-hint">Enter 发送 · Shift+Enter 换行 · 最多 400 字</p>
              {busy ? (
                <button type="button" className="assistant-send" onClick={stop}>
                  停止
                </button>
              ) : (
                <button type="submit" className="assistant-send" disabled={!input.trim()}>
                  发送
                </button>
              )}
            </div>
          </form>

          <p className="assistant-foot">切面与 3D 为教学示意，不是真实病例影像。</p>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        className="assistant-launcher"
        aria-expanded={open}
        aria-controls={open ? "assistant-panel" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <img src={logo} alt="" width={24} height={24} />
        <span>{open ? "收起小医" : "问问小医"}</span>
      </button>
    </div>
  );
}
