import { useState } from "react";
import { VIEW_NAMES } from "../types";
import type { StructureRecord } from "../types";

interface Props {
  structure: StructureRecord;
}

/** 前端只做图像合成：底图与高亮来自构建期同一份体素，浏览器里不算体素（US-4 技术备注）。 */
export function TriView({ structure }: Props) {
  const [highlight, setHighlight] = useState(true);

  return (
    <section className="tri-view" aria-labelledby="tri-view-heading">
      <div className="panel-head">
        <h3 id="tri-view-heading">三视图示意切面</h3>
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
          return (
            <li key={view}>
              <figure>
                <div className="slice-stack">
                  <img
                    className="slice-base"
                    src={`/${entry.base}`}
                    alt={`${structure.name}的${entry.view_name}示意切面底图`}
                    width={288}
                    height={288}
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
