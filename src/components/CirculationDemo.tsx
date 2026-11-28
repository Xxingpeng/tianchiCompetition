import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  CHAMBER_CYCLE_MS,
  CHAMBER_PHASES,
  CHAMBER_PHASE_TEXT,
  type ChamberPhaseId,
} from "../data/chambers";
import {
  DEOXY_BLOOD,
  FOCUS_COPY,
  HEART_ASSET_NOTE,
  HEART_NOTE,
  OXY_BLOOD,
  PLAYBACK_SPEEDS,
  type SceneFocus,
} from "../data/heartScene";

const HeartScene = lazy(() => import("./HeartScene"));

interface Props {
  onClose: () => void;
}

type ValveState = "open" | "closed" | "opening";

const VALVE_STATE: Record<ChamberPhaseId, { av: ValveState; semi: ValveState }> = {
  fill: { av: "open", semi: "closed" },
  atrial: { av: "open", semi: "closed" },
  closing: { av: "closed", semi: "closed" },
  eject: { av: "closed", semi: "open" },
  relax: { av: "opening", semi: "closed" },
};

const VALVE_WORD: Record<ValveState, string> = {
  open: "开放",
  closed: "关闭",
  opening: "即将开放",
};

const VIEWS: readonly SceneFocus[] = ["overview", "left", "right"];

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/** 全屏 3D 演示的外壳：负责对话可访问性、心动周期控制与剖面刀。 */
export function CirculationDemo({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [phaseId, setPhaseId] = useState<ChamberPhaseId>("fill");
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [speed, setSpeed] = useState<number>(1);
  const [open, setOpen] = useState(0);
  const [focus, setFocus] = useState<SceneFocus>("overview");
  const [seek, setSeek] = useState({ ms: 0, token: 0 });
  const [restartToken, setRestartToken] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);

  const handlePhaseChange = useCallback((next: ChamberPhaseId) => {
    setPhaseId(next);
  }, []);

  function seekTo(index: number): void {
    const target = CHAMBER_PHASES[index];
    if (!target) return;
    setPhaseId(target.id);
    setSeek((current) => ({ ms: target.start * CHAMBER_CYCLE_MS, token: current.token + 1 }));
  }

  function replay(): void {
    setPhaseId("fill");
    setSeek((current) => ({ ms: 0, token: current.token + 1 }));
    setRestartToken((token) => token + 1);
    setPlaying(true);
  }

  function chooseFocus(next: SceneFocus): void {
    setFocus(next);
    if (next !== "overview") setOpen((current) => Math.max(current, 0.72));
  }

  function toggleCut(): void {
    setOpen((current) => (current > 0.6 ? 0 : 0.86));
  }

  const phaseIndex = Math.max(
    0,
    CHAMBER_PHASES.findIndex((item) => item.id === phaseId),
  );
  const phase = CHAMBER_PHASE_TEXT[phaseId];
  const valve = VALVE_STATE[phaseId];
  const valveWord = VALVE_WORD;
  const openPercent = Math.round(open * 100);
  const focusCopy = FOCUS_COPY[focus];

  return (
    <div
      className="circulation"
      role="dialog"
      aria-modal="true"
      aria-labelledby="circ-heading"
      aria-describedby="circ-copy"
    >
      <header className="circ-head">
        <div>
          <p className="eyebrow">3D 演示 · 肺循环 + 体循环</p>
          <h2 id="circ-heading">心脏怎样把血泵向全身</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="circ-close"
          onClick={() => onCloseRef.current()}
        >
          关闭演示 <span className="circ-esc">Esc</span>
        </button>
      </header>

      <div className="circ-main">
        <figure className="circ-figure" aria-labelledby="circ-heading">
          <Suspense
            fallback={
              <div className="heart-scene">
                <p role="status" className="heart-scene-status">
                  正在准备 3D 心脏…
                </p>
              </div>
            }
          >
            <HeartScene
              playing={playing}
              speed={speed}
              openAmount={open}
              focus={focus}
              seekMs={seek.ms}
              seekToken={seek.token}
              restartToken={restartToken}
              onPhaseChange={handlePhaseChange}
            />
          </Suspense>
          <figcaption className="visually-hidden">
            3D
            心脏模型：从前方看，右心在画面左侧，左心在画面右侧。拖动剖面刀从前壁向后切开，可以看到四腔、瓣膜与心腔内的血流。蓝色粒子表示含氧较低的血，鲜红粒子表示含氧较高的血。
          </figcaption>
        </figure>

        <div className="hc-toolbar">
          <div className="hc-toolbar-row">
            <span className="hc-toolbar-label">视角</span>
            <div className="hc-focus" role="group" aria-label="观察视角">
              {VIEWS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={focus === id}
                  onClick={() => chooseFocus(id)}
                >
                  {FOCUS_COPY[id].label}
                </button>
              ))}
            </div>
            <button type="button" className="hc-cut-btn" onClick={toggleCut}>
              {open > 0.6 ? "合上心脏" : "打开心脏"}
            </button>
          </div>
          <label className="hc-knife">
            <span className="hc-toolbar-label">剖面刀</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={openPercent}
              onChange={(event) => setOpen(Number(event.target.value) / 100)}
              aria-label="剖面刀：从心脏前壁向后切开"
              aria-valuetext={openPercent === 0 ? "合上" : `已切开 ${openPercent}%`}
            />
            <span className="hc-knife-value">{openPercent === 0 ? "合上" : `${openPercent}%`}</span>
          </label>
          <p className="hc-toolbar-hint">拖拽旋转 · 滚轮缩放 · 切开前壁看心腔</p>
        </div>

        <div className="circ-legend">
          <span>
            <i style={{ backgroundColor: DEOXY_BLOOD }} />
            蓝色 · 含氧较低
          </span>
          <span>
            <i style={{ backgroundColor: OXY_BLOOD }} />
            鲜红 · 含氧较高
          </span>
        </div>

        <div className="circ-copy" id="circ-copy">
          <p className="circ-step">
            心动周期 {phaseIndex + 1} / {CHAMBER_PHASES.length} · {phase.label}
          </p>
          <h3>{phase.heading}</h3>
          <p>{phase.detail}</p>
          <div className="hc-valves">
            <span className={`is-${valve.av}`}>
              <i />
              房室瓣 {valveWord[valve.av]}
            </span>
            <span className={`is-${valve.semi}`}>
              <i />
              半月瓣 {valveWord[valve.semi]}
            </span>
          </div>
          <div className="ch-cycle" aria-hidden="true">
            {CHAMBER_PHASES.map((item) => (
              <span
                key={item.id}
                className={item.id === phaseId ? "is-on" : undefined}
                style={{ flexGrow: item.end - item.start, flexBasis: 0 }}
              />
            ))}
          </div>
          <p className="hc-path">
            <strong>{focusCopy.label}</strong>
            {focusCopy.path}
          </p>
          {openPercent < 30 && (
            <p className="hc-cut-hint">
              拖动「剖面刀」从前壁向后切开，就能看到四腔、瓣膜和心腔里的血流。
            </p>
          )}
        </div>
      </div>

      <footer className="circ-foot">
        <ol className="circ-steps">
          {CHAMBER_PHASES.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === phaseId ? "step" : undefined}
                onClick={() => seekTo(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {CHAMBER_PHASE_TEXT[item.id].label}
              </button>
            </li>
          ))}
        </ol>
        <div className="circ-controls">
          <button type="button" className="circ-play" onClick={() => setPlaying((on) => !on)}>
            {playing ? "暂停" : "播放"}
          </button>
          <button type="button" className="circ-replay" onClick={replay}>
            重播
          </button>
          <div className="circ-speeds" role="group" aria-label="播放速度">
            {PLAYBACK_SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={speed === value}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <p className="circ-note">
            {HEART_NOTE}；{HEART_ASSET_NOTE}
          </p>
        </div>
      </footer>
    </div>
  );
}
