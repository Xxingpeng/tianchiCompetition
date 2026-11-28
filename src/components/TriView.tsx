import { useState } from "react";
import { VIEW_NAMES } from "../types";
import type { StructureRecord } from "../types";

interface Props {
  structure: StructureRecord;
}

/** 前端只做图像合成：底图与高亮来自构建期同一份体素，浏览器里不算体素（US-4 技术备注）。 */
export function TriView({ structure }: Props) {
  const [highlight, setHighlight] = useState(true);
  // 新结构的三张底图首次打开时要等网络；解码完成前铺扫光骨架，避免一片纯黑。
  const [loadedSrcs, setLoadedSrcs] = useState<ReadonlySet<string>>(() => new Set());
  const markLoaded = (src: string) =>
    setLoadedSrcs((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));

  return (
    <section className="tri-view" aria-labelledby="tri-view-heading">
      <div className="panel-head">
        <h3 id="tri-view-heading">最密层切面预览</h3>
        <label className="highlight-toggle">
          <input
            type="checkbox"
            checked={highlight}
            onChange={(event) => setHighlight(event.target.checked)}
          />
          高亮 {structure.name}
        </label>
      </div>

      <p className="legend">
        <span className="swatch" style={{ backgroundColor: structure.color }} aria-hidden="true" />
        {highlight
          ? `图例：半透明色块表示 ${structure.name}（${structure.en_name}）`
          : "图例：当前未叠加高亮层"}
      </p>

      <ul className="slices">
        {VIEW_NAMES.map((view) => {
          const entry = structure.views[view];
          const baseSrc = `/${entry.base}`;
          const baseLoaded = loadedSrcs.has(baseSrc);
          return (
            <li key={view}>
              <figure>
                <div className="slice-stack">
                  {!baseLoaded && <span className="slice-skeleton" />}
                  <img
                    className="slice-base"
                    data-loaded={baseLoaded}
                    src={baseSrc}
                    alt={`${structure.name}的${entry.view_name}示意切面底图`}
                    width={288}
                    height={288}
                    onLoad={() => markLoaded(baseSrc)}
                  />
                  {highlight && (
                    <img
                      className="slice-overlay"
                      src={`/${entry.overlay}`}
                      alt=""
                      aria-hidden="true"
                      width={288}
                      height={288}
                    />
                  )}
                </div>
                <figcaption>
                  {entry.view_name} · 第 {entry.slice_index} 层 · 该层占 {entry.slice_voxels} 体素
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
      <p className="slice-note">切面取该结构最密的一层，不是体积中心层，小结构也能看得到。</p>
    </section>
  );
}
