import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { CtViewer } from "./components/CtViewer";
import { InfoCard } from "./components/InfoCard";
import { StructurePicker } from "./components/StructurePicker";
import { TriView } from "./components/TriView";
import { CatalogError, loadCatalog, selectableStructures } from "./data/catalog";
import { buildCtContext } from "./data/ct";
import type { Catalog, StructureRecord } from "./types";
import "./styles.css";

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
        <p className="tagline">点击心脏上的结构，查看说明与切面，再进入逐层 CT。</p>
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
            {state.catalog.notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        )}
        <p className="source-note">
          资产由 <code>tools/asset_pipeline</code> 离线生成；来源与许可见仓库根{" "}
          <code>NOTICE.md</code>。
        </p>
      </footer>
    </div>
  );
}

function Browser({ catalog }: { catalog: Catalog }) {
  const structures = useMemo(() => selectableStructures(catalog), [catalog]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [triOpen, setTriOpen] = useState(false);
  const [ctOpen, setCtOpen] = useState(false);
  const ctCloseRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const selected = structures.find((s) => s.id === selectedId) ?? null;
  const ct = catalog.ct;
  const [ctIndex, setCtIndex] = useState(() => {
    const first = structures[0]?.id;
    return ct && first ? (ct.best_slice[first] ?? 0) : 0;
  });
  const [ctWindowId, setCtWindowId] = useState(() => ct?.default_window ?? "mediastinal");

  function selectStructure(id: string, keepCtLayer = false): void {
    setSelectedId(id);
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

  function closeDetail(): void {
    setSelectedId(null);
    setCtOpen(false);
    setTriOpen(false);
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
    <div className={`scene-shell${selected ? " has-detail" : ""}${ctOpen ? " ct-open" : ""}`}>
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
            onSelect={(structure) => selectStructure(structure.id)}
          />
        </Suspense>
      </section>

      <aside className="scene-dock" aria-label="结构检索与目录">
        <StructurePicker
          structures={structures}
          selected={selected}
          onSelect={(structure) => selectStructure(structure.id)}
        />

        <section aria-labelledby="catalog-heading" className="catalog">
          <div className="catalog-head">
            <h2 id="catalog-heading">已收录 {structures.length} 个结构</h2>
            <button
              type="button"
              className="catalog-toggle"
              aria-expanded={catalogOpen}
              aria-controls={catalogOpen ? "catalog-list" : undefined}
              onClick={() => setCatalogOpen((open) => !open)}
            >
              {catalogOpen ? "收起目录" : "展开目录"}
            </button>
          </div>
          {catalogOpen && (
            <>
              <ul id="catalog-list" className="structure-list">
                {structures.map((s) => (
                  <li key={s.id}>
                    <StructureButton
                      structure={s}
                      active={s.id === selectedId}
                      onPick={(id) => selectStructure(id)}
                    />
                  </li>
                ))}
              </ul>
              {catalog.excluded.length > 0 && (
                <p className="excluded">
                  未纳入：{catalog.excluded.map((e) => `${e.id}（${e.reason}）`).join("；")}
                </p>
              )}
            </>
          )}
        </section>
      </aside>

      {!selected && (
        <p className="scene-hint" role="status">
          点击心脏上的任一结构，查看它的说明；也可以搜索或展开目录。
        </p>
      )}

      {!selected && (
        <div className="scene-actions">
          <button
            type="button"
            className="ct-cta"
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

      <AssistantPanel focus={selected} ct={ctOpen ? ctContext : null} />
    </div>
  );
}

function StructureButton({
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
      className="structure-button"
      aria-pressed={active}
      onClick={() => onPick(structure.id)}
    >
      <span className="swatch" style={{ backgroundColor: structure.color }} aria-hidden="true" />
      <span className="structure-name">{structure.name}</span>
      <span className="en-name">{structure.en_name}</span>
      <span className="provenance">{structure.provenance}</span>
    </button>
  );
}
