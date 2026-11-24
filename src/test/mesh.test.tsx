import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeshViewer } from "../components/MeshViewer";
import { structure } from "./fixtures";

describe("3D 网格区", () => {
  it("没有 WebGL 的环境里只降级这一块，页面其余部分不受影响（US-5 AC2）", async () => {
    render(<MeshViewer structure={structure()} />);
    expect(await screen.findByRole("status")).toHaveTextContent("不支持 WebGL");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/拖拽旋转，滚轮缩放/)).toBeInTheDocument();
  });

  it("说明文字先讲清操作方式，再讲数据来源", () => {
    render(<MeshViewer structure={structure()} />);
    expect(screen.getByRole("heading", { name: "三维形态" })).toBeInTheDocument();
    expect(screen.getByText(/与三视图同一份体素/)).toBeInTheDocument();
  });
});
