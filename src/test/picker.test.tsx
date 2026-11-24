import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StructurePicker } from "../components/StructurePicker";
import { MAX_RESULTS } from "../data/search";
import type { StructureRecord } from "../types";
import { structure } from "./fixtures";

const list = [
  structure(),
  structure({
    id: "la",
    label: 2,
    name: "左心房",
    en_name: "Left atrium",
    aliases: ["左房", "LA"],
  }),
];

function picker(onSelect = vi.fn()) {
  render(<StructurePicker structures={list} selected={null} onSelect={onSelect} />);
  return { input: screen.getByRole("combobox"), onSelect };
}

describe("结构检索控件", () => {
  it("输入别名出现候选，点选后把结构交给页面", async () => {
    const user = userEvent.setup();
    const { input, onSelect } = picker();

    await user.type(input, "LV");
    const option = await screen.findByRole("option");
    expect(option).toHaveTextContent("左心室");
    expect(option).toHaveTextContent("经别名「LV」命中");

    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "lv" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("左心室");
  });

  it("键盘方向键 + 回车即可完成选择，不依赖鼠标（US-8 AC2）", async () => {
    const user = userEvent.setup();
    const { input, onSelect } = picker();

    await user.type(input, "左");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    await waitFor(() => expect(input).toHaveAttribute("aria-activedescendant"));

    // 候选按冻结标签排序：左心房(2) 在前，左心室(3) 在后
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("左心房");
    expect(options[1]).toHaveTextContent("左心室");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "lv" }));
  });

  it("Escape 关掉候选但不清空输入", async () => {
    const user = userEvent.setup();
    const { input } = picker();

    await user.type(input, "左");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("左");
  });

  it("搜不到时给出「未收录」空态，而不是空白（US-2 AC3）", async () => {
    const user = userEvent.setup();
    const { input } = picker();

    await user.type(input, "股四头肌");
    expect(await screen.findByRole("status")).toHaveTextContent("未收录「股四头肌」");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("候选数量封顶，并提示还有多少条没显示（US-2 AC5）", async () => {
    const user = userEvent.setup();
    const wide: StructureRecord[] = Array.from({ length: MAX_RESULTS + 4 }, (_, i) =>
      structure({ id: `s${i}`, label: i + 1, name: `结构${i}` }),
    );
    render(<StructurePicker structures={wide} selected={null} onSelect={vi.fn()} />);

    await user.type(screen.getByRole("combobox"), "结构");
    expect(screen.getAllByRole("option")).toHaveLength(MAX_RESULTS);
    expect(screen.getByRole("status")).toHaveTextContent(
      `另有 ${wide.length - MAX_RESULTS} 条未显示`,
    );
  });
});
