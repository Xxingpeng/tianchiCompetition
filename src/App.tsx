import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { CirculationDemo } from "./components/CirculationDemo";
import { CtViewer } from "./components/CtViewer";
import { InfoCard } from "./components/InfoCard";
import { TriView } from "./components/TriView";
import { CatalogError, loadCatalog, selectableStructures } from "./data/catalog";
import { buildCtContext } from "./data/ct";
import type { Catalog, StructureRecord } from "./types";
import "./styles.css";
import "./circulation.css";

// Three.js 有 600 多 KB，只有真正看 3D 时才需要，所以按需加载，首屏 JS 保持在 200 多 KB。
const HeartModel = lazy(() =>
  import("./components/HeartModel").then((module) => ({ default: module.HeartModel })),
);

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; problems: string[] }
  | { kind: "ready"; catalog: Catalog };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((catalog) => {
        if (!cancelled) setState({ kind: "ready", catalog });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
          problems: error instanceof CatalogError ? error.problems : [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <header className="site-header">
        <h1>解剖智绘</h1>
      </header>

      <main id="main" className="scene-main">
        {state.kind === "loading" && <p role="status">正在载入结构目录…</p>}

        {state.kind === "error" && (
          <div role="alert">
            <h2>目录载入失败</h2>
            <p>{state.message}</p>
            {state.problems.length > 0 && (
              <ul>
                {state.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.kind === "ready" && <Browser catalog={state.catalog} />}
      </main>

      <footer className="site-footer">
        {state.kind === "ready" && (
          <ul className="notices">
            {state.catalog.notices
              .filter((notice) => !notice.includes("BodyParts3D"))
              .map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
          </ul>
        )}
      </footer>
    </div>
  );
}

function Browser({ catalog }: { catalog: Catalog }) {
  const structures = useMemo(() => selectableStructures(catalog), [catalog]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [everSelected, setEverSelected] = useState(false);
  const [triOpen, setTriOpen] = useState(true);
  const [ctOpen, setCtOpen] = useState(false);
  const [circOpen, setCircOpen] = useState(false);
  const ctCloseRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const selected = structures.find((s) => s.id === selectedId) ?? null;
  const ct = catalog.ct;
  // 授权说明挪到展签底部，像美术馆的「藏品来源」；页脚只留用途声明。
  const attribution = catalog.notices.find((notice) => notice.includes("BodyParts3D")) ?? null;
  const [ctIndex, setCtIndex] = useState(() => {
    const first = structures[0]?.id;
    return ct && first ? (ct.best_slice[first] ?? 0) : 0;
  });
  const [ctWindowId, setCtWindowId] = useState(() => ct?.default_window ?? "mediastinal");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [dockQuery, setDockQuery] = useState("");
  const [turn, setTurn] = useState<{ id: string; token: number } | null>(null);
  const turnTokenRef = useRef(0);
  const composingRef = useRef(false);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 小心与信息卡并排：宽屏时把信息卡让到小心左侧；放不下时收回信息卡，避免互相遮挡。
  // 除小心自身宽度外，还要留出信息卡（24rem）和一块可看的心脏（约 30rem）。
  const assistantShift = assistantOpen && (assistantWidth ?? 480) + 860 <= viewportWidth;

  function selectStructure(id: string, keepCtLayer = false, syncQuery = true): void {
    setSelectedId(id);
    setEverSelected(true);
    const picked = structures.find((structure) => structure.id === id);
    // 从名称搜索选中时保留用户输入，避免把刚打进框里的字覆盖成编号。
    if (picked && syncQuery) setDockQuery(String(picked.label));
    if (!keepCtLayer && ct) {
      const best = ct.best_slice[id];
      if (typeof best === "number") setCtIndex(best);
    }
  }

  function openCt(): void {
    if (!selected) {
      const first = structures[0];
      if (!first) return;
      selectStructure(first.id);
    }
    setCtOpen(true);
  }

  /** 从展签或搜索框点选：除了选中，还让 3D 把该部件转到正面并打光。 */
  function selectFromIndex(id: string, syncQuery = true): void {
    turnTokenRef.current += 1;
    setTurn({ id, token: turnTokenRef.current });
    selectStructure(id, false, syncQuery);
  }

  /** 横线搜索框：单个数字按冻结编号直选，其余按中文名/英文名包含匹配。 */
  function searchDock(value: string): void {
    setDockQuery(value);
    const trimmed = value.trim();
    if (!trimmed) return;
    if (/^\d$/.test(trimmed)) {
      const match = structures.find((structure) => structure.label === Number(trimmed));
      if (match) selectFromIndex(match.id, false);
      return;
    }
    const needle = trimmed.toLowerCase();
    const exact = structures.find(
      (structure) =>
        structure.name.toLowerCase() === needle || structure.en_name.toLowerCase() === needle,
    );
    const match =
      exact ??
      structures.find(
        (structure) =>
          structure.name.toLowerCase().includes(needle) ||
          structure.en_name.toLowerCase().includes(needle),
      );
    if (match) selectFromIndex(match.id, false);
  }

  function closeDetail(): void {
    setSelectedId(null);
    setDockQuery("");
    setCtOpen(false);
    setTriOpen(true);
  }

  const ctContext = useMemo(
    () => (ct && selected ? buildCtContext(ct, ctIndex, ctWindowId, selected) : null),
    [ct, ctIndex, ctWindowId, selected],
  );

  useEffect(() => {
    if (catalog.excluded.length > 0) {
      console.warn(
        "目录中被排除的结构（几何或许可不达标）：",
        catalog.excluded.map((e) => `${e.id}：${e.reason}`),
      );
    }
  }, [catalog]);

  useEffect(() => {
    if (!ctOpen) return;
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => ctCloseRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setCtOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      lastFocusRef.current?.focus();
    };
  }, [ctOpen]);

  return (
    <div
      className={`scene-shell${selected ? " has-detail" : ""}${ctOpen ? " ct-open" : ""}${
        assistantOpen ? " assistant-open" : ""
      }${assistantOpen ? (assistantShift ? " assistant-shift" : " assistant-hide") : ""}`}
      style={
        {
          "--assistant-live-width": `${assistantWidth ?? 480}px`,
        } as CSSProperties
      }
    >
      <section className="scene-heart" aria-label="心脏三维模型">
        <Suspense
          fallback={
            <section className="heart-viewer">
              <h2>心脏整体形态</h2>
              <p role="status">正在准备 3D 视图…</p>
            </section>
          }
        >
          <HeartModel
            structures={structures}
            selectedId={selectedId}
            hintDismissed={everSelected}
            turn={turn}
            onSelect={(structure) => selectStructure(structure.id)}
          />
        </Suspense>
      </section>

      <aside className="scene-dock placard" aria-labelledby="placard-heading">
        <h2 id="placard-heading" className="visually-hidden">
          结构索引
        </h2>
        <input
          className="placard-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="如：左心室 / left ventricle / LV"
          aria-label="按编号或名称查找结构"
          value={dockQuery}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            searchDock(event.currentTarget.value);
          }}
          onChange={(event) => {
            if (composingRef.current) setDockQuery(event.target.value);
            else searchDock(event.target.value);
          }}
        />
        <ul className="placard-index">
          {structures.map((s) => (
            <li key={s.id}>
              <PlacardRow
                structure={s}
                active={s.id === selectedId}
                onPick={(id) => selectFromIndex(id)}
              />
            </li>
          ))}
        </ul>
        {catalog.excluded.length > 0 && (
          <p className="placard-note">
            未纳入：{catalog.excluded.map((e) => `${e.id}（${e.reason}）`).join("；")}
          </p>
        )}
        {attribution && <p className="placard-source">{attribution}</p>}
      </aside>

      {!selected && (
        <div className="scene-actions">
          <button
            type="button"
            className="ct-cta ct-primary"
            aria-controls={ctOpen ? "ct-drawer" : undefined}
            aria-expanded={ctOpen}
            onClick={openCt}
            disabled={!ct}
          >
            <span>看 CT</span>
            <span className="ct-cta-sub">
              {ct ? `${ct.slice_count} 层 · 纵隔窗 / 肺窗` : "CT 资产未载入"}
            </span>
          </button>
          <button
            type="button"
            className="ct-cta circulation-cta"
            aria-haspopup="dialog"
            onClick={() => setCircOpen(true)}
          >
            <span>看血液循环</span>
            <span className="ct-cta-sub">肺循环 + 体循环 · 含氧血去向</span>
          </button>
        </div>
      )}

      {selected && (
        <aside className="detail-panel" aria-labelledby="detail-heading">
          <div className="detail-head">
            <div>
              <p className="eyebrow">当前结构</p>
              <h2 id="detail-heading" className="visually-hidden">
                结构详情
              </h2>
            </div>
            <button
              type="button"
              className="detail-close"
              aria-label="关闭结构说明"
              onClick={closeDetail}
            >
              ×
            </button>
          </div>

          <InfoCard structure={selected} />

          <div className="detail-actions">
            <button
              type="button"
              className="ct-cta detail-cta"
              aria-controls={ctOpen ? "ct-drawer" : undefined}
              aria-expanded={ctOpen}
              onClick={openCt}
              disabled={!ct}
            >
              <span>看 CT</span>
              <span className="ct-cta-sub">从 {selected.name} 最密层开始</span>
            </button>
            <button
              type="button"
              className="circ-link"
              aria-haspopup="dialog"
              onClick={() => setCircOpen(true)}
            >
              看血液循环 <span>肺循环 + 体循环</span>
            </button>
          </div>

          <div className="tri-disclosure">
            <button
              type="button"
              className="tri-toggle"
              aria-expanded={triOpen}
              aria-controls={triOpen ? "tri-panel" : undefined}
              onClick={() => setTriOpen((open) => !open)}
            >
              三视图示意切面
              <span>{triOpen ? "收起" : "展开"}</span>
            </button>
            {triOpen && (
              <div id="tri-panel">
                <TriView structure={selected} />
              </div>
            )}
          </div>
        </aside>
      )}

      {ct && selected && ctOpen && (
        <>
          <div className="ct-backdrop" aria-hidden="true" onClick={() => setCtOpen(false)} />
          <aside
            className="ct-drawer"
            id="ct-drawer"
            role="dialog"
            aria-labelledby="ct-drawer-heading"
          >
            <div className="ct-drawer-head">
              <div>
                <p className="eyebrow">教学示意 · 非真实病例</p>
                <h2 id="ct-drawer-heading">CT 阅片台</h2>
              </div>
              <button
                ref={ctCloseRef}
                type="button"
                className="ct-close"
                onClick={() => setCtOpen(false)}
              >
                收起 CT
              </button>
            </div>
            <div className="ct-drawer-body">
              <CtViewer
                ct={ct}
                structures={structures}
                structure={selected}
                index={ctIndex}
                windowId={ctWindowId}
                onIndex={setCtIndex}
                onWindow={setCtWindowId}
                onSelect={(id) => {
                  if (id !== selectedId) selectStructure(id, true);
                }}
              />
            </div>
          </aside>
        </>
      )}

      <AssistantPanel
        focus={selected}
        ct={ctOpen ? ctContext : null}
        structureCount={structures.length}
        onOpenChange={setAssistantOpen}
        onWidthChange={setAssistantWidth}
      />

      {circOpen && <CirculationDemo onClose={() => setCircOpen(false)} />}
    </div>
  );
}

function PlacardRow({
  structure,
  active,
  onPick,
}: {
  structure: StructureRecord;
  active: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="placard-row"
      aria-pressed={active}
      onClick={() => onPick(structure.id)}
      style={{ "--row-color": structure.color } as CSSProperties}
    >
      <span className="placard-no" aria-hidden="true">
        {structure.label}
      </span>
      <span className="placard-cn">{structure.name}</span>
      <span className="placard-latin" lang="en">
        {structure.en_name}
      </span>
    </button>
  );
}
