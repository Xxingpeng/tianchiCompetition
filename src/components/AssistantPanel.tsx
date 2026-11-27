import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import xiaoxinFace from "../assets/xiaoxin-face.webp";
import xiaoxinSit from "../assets/xiaoxin.webp";
import { askAssistant, type AssistantSource } from "../data/assistant";
import type { CtContext } from "../data/ct";
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
  visibleSources?: number;
  ask?: string;
}

function welcomeTurn(structureCount?: number): Turn {
  const scope =
    structureCount && structureCount > 0 ? `站内 3D 与切面收录了 ${structureCount} 个结构；` : "";
  return {
    id: "welcome",
    role: "assistant",
    text: `你好，我是小心。${scope}瓣膜、传导系统、血流等内容可以直接问我，也可以问常见心血管疾病的概念，或 CT 的窗宽窗位这类基础知识。每个回答都会列出所用资料的来源。`,
    sources: [],
    degraded: false,
  };
}

const SUGGESTIONS = [
  "左心室为什么比右心室壁厚？",
  "高血压为什么伤心脏？",
  "窗宽窗位是什么？",
  "心动周期分几个时相？",
];

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

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const TIP_TEXT = "让我们一起保护我们的心脏，无聊可以点点我";
const TIP_HIDE_MS = 7000;
const IDLE_PEEK_MS = 45000;
const PEEK_RETURN_MS = 520;

const OFFSET_KEY = "anatomy-sketch-assistant-offset";
const DRAG_MARGIN = 8;
const DRAG_THRESHOLD = 6;

interface Offset {
  dx: number;
  dy: number;
}

function savedOffset(): Offset {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    if (!raw) return { dx: 0, dy: 0 };
    const parsed = JSON.parse(raw) as Partial<Offset>;
    if (Number.isFinite(parsed.dx) && Number.isFinite(parsed.dy)) {
      return { dx: parsed.dx!, dy: parsed.dy! };
    }
  } catch {
    // 存储不可用时回到默认角落。
  }
  return { dx: 0, dy: 0 };
}

function persistOffset(offset: Offset) {
  try {
    localStorage.setItem(OFFSET_KEY, JSON.stringify(offset));
  } catch {
    // 只影响下次进站的位置记忆。
  }
}

const PANEL_WIDTH_KEY = "anatomy-sketch-assistant-width";
const PANEL_WIDTH_DEFAULT = 480;
const PANEL_WIDTH_MIN = 320;
const PANEL_WIDTH_MAX = 760;
const PANEL_WIDTH_STEP = 32;
const PANEL_HEIGHT_KEY = "anatomy-sketch-assistant-height";
const PANEL_HEIGHT_DEFAULT = 544;
const PANEL_HEIGHT_MIN = 460;
const PANEL_HEIGHT_STEP = 24;
const SOURCE_REVEAL_MS = 300;

function clampPanelWidth(value: number): number {
  let max = PANEL_WIDTH_MAX;
  try {
    max = Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, window.innerWidth - 32));
  } catch {
    // 取不到视口时按默认上限。
  }
  return Math.round(Math.min(Math.max(value, PANEL_WIDTH_MIN), max));
}

function savedPanelWidth(): number | null {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? clampPanelWidth(value) : null;
  } catch {
    return null;
  }
}

function panelHeightCeiling(launcherHeight = 0): number {
  let viewport = 900;
  let reserved = 216;
  try {
    viewport = window.innerHeight;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    reserved = Math.max(launcherHeight + 28, (Number.isFinite(rem) && rem > 0 ? rem : 16) * 13.5);
  } catch {
    // 取不到视口时按保守预留。
  }
  return Math.max(PANEL_HEIGHT_MIN, Math.round(viewport - reserved));
}

function clampPanelHeight(value: number, launcherHeight = 0): number {
  return Math.round(
    Math.min(Math.max(value, PANEL_HEIGHT_MIN), panelHeightCeiling(launcherHeight)),
  );
}

