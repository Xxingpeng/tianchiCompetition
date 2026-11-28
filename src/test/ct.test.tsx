import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CtViewer } from "../components/CtViewer";
import { buildCtContext, ctBaseUrl, ctOverlayUrl, ctSlice, fillCtPattern } from "../data/ct";
import { catalog, ctManifest, structure } from "./fixtures";

const lv = structure();
const myo = structure({ id: "myo", label: 1, name: "心肌", color: "#b5651d" });

function renderViewer(overrides: { index?: number; windowId?: string } = {}) {
  const onIndex = vi.fn();
  const onWindow = vi.fn();
  const onSelect = vi.fn();
  const ct = ctManifest();
  render(
    <CtViewer
      ct={ct}
      structures={[lv, myo]}
      structure={lv}
      index={overrides.index ?? 48}
      windowId={overrides.windowId ?? "mediastinal"}
      onIndex={onIndex}
      onWindow={onWindow}
      onSelect={onSelect}
    />,
  );
  return { ct, onIndex, onWindow, onSelect };
}

describe("CT 清单路径", () => {
  it("按 Python 的格式串补齐补零层号", () => {
    expect(
      fillCtPattern("assets/ct/base/{index:03d}_{window}.png", {
        index: 7,
        window: "lung",
      }),
    ).toBe("assets/ct/base/007_lung.png");
    expect(fillCtPattern("assets/ct/overlay/{id}/{index:03d}.png", { id: "lv", index: 48 })).toBe(
      "assets/ct/overlay/lv/048.png",
    );
  });

  it("底图与 overlay 的 URL 都指向站点根", () => {
    const ct = ctManifest();
    expect(ctBaseUrl(ct, 48, "mediastinal")).toBe("/assets/ct/base/048_mediastinal.png");
    expect(ctOverlayUrl(ct, "lv", 48)).toBe("/assets/ct/overlay/lv/048.png");
  });

  it("按层号取真值，缺层返回 undefined", () => {
    const ct = ctManifest();
    expect(ctSlice(ct, 48)?.structures.map((entry) => entry.id)).toEqual(["lv", "myo"]);
    expect(ctSlice(ct, 999)).toBeUndefined();
  });
});

describe("buildCtContext", () => {
  it("带出层号、窗名、可见结构与所选结构体素", () => {
    const context = buildCtContext(ctManifest(), 48, "mediastinal", lv);
    expect(context).toMatchObject({
      index: 48,
      total: 96,
      window: "mediastinal",
      windowName: "纵隔窗",
    });
    expect(context?.structures).toHaveLength(2);
    expect(context?.selected).toEqual({
      id: "lv",
      name: "左心室",
      voxels: 320,
    });
  });

  it("所选结构不在本层时体素为 0", () => {
    const context = buildCtContext(ctManifest(), 30, "lung", lv);
    expect(context?.windowName).toBe("肺窗");
    expect(context?.selected).toEqual({ id: "lv", name: "左心室", voxels: 0 });
  });
});

describe("CtViewer", () => {
  it("显示当前层的底图、高亮与逐层真值", () => {
    renderViewer();
    expect(screen.getByRole("heading", { name: /CT 轴位阅片/ })).toBeInTheDocument();
    const base = screen.getByRole("img", { name: /伪 CT 轴位第 49 层/ });
    expect(base).toHaveAttribute("src", "/assets/ct/base/048_mediastinal.png");
    expect(base).toHaveAttribute("width", "192");
    expect(screen.getByRole("slider", { name: "轴位层" })).toHaveValue("48");
    expect(screen.getByText(/第 49 \/ 96 层/)).toBeInTheDocument();
    expect(screen.getByText(/本层 320 体素/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /左心室\s*320 体素/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /心肌\s*280 体素/ })).toBeInTheDocument();
  });

  it("拖滑块、翻层与跳最密层都回调父组件", () => {
    const { onIndex } = renderViewer({ index: 30 });
    fireEvent.change(screen.getByRole("slider", { name: "轴位层" }), {
      target: { value: "31" },
    });
    expect(onIndex).toHaveBeenCalledWith(31);
    fireEvent.click(screen.getByRole("button", { name: "下一层" }));
    expect(onIndex).toHaveBeenCalledWith(31);
    fireEvent.click(screen.getByRole("button", { name: /跳到左心室最密层/ }));
    expect(onIndex).toHaveBeenCalledWith(48);
  });

  it("切窗与点选本层可见结构都回调父组件", async () => {
    const user = userEvent.setup();
    const { onWindow, onSelect } = renderViewer();
    await user.click(screen.getByRole("button", { name: /肺窗/ }));
    expect(onWindow).toHaveBeenCalledWith("lung");
    await user.click(screen.getByRole("button", { name: /心肌\s*280 体素/ }));
    expect(onSelect).toHaveBeenCalledWith("myo");
  });

  it("关闭高亮后不叠加 overlay，空层如实提示", () => {
    const { rerender } = render(
      <CtViewer
        ct={ctManifest()}
        structures={[lv, myo]}
        structure={lv}
        index={48}
        windowId="mediastinal"
        onIndex={vi.fn()}
        onWindow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const overlays = screen.getAllByRole("presentation", { hidden: true });
    expect(overlays.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /叠加所选结构高亮/ }));
    expect(screen.queryAllByRole("presentation", { hidden: true })).toHaveLength(0);

    rerender(
      <CtViewer
        ct={ctManifest()}
        structures={[lv, myo]}
        structure={lv}
        index={30}
        windowId="mediastinal"
        onIndex={vi.fn()}
        onWindow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/本层未见标注/)).toBeInTheDocument();
    expect(screen.getByText(/本层没有标注结构/)).toBeInTheDocument();
  });
});

describe("目录里的 CT 清单", () => {
  it("夹具目录默认带 CT，否则阅片器不会渲染", () => {
    expect(catalog().ct?.slice_count).toBe(96);
  });
});
