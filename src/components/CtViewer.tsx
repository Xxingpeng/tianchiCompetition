import { useEffect, useState } from "react";
import { ctBaseUrl, ctOverlayUrl, ctSlice, ctWindow } from "../data/ct";
import type { CtManifest, StructureRecord } from "../types";

interface Props {
  ct: CtManifest;
  structures: StructureRecord[];
  structure: StructureRecord;
  index: number;
  windowId: string;
  onIndex: (index: number) => void;
  onWindow: (windowId: string) => void;
  onSelect: (id: string) => void;
}

export function CtViewer({
  ct,
  structures,
  structure,
  index,
  windowId,
  onIndex,
  onWindow,
  onSelect,
}: Props) {
  const [highlight, setHighlight] = useState(true);
  const slice = ctSlice(ct, index);
  const window = ctWindow(ct, windowId);
  const selectedEntry = slice?.structures.find((entry) => entry.id === structure.id);
  const best = ct.best_slice[structure.id];
  const colorById = new Map(structures.map((item) => [item.id, item.color]));
  const last = ct.slice_count - 1;
  const layer = index + 1;
  const baseSrc = ctBaseUrl(ct, index, windowId);
  // 换窗/换层时新图可能还没解码完；记录已载入的 src，避免出现一帧纯黑底。
  const [loadedSrcs, setLoadedSrcs] = useState<ReadonlySet<string>>(() => new Set());
  const markLoaded = (src: string) =>
    setLoadedSrcs((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));

  // 预取同层的所有窗预设：切换窗时直接命中浏览器缓存，不再等网络。
  // 命中缓存时 load 事件同样会送达，因此只靠回调登记，不在 effect 里同步改状态。
  useEffect(() => {
    let cancelled = false;
    for (const item of ct.windows) {
      const src = ctBaseUrl(ct, index, item.id);
      const image = new Image();
      image.onload = () => {
        if (!cancelled) markLoaded(src);
      };
      image.src = src;
    }
    return () => {
      cancelled = true;
    };
  }, [ct, index]);

  const baseLoaded = loadedSrcs.has(baseSrc);
  if (!window) return null;

  return (
    <section className="ct-viewer" aria-labelledby="ct-heading">
      <div className="panel-head">
        <h3 id="ct-heading">CT 轴位阅片 · 逐层对照</h3>
        <div className="ct-windows" role="group" aria-label="窗预设">
          {ct.windows.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ct-window"
              aria-pressed={item.id === window.id}
              onClick={() => onWindow(item.id)}
            >
              {item.name}
              <span>
                WW {item.width} / WL {item.level}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="ct-note">{ct.note}</p>

      <div className="ct-layout">
        <div className="ct-visual">
          <div className="ct-stack">
            {!baseLoaded && <span className="ct-skeleton" />}
            <img
              className="ct-base"
              data-loaded={baseLoaded}
              src={baseSrc}
              alt={`伪 CT 轴位第 ${layer} 层，${window.name}。示意灰度图，不是真实病例影像。`}
              width={ct.image_size[0]}
              height={ct.image_size[1]}
              onLoad={() => markLoaded(baseSrc)}
            />
            {!baseLoaded && (
              <span className="ct-loading" role="status">
                正在载入第 {layer} 层 {window.name}…
              </span>
            )}
            {highlight && selectedEntry && (
              <img
                className="ct-overlay"
                src={ctOverlayUrl(ct, structure.id, index)}
                alt=""
                aria-hidden="true"
                width={ct.image_size[0]}
                height={ct.image_size[1]}
              />
            )}
          </div>
          <p className="ct-orientation">
            方位：上=前 · 下=后 · 左=患者右 · 右=患者左（放射学惯例）
          </p>
        </div>

        <div className="ct-controls">
          <label className="ct-slider-label" htmlFor="ct-slice">
            轴位层
          </label>
          <div className="ct-slider-row">
            <button
              type="button"
              className="ct-step"
              aria-label="上一层"
              disabled={index <= 0}
              onClick={() => onIndex(index - 1)}
            >
              ←
            </button>
            <input
              id="ct-slice"
              className="ct-slider"
              type="range"
              min={0}
              max={last}
              value={index}
              aria-valuetext={`第 ${layer} 层，共 ${ct.slice_count} 层`}
              onChange={(event) => onIndex(Number(event.target.value))}
            />
            <button
              type="button"
              className="ct-step"
              aria-label="下一层"
              disabled={index >= last}
              onClick={() => onIndex(index + 1)}
            >
              →
            </button>
          </div>
          <p className="ct-layer" aria-live="polite">
            第 {layer} / {ct.slice_count} 层 · 本层标注 {slice?.voxels ?? 0} 体素
          </p>

          <div className="ct-options">
            <label className="highlight-toggle">
              <input
                type="checkbox"
                checked={highlight}
                onChange={(event) => setHighlight(event.target.checked)}
              />
              叠加所选结构高亮
            </label>
            {typeof best === "number" && (
              <button
                type="button"
                className="ct-jump"
                onClick={() => onIndex(best)}
                disabled={index === best}
              >
                跳到{structure.name}最密层（第 {best + 1} 层）
              </button>
            )}
          </div>

          <p className="ct-selected">
            {selectedEntry
              ? `${structure.name}：本层 ${selectedEntry.voxels} 体素。`
              : `${structure.name}：本层未见标注。`}
          </p>

          <h4 className="ct-list-title">本层可见结构</h4>
          {slice && slice.structures.length > 0 ? (
            <ul className="ct-structures">
              {slice.structures.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="ct-structure"
                    aria-pressed={entry.id === structure.id}
                    onClick={() => onSelect(entry.id)}
                  >
                    <span
                      className="swatch"
                      style={{ backgroundColor: colorById.get(entry.id) ?? "#777" }}
                      aria-hidden="true"
                    />
                    <span>{entry.name}</span>
                    <span className="ct-voxels num">{entry.voxels} 体素</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ct-empty">本层没有标注结构，拖动滑块换一层看看。</p>
          )}
        </div>
      </div>
    </section>
  );
}
