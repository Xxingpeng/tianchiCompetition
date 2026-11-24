import { useEffect, useState } from "react";
import { CatalogError, loadCatalog, selectableStructures } from "./data/catalog";
import type { Catalog } from "./types";
import "./styles.css";

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
        <p className="tagline">搜索解剖结构名，同页查看说明、三视图示意切面与轻量 3D 形态。</p>
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

        {state.kind === "ready" && (
          <section aria-labelledby="catalog-heading">
            <h2 id="catalog-heading">已收录 {state.catalog.structures.length} 个结构</h2>
            <ul className="structure-list">
              {selectableStructures(state.catalog).map((s) => (
                <li key={s.id}>
                  <span
                    className="swatch"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <strong>{s.name}</strong>
                  <span className="en-name">{s.en_name}</span>
                  <span className="provenance">{s.provenance}</span>
                </li>
              ))}
            </ul>
            {state.catalog.excluded.length > 0 && (
              <p className="excluded">
                未纳入：{state.catalog.excluded.map((e) => `${e.id}（${e.reason}）`).join("；")}
              </p>
            )}
          </section>
        )}
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
