import { useId, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { FIELD_LABEL, limitHits, MAX_RESULTS, searchStructures } from "../data/search";
import type { StructureRecord } from "../types";

interface Props {
  structures: StructureRecord[];
  selected: StructureRecord | null;
  onSelect: (structure: StructureRecord) => void;
}

/** 检索 + 候选选择：键盘全程可用（US-2、US-8 AC2）。 */
export function StructurePicker({ structures, selected, onSelect }: Props) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo(() => searchStructures(structures, query), [structures, query]);
  const shown = useMemo(() => limitHits(hits), [hits]);
  const trimmed = query.trim();

  function choose(structure: StructureRecord): void {
    onSelect(structure);
    setQuery(structure.name);
    setOpen(false);
    setActive(0);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(hits.length > 0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        shown.length === 0 ? 0 : (current + step + shown.length) % shown.length,
      );
      return;
    }
    if (event.key === "Enter") {
      const hit = shown[active];
      if (hit) {
        event.preventDefault();
        choose(hit.structure);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  /** 候选项不可聚焦，鼠标按下会先把输入框 blur 掉；挡住默认行为才能保住焦点。 */
  function keepFocus(event: MouseEvent<HTMLLIElement>): void {
    event.preventDefault();
  }

  return (
    <div className="picker">
      <label htmlFor={inputId}>搜索解剖结构</label>
      <input
        id={inputId}
        className="picker-input"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown.length > 0 ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        placeholder="如：左心室 / left ventricle / LV"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onInputKeyDown}
        onBlur={() => setOpen(false)}
      />
      <p className="picker-hint">
        共收录 {structures.length} 个结构，最多同时显示 {MAX_RESULTS} 条候选。
      </p>

      {open && trimmed.length > 0 && shown.length > 0 && (
        <>
          <ul id={listId} className="picker-list" role="listbox" aria-label="候选结构">
            {shown.map((hit, index) => (
              <li
                key={hit.structure.id}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={keepFocus}
                onClick={() => choose(hit.structure)}
              >
                <span
                  className="swatch"
                  style={{ backgroundColor: hit.structure.color }}
                  aria-hidden="true"
                />
                <strong>{hit.structure.name}</strong>
                <span className="en-name">{hit.structure.en_name}</span>
                {hit.field !== "name" && (
                  <span className="hit-via">
                    经{FIELD_LABEL[hit.field]}「{hit.matched}」命中
                  </span>
                )}
              </li>
            ))}
          </ul>
          {hits.length > shown.length && (
            <p role="status" className="picker-more">
              另有 {hits.length - shown.length} 条未显示，请补更完整的关键词。
            </p>
          )}
        </>
      )}

      {open && trimmed.length > 0 && shown.length === 0 && (
        <p role="status" className="picker-empty">
          未收录「{trimmed}」。当前收录的 {structures.length} 个结构见下方列表。
        </p>
      )}

      {selected && (
        <p className="picker-current">
          当前查看：<strong>{selected.name}</strong>（{selected.en_name}）
        </p>
      )}
    </div>
  );
}