function savedPanelHeight(): number | null {
  try {
    const raw = localStorage.getItem(PANEL_HEIGHT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? clampPanelHeight(value) : null;
  } catch {
    return null;
  }
}

export function AssistantPanel({
  focus,
  ct,
  structureCount,
  onOpenChange,
  onWidthChange,
}: {
  focus: StructureRecord | null;
  ct?: CtContext | null;
  structureCount?: number;
  onOpenChange?: (open: boolean) => void;
  onWidthChange?: (width: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [nodding, setNodding] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [peekShift, setPeekShift] = useState(0);
  const [idleStamp, setIdleStamp] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => [welcomeTurn(structureCount)]);
  const [conversationId] = useState(newConversationId);
  const abortRef = useRef<AbortController | null>(null);
  const revealTimer = useRef<number | null>(null);
  const sourceTimer = useRef<number | null>(null);
  const stopRevealRef = useRef<(() => void) | null>(null);
  const turnSeq = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Offset>(savedOffset);
  const offsetRef = useRef(offset);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    rect: DOMRect | null;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const nodTimer = useRef<number | null>(null);
  const peekOpenTimer = useRef<number | null>(null);
  const wasOpen = useRef(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(savedPanelWidth);
  const widthRef = useRef<number | null>(panelWidth);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(savedPanelHeight);
  const heightRef = useRef<number | null>(panelHeight);
  const heightResizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const openChangeRef = useRef(onOpenChange);
  const widthChangeRef = useRef(onWidthChange);

  const clampToViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    let { dx, dy } = offsetRef.current;
    if (rect.left < DRAG_MARGIN) dx += DRAG_MARGIN - rect.left;
    else if (rect.right > window.innerWidth - DRAG_MARGIN) {
      dx += window.innerWidth - DRAG_MARGIN - rect.right;
    }
    if (rect.top < DRAG_MARGIN) dy += DRAG_MARGIN - rect.top;
    else if (rect.bottom > window.innerHeight - DRAG_MARGIN) {
      dy += window.innerHeight - DRAG_MARGIN - rect.bottom;
    }
    if (dx === offsetRef.current.dx && dy === offsetRef.current.dy) return;
    const next = { dx, dy };
    offsetRef.current = next;
    setOffset(next);
    persistOffset(next);
  }, []);

  useLayoutEffect(() => {
    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [clampToViewport]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      clampToViewport();
      const current = heightRef.current;
      if (current !== null) {
        const next = clampPanelHeight(
          current,
          launcherRef.current?.getBoundingClientRect().height ?? 0,
        );
        if (next !== current) {
          heightRef.current = next;
          setPanelHeight(next);
        }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, clampToViewport]);

  useEffect(() => {
    function handleResize() {
      const current = heightRef.current;
      if (current === null) return;
      const next = clampPanelHeight(
        current,
        launcherRef.current?.getBoundingClientRect().height ?? 0,
      );
      if (next !== current) {
        heightRef.current = next;
        setPanelHeight(next);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    openChangeRef.current = onOpenChange;
    widthChangeRef.current = onWidthChange;
  });

  useEffect(() => {
    openChangeRef.current?.(open);
  }, [open]);

  useEffect(() => {
    widthChangeRef.current?.(panelWidth);
  }, [panelWidth]);

  useEffect(() => {
    if (!tipOpen) return;
    const timer = window.setTimeout(() => setTipOpen(false), TIP_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [tipOpen]);

  // 长时间没被搭理时，小心按当前位置滑到视口下缘，只露头等用户来点。
  useEffect(() => {
    if (open || dragging || peeking) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      const el = launcherRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const visible = Math.max(28, Math.round(rect.height * 0.36));
      const shift = Math.round(window.innerHeight - rect.top - visible);
      if (shift <= 0) return;
      setPeekShift(shift);
      setPeeking(true);
    }, IDLE_PEEK_MS);
    return () => window.clearTimeout(timer);
  }, [open, dragging, peeking, idleStamp]);

  useEffect(() => {
    if (!peeking) return;
    function restore() {
      setPeeking(false);
    }
    window.addEventListener("resize", restore);
    return () => window.removeEventListener("resize", restore);
  }, [peeking]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, open]);

  useEffect(
    () => () => {
      stopRevealRef.current?.();
      if (sourceTimer.current !== null) {
        window.clearInterval(sourceTimer.current);
        sourceTimer.current = null;
      }
      abortRef.current?.abort();
      if (nodTimer.current !== null) {
        window.clearTimeout(nodTimer.current);
        nodTimer.current = null;
      }
      if (peekOpenTimer.current !== null) {
        window.clearTimeout(peekOpenTimer.current);
        peekOpenTimer.current = null;
      }
    },
    [],
  );

  function noteActivity() {
    setIdleStamp((value) => value + 1);
  }

  function playNod() {
    if (nodTimer.current !== null) window.clearTimeout(nodTimer.current);
    setNodding(true);
    nodTimer.current = window.setTimeout(() => {
      setNodding(false);
      nodTimer.current = null;
    }, 560);
  }

  function applyPanelWidth(next: number) {
    const value = clampPanelWidth(next);
    widthRef.current = value;
    setPanelWidth(value);
  }

  function savePanelWidth() {
    try {
      if (widthRef.current !== null) {
        localStorage.setItem(PANEL_WIDTH_KEY, String(widthRef.current));
      }
    } catch {
      // 存储不可用时只影响下次进站的宽度记忆。
    }
  }

  function applyPanelHeight(next: number) {
    const value = clampPanelHeight(next, launcherRef.current?.getBoundingClientRect().height ?? 0);
    heightRef.current = value;
    setPanelHeight(value);
  }

  function savePanelHeight() {
    try {
      if (heightRef.current !== null) {
        localStorage.setItem(PANEL_HEIGHT_KEY, String(heightRef.current));
      }
    } catch {
      // 存储不可用时只影响下次进站的高度记忆。
    }
  }

  // 按住小心拖动整组（气泡、面板跟着走）；位移限制在视口内并记忆到 localStorage。
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    noteActivity();
    suppressClickRef.current = false;
    const rect = containerRef.current?.getBoundingClientRect() ?? null;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseDx: offsetRef.current.dx,
      baseDy: offsetRef.current.dy,
      rect,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 合成指针或旧浏览器不支持捕获时，仍按普通指针事件拖动。
    }
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const rawDx = event.clientX - drag.startX;
    const rawDy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      setDragging(true);
      if (peeking) setPeeking(false);
    }
    drag.moved = true;
    const lean = Math.max(-7, Math.min(7, rawDx / 14));
    event.currentTarget.style.setProperty("--assistant-lean", `${lean.toFixed(1)}deg`);
    let dx = drag.baseDx + rawDx;
    let dy = drag.baseDy + rawDy;
    const rect = drag.rect;
    if (rect && (rect.width || rect.height)) {
      const left = rect.left + (dx - drag.baseDx);
      const right = rect.right + (dx - drag.baseDx);
      const top = rect.top + (dy - drag.baseDy);
      const bottom = rect.bottom + (dy - drag.baseDy);
      if (left < DRAG_MARGIN) dx += DRAG_MARGIN - left;
      else if (right > window.innerWidth - DRAG_MARGIN) {
        dx += window.innerWidth - DRAG_MARGIN - right;
      }
      if (top < DRAG_MARGIN) dy += DRAG_MARGIN - top;
      else if (bottom > window.innerHeight - DRAG_MARGIN) {
        dy += window.innerHeight - DRAG_MARGIN - bottom;
      }
    }
    offsetRef.current = { dx, dy };
    setOffset({ dx, dy });
    event.preventDefault();
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略。
    }
    if (!drag.moved) return;
    setDragging(false);
    event.currentTarget.style.removeProperty("--assistant-lean");
    suppressClickRef.current = true;
    persistOffset(offsetRef.current);
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !panelRef.current) return;
    event.preventDefault();
    resizeRef.current = {
      startX: event.clientX,
      startWidth: panelRef.current.getBoundingClientRect().width,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 合成指针无法捕获时退回普通拖动。
    }
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const start = resizeRef.current;
    if (!start) return;
    applyPanelWidth(start.startWidth + (start.startX - event.clientX));
  }

  function endResize(event: PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略。
    }
    savePanelWidth();
  }

  function resizeByKey(event: KeyboardEvent<HTMLDivElement>) {
    const measured = panelRef.current?.getBoundingClientRect().width ?? 0;
    const current = widthRef.current ?? (measured > 0 ? measured : PANEL_WIDTH_DEFAULT);
    let next: number;
    if (event.key === "ArrowLeft") next = current + PANEL_WIDTH_STEP;
    else if (event.key === "ArrowRight") next = current - PANEL_WIDTH_STEP;
    else if (event.key === "Home") next = PANEL_WIDTH_MIN;
    else if (event.key === "End") next = PANEL_WIDTH_MAX;
    else return;
    event.preventDefault();
    applyPanelWidth(next);
    savePanelWidth();
  }

  function startHeightResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !panelRef.current) return;
    event.preventDefault();
    heightResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panelRef.current.getBoundingClientRect().height,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 合成指针无法捕获时退回普通拖动。
    }
  }

  function moveHeightResize(event: PointerEvent<HTMLDivElement>) {
    const start = heightResizeRef.current;
    if (start?.pointerId !== event.pointerId) return;
    applyPanelHeight(start.startHeight + (start.startY - event.clientY));
  }

  function endHeightResize(event: PointerEvent<HTMLDivElement>) {
    if (!heightResizeRef.current) return;
    heightResizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略。
    }
    savePanelHeight();
  }

  function resizeHeightByKey(event: KeyboardEvent<HTMLDivElement>) {
    const measured = panelRef.current?.getBoundingClientRect().height ?? 0;
    const current = heightRef.current ?? (measured > 0 ? measured : PANEL_HEIGHT_DEFAULT);
    let next: number;
    if (event.key === "ArrowUp") next = current + PANEL_HEIGHT_STEP;
    else if (event.key === "ArrowDown") next = current - PANEL_HEIGHT_STEP;
    else if (event.key === "Home") next = PANEL_HEIGHT_MIN;
    else if (event.key === "End") {
      next = panelHeightCeiling(launcherRef.current?.getBoundingClientRect().height ?? 0);
    } else return;
    event.preventDefault();
    applyPanelHeight(next);
    savePanelHeight();
  }

  function update(id: string, patch: Partial<Turn>) {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }

  async function submit(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    if (sourceTimer.current !== null) {
      window.clearInterval(sourceTimer.current);
      sourceTimer.current = null;
    }
    turnSeq.current += 1;
    const assistantId = `assistant-${turnSeq.current}`;
    const history = turns
      .filter((turn) => turn.id !== "welcome" && !turn.pending && !turn.failed)
      .slice(-6)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    setTurns((prev) => [
      ...prev.map((turn) =>
        turn.role === "assistant" &&
        turn.visibleSources !== undefined &&
        turn.visibleSources < turn.sources.length
          ? { ...turn, visibleSources: turn.sources.length }
          : turn,
      ),
      { id: `user-${assistantId}`, role: "user", text, sources: [], degraded: false },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        sources: [],
        degraded: false,
        pending: true,
        ask: text,
      },
    ]);
    setInput("");
    setBusy(true);
    setNotice("正在检索资料…");
    const controller = new AbortController();
    abortRef.current = controller;
    let streamed = "";
    let pending = "";
    let shown = "";
    let finished = false;
    let sourceTotal = 0;
    let sourceShown = 0;
    const stopSources = () => {
      if (sourceTimer.current !== null) {
        window.clearInterval(sourceTimer.current);
        sourceTimer.current = null;
      }
    };
    const revealSource = () => {
      if (sourceShown >= sourceTotal) {
        stopSources();
        return;
      }
      sourceShown += 1;
      update(assistantId, { visibleSources: sourceShown });
      if (sourceShown >= sourceTotal) stopSources();
    };
    const startSources = () => {
      if (sourceTimer.current !== null || sourceTotal === 0 || sourceShown > 0) return;
      revealSource();
      if (sourceShown < sourceTotal) {
        sourceTimer.current = window.setInterval(revealSource, SOURCE_REVEAL_MS);
      }
    };
    let resolveDrain: (() => void) | null = null;
    const drained = new Promise<void>((resolve) => {
      resolveDrain = resolve;
    });
    let revealStarted = 0;
    // 网关或中间代理可能把整段 SSE 一次性交给浏览器；按积压自适应逐字放出，
    // 让任何链路上都能看到"正在生成"的过程，而不是整段瞬现。
    // 后台标签页的定时器会被节流，超过 6 秒也直接铺完，避免队列拖住下一次提问。
    const stopReveal = () => {
      if (revealTimer.current !== null) {
        window.clearInterval(revealTimer.current);
        revealTimer.current = null;
      }
      resolveDrain?.();
      resolveDrain = null;
    };
    const reveal = () => {
      if (pending) {
        const flush = document.hidden || performance.now() - revealStarted > 6000;
        const take = flush
          ? pending.length
          : pending.length > 240
            ? 12
            : pending.length > 120
              ? 6
              : pending.length > 48
                ? 3
                : pending.length > 8
                  ? 2
                  : 1;
        shown += pending.slice(0, take);
        pending = pending.slice(take);
        update(assistantId, { text: shown });
      }
      if (finished && !pending) stopReveal();
    };
    const startReveal = () => {
      if (revealTimer.current !== null) return;
      revealStarted = performance.now();
      revealTimer.current = window.setInterval(reveal, 20);
    };
    stopRevealRef.current = stopReveal;
    const smooth = !prefersReducedMotion();
    try {
      const answer = await askAssistant({
        text,
        conversationId,
        focus: focus?.id,
        ct: ct ?? undefined,
        history,
        signal: controller.signal,
        onMeta: (sources, mode) => {
          sourceTotal = sources.length;
          update(assistantId, { sources, mode, visibleSources: 0 });
          setNotice("正在作答…");
        },
        onDelta: (chunk) => {
          streamed += chunk;
          if (!smooth) {
            update(assistantId, { text: streamed });
            return;
          }
          pending += chunk;
          startReveal();
        },
      });
      if (smooth) {
        finished = true;
        if (!pending) stopReveal();
        await drained;
      }
      update(assistantId, { pending: false, degraded: answer.degraded });
      setNotice("回答完成");
      startSources();
    } catch (error) {
      stopReveal();
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
      if (sourceTotal > 0 && !aborted) update(assistantId, { visibleSources: sourceTotal });
    } finally {
      stopReveal();
      stopRevealRef.current = null;
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
    <div
      className="assistant"
      ref={containerRef}
      style={
        offset.dx !== 0 || offset.dy !== 0
          ? { transform: `translate(${offset.dx}px, ${offset.dy}px)` }
          : undefined
      }
      onKeyDown={handleKeyDown}
    >
      {open && (
        <section
          id="assistant-panel"
          ref={panelRef}
          className="assistant-panel"
          aria-label="小心 · 心脏学习助手"
          style={
            panelWidth === null && panelHeight === null
              ? undefined
              : ({
                  ...(panelWidth !== null ? { "--assistant-width": `${panelWidth}px` } : {}),
                  ...(panelHeight !== null ? { "--assistant-height": `${panelHeight}px` } : {}),
                } as CSSProperties)
          }
        >
          <div
            className="assistant-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="拖动或在聚焦后按左右方向键调整小心面板宽度"
            aria-valuemin={PANEL_WIDTH_MIN}
            aria-valuemax={PANEL_WIDTH_MAX}
            aria-valuenow={panelWidth ?? PANEL_WIDTH_DEFAULT}
            tabIndex={0}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onKeyDown={resizeByKey}
          />
          <div
            className="assistant-resizer assistant-resizer-top"
            role="separator"
            aria-orientation="horizontal"
            aria-label="拖动或在聚焦后按上下方向键调整小心面板高度"
            aria-valuemin={PANEL_HEIGHT_MIN}
            aria-valuemax={panelHeightCeiling()}
            aria-valuenow={panelHeight ?? PANEL_HEIGHT_DEFAULT}
            tabIndex={0}
            onPointerDown={startHeightResize}
            onPointerMove={moveHeightResize}
            onPointerUp={endHeightResize}
            onPointerCancel={endHeightResize}
            onKeyDown={resizeHeightByKey}
          />
          <header className="assistant-head">
            <img className="assistant-avatar" src={xiaoxinFace} alt="" width={40} height={40} />
            <div className="assistant-identity">
              <h2>小心</h2>
              <p className="assistant-sub">
                心脏学习助手 · 范围：心脏解剖、心血管生理、常见病概念与 CT 基础 · 基于公开资料检索 ·
                不提供医疗建议
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
            {turns.map((turn) => {
              if (turn.role === "user") {
                return (
                  <p key={turn.id} className="assistant-bubble user">
                    {turn.text}
                  </p>
                );
              }
              const visibleSources = turn.visibleSources ?? turn.sources.length;
              return (
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
                  {turn.degraded && <p className="assistant-badge">资料摘录 · AI 暂不可用</p>}
                  {turn.failed && turn.ask && (
                    <button
                      type="button"
                      className="assistant-retry"
                      disabled={busy}
                      onClick={() => void submit(turn.ask ?? "")}
                    >
                      重试这个问题
                    </button>
                  )}
                  {turn.sources.length > 0
                    ? !turn.pending &&
                      visibleSources > 0 && (
                        <ol className="assistant-sources">
                          {turn.sources.slice(0, visibleSources).map((source) => (
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
                      )
                    : turn.id !== "welcome" &&
                      !turn.pending &&
                      !turn.failed && <p className="assistant-nosource">本次未使用外部资料</p>}
                </div>
              );
            })}
          </div>

          <p className="visually-hidden" role="status">
            {notice}
          </p>

          {turns.length <= 1 && (
            <div className="assistant-chips" aria-label="示例问题">
              {(ct ? [...SUGGESTIONS, "当前 CT 这一层有哪些结构？"] : SUGGESTIONS).map(
                (question) => (
                  <button
                    key={question}
                    type="button"
                    className="chip"
                    disabled={busy}
                    onClick={() => void submit(question)}
                  >
                    {question}
                  </button>
                ),
              )}
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

      {tipOpen && !open && (
        <div className="assistant-tip" role="note">
          <p className="assistant-tip-text">{TIP_TEXT}</p>
          <button
            type="button"
            className="assistant-tip-close"
            aria-label="关掉这条提示"
            onClick={() => setTipOpen(false)}
          >
            ×
          </button>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        className={`assistant-launcher${dragging ? " is-dragging" : ""}${nodding ? " is-nodding" : ""}${
          peeking ? " is-peeking" : ""
        }`}
        style={peeking ? ({ "--assistant-peek": `${peekShift}px` } as CSSProperties) : undefined}
        aria-expanded={open}
        aria-controls={open ? "assistant-panel" : undefined}
        onPointerDown={startDrag}
        onPointerEnter={noteActivity}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          noteActivity();
          setTipOpen(false);
          if (peeking) {
            playNod();
            setPeeking(false);
            if (peekOpenTimer.current !== null) window.clearTimeout(peekOpenTimer.current);
            peekOpenTimer.current = window.setTimeout(() => {
              peekOpenTimer.current = null;
              setOpen(true);
            }, PEEK_RETURN_MS);
            return;
          }
          if (!open) playNod();
          setOpen((value) => !value);
        }}
      >
        <span className="assistant-launcher-body" aria-hidden="true">
          <img
            src={xiaoxinSit}
            alt=""
            width={364}
            height={560}
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="visually-hidden">{open ? "收起小心" : "问问小心"}</span>
      </button>
    </div>
  );
}
