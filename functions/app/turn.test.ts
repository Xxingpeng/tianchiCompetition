import { describe, expect, it } from "vitest";
import { heartKnowledge as kbJson } from "../knowledge/heart-knowledge.ts";
import { createRetriever } from "./retrieval.ts";
import { degradedAnswer } from "./prompt.ts";
import { focusTitle, planTurn } from "./turn.ts";

const kb = kbJson;
const retrieve = createRetriever(kb);

describe("planTurn", () => {
  it("越界问题直接给静态回复，不产生资料", () => {
    const plan = planTurn({ text: "帮我订一张机票", history: [] }, retrieve);
    expect(plan.kind).toBe("static");
    if (plan.kind === "static") expect(plan.reply).toContain("超出");
  });

  it("范围外知识在没有资料时明确说没有，而不是硬答", () => {
    const plan = planTurn({ text: "量子纠缠的贝尔不等式", history: [] }, retrieve);
    expect(plan.kind).not.toBe("answer");
  });

  it("解剖问题产出资料块、引用编号与常规模式", () => {
    const plan = planTurn({ text: "左心室为什么壁厚", history: [] }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.topic).toBe("anatomy");
    expect(plan.mode).toBe("cot");
    expect(plan.citations.length).toBeGreaterThan(0);
    expect(plan.userMessage).toContain("[资料 1]");
    expect(plan.userMessage).toContain("[思考模式] 常规");
    expect(plan.userMessage).toContain("[当前问题] 左心室为什么壁厚");
  });

  it("高难度问题切到深入模式", () => {
    const plan = planTurn(
      {
        text: "为什么左心室壁比右心室厚？收缩期和舒张期分别有什么影响，和主动脉压力有什么关系？",
        history: [],
      },
      retrieve,
    );
    expect(plan.kind).toBe("answer");
    if (plan.kind === "answer") expect(plan.mode).toBe("tot");
  });

  it("切面问题在未选结构时先引导选择", () => {
    const plan = planTurn({ text: "这个高亮是什么", history: [] }, retrieve);
    expect(plan.kind).toBe("static");
    if (plan.kind === "static") expect(plan.reply).toContain("先在左侧");
  });

  it("切面问题带上当前结构的真实取层索引", () => {
    const plan = planTurn({ text: "轴位切面在第几层", history: [], focus: "lv" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.topic).toBe("view");
    expect(plan.userMessage).toContain("[当前切面]");
    expect(plan.userMessage).toContain("轴位 30");
    expect(plan.userMessage).toContain("0 起");
  });

  it("当前选中的结构能补全指代", () => {
    const plan = planTurn({ text: "它有什么作用", history: [], focus: "lv" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind === "answer")
      expect(plan.userMessage).toContain("[当前页面] 用户正在查看结构：左心室");
  });

  it("冷启动才附带前文摘要", () => {
    const history = [
      { role: "user" as const, text: "左心室在哪" },
      { role: "assistant" as const, text: "在左心房下方。" },
    ];
    const cold = planTurn({ text: "那心肌呢", history, focus: "myo" }, retrieve, true);
    const warm = planTurn({ text: "那心肌呢", history, focus: "myo" }, retrieve, false);
    if (cold.kind === "answer" && warm.kind === "answer") {
      expect(cold.userMessage).toContain("[前文]");
      expect(warm.userMessage).not.toContain("[前文]");
    } else {
      throw new Error("两个规划都应当是回答");
    }
  });

  it("焦点白名单只接受目录内结构", () => {
    expect(focusTitle("lv")).toBe("左心室");
    expect(focusTitle("__proto__")).toBeUndefined();
    expect(focusTitle("unknown")).toBeUndefined();
  });
});

describe("degradedAnswer", () => {
  it("兜底回答引用知识库原文并保留编号", () => {
    const { citations } = retrieve("窗宽窗位");
    const text = degradedAnswer(citations);
    expect(text).toContain("AI 通道当前不可用");
    expect(text).toContain("[1]");
  });

  it("没有资料时给重试与替代路径", () => {
    expect(degradedAnswer([])).toContain("稍后重试");
  });
});
