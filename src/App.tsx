import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { InfoCard } from "./components/InfoCard";
import { StructurePicker } from "./components/StructurePicker";
import { TriView } from "./components/TriView";
import { CatalogError, loadCatalog, selectableStructures } from "./data/catalog";
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
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <header className="site-header">
        <h1>解剖智绘</h1>
        <p className="tagline">
          搜索解剖结构名，同页查看说明与三视图示意切面，并在整颗心脏 3D 里点选该结构。
        </p>
      </header>

      <main id="main">
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
    </>
  );
}

function Browser({ catalog }: { catalog: Catalog }) {
  const structures = useMemo(() => selectableStructures(catalog), [catalog]);
  const [selectedId, setSelectedId] = useState<string | null>(structures[0]?.id ?? null);
  const selected = structures.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (catalog.excluded.length > 0) {
      console.warn(
        "目录中被排除的结构（几何或许可不达标）：",
        catalog.excluded.map((e) => `${e.id}：${e.reason}`),
      );
    }
  }, [catalog]);

  return (
    <div className="layout">
      <div className="side">
        <StructurePicker
          structures={structures}
          selected={selected}
          onSelect={(structure) => setSelectedId(structure.id)}
        />

        <section aria-labelledby="catalog-heading" className="catalog">
          <h2 id="catalog-heading">已收录 {structures.length} 个结构</h2>
          <ul className="structure-list">
            {structures.map((s) => (
              <li key={s.id}>
                <StructureButton
                  structure={s}
                  active={s.id === selectedId}
                  onPick={setSelectedId}
                />
              </li>
            ))}
          </ul>
          {catalog.excluded.length > 0 && (
            <p className="excluded">
              未纳入：{catalog.excluded.map((e) => `${e.id}（${e.reason}）`).join("；")}
            </p>
          )}
        </section>
      </div>

      <div className="stage">
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
            onSelect={(structure) => setSelectedId(structure.id)}
          />
        </Suspense>

        {selected ? (
          <section className="detail-grid" aria-labelledby="detail-heading">
            {/* 详情区先出 h2 再进 h3，否则标题层级会从 h1 直接跳到 h3。 */}
            <h2 id="detail-heading" className="detail-title">
              结构详情
            </h2>
            <InfoCard structure={selected} />
            <TriView structure={selected} />
          </section>
        ) : (
          <p role="status">当前没有可选结构，请先在上方搜索或从列表中选择。</p>
        )}
      </div>

      <AssistantPanel focus={selected} />
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
