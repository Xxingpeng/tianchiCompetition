import { describe, expect, it } from "vitest";
import { heartKnowledge as kbJson } from "../knowledge/heart-knowledge.ts";
import { createRetriever } from "./retrieval.ts";
import { AGENT_SYSTEM, degradedAnswer } from "./prompt.ts";
import { focusTitle, planTurn } from "./turn.ts";

const kb = kbJson;
const retrieve = createRetriever(kb);

describe("planTurn", () => {
  it("越界问题直接给静态回复，不产生资料", () => {
    const plan = planTurn({ text: "帮我订一张机票" }, retrieve);
    expect(plan.kind).toBe("static");
    if (plan.kind === "static") expect(plan.reply).toContain("超出");
  });

  it("范围外知识在没有资料时明确说没有，而不是硬答", () => {
    const plan = planTurn({ text: "量子纠缠的贝尔不等式" }, retrieve);
    expect(plan.kind).not.toBe("answer");
  });

  it("解剖问题产出资料块、引用编号与常规模式", () => {
    const plan = planTurn({ text: "左心室为什么壁厚" }, retrieve);
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
      },
      retrieve,
    );
    expect(plan.kind).toBe("answer");
    if (plan.kind === "answer") expect(plan.mode).toBe("tot");
  });

  it("切面问题在未选结构时先引导选择", () => {
    const plan = planTurn({ text: "这个高亮是什么" }, retrieve);
    expect(plan.kind).toBe("static");
    if (plan.kind === "static") expect(plan.reply).toContain("先在左侧");
  });

  it("切面问题带上当前结构的真实取层索引", () => {
    const plan = planTurn({ text: "轴位切面在第几层", focus: "lv" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.topic).toBe("view");
    expect(plan.userMessage).toContain("[当前切面]");
    expect(plan.userMessage).toContain("轴位 30");
    expect(plan.userMessage).toContain("0 起");
  });

  it("当前选中的结构能补全指代", () => {
    const plan = planTurn({ text: "它有什么作用", focus: "lv" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind === "answer")
      expect(plan.userMessage).toContain("[当前页面] 用户正在查看结构：左心室");
  });

  it("泛指心脏结构时不绑定当前选中结构", () => {
    const plan = planTurn({ text: "心脏有哪些结构", focus: "myo" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.userMessage).not.toContain("[当前页面]");
    expect(plan.userMessage).toContain("[当前问题] 心脏有哪些结构");
    const titles = plan.citations.map((citation) => citation.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "心壁三层结构",
        "四个瓣膜的分工",
        "大血管的进出关系",
        "心脏传导系统",
      ]),
    );
  });

  it("疾病概念问题带国内资料，但不主动播报当前结构", () => {
    const plan = planTurn({ text: "高血压为什么伤心脏", focus: "lv" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.citations.map((citation) => citation.id)).toContain("disease-hypertension-heart");
    expect(plan.userMessage).toContain("[资料 1]");
    expect(plan.userMessage).not.toContain("[当前页面]");
  });

  it("问高血压病因时命中原发病因条目", () => {
    const plan = planTurn({ text: "人为什么会得高血压" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.citations.map((citation) => citation.id)).toContain("disease-hypertension-causes");
  });

  it("漏字的泛问（心脏有什结构）仍覆盖五类资料", () => {
    const plan = planTurn({ text: "心脏有什结构", focus: "myo" }, retrieve);
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.userMessage).not.toContain("[当前页面]");
    const titles = plan.citations.map((citation) => citation.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "心壁三层结构",
        "四个瓣膜的分工",
        "大血管的进出关系",
        "心脏传导系统",
      ]),
    );
  });

  it("问当前 CT 层时注入逐层真值，并照常带资料", () => {
    const plan = planTurn(
      {
        text: "这一层有哪些结构？",
        focus: "lv",
        ct: {
          index: 48,
          total: 96,
          window: "mediastinal",
          windowName: "纵隔窗",
          structures: [
            { id: "lv", name: "左心室", voxels: 320 },
            { id: "myo", name: "心肌", voxels: 280 },
          ],
          selected: { id: "lv", name: "左心室", voxels: 320 },
        },
      },
      retrieve,
    );
    expect(plan.kind).toBe("answer");
    if (plan.kind !== "answer") return;
    expect(plan.topic).toBe("ct");
    expect(plan.userMessage).toContain("[当前 CT 轴位]");
    expect(plan.userMessage).toContain("第 49/96 层");
    expect(plan.userMessage).toContain("左心室 320 体素");
    expect(plan.userMessage).toContain("[资料 1]");
    expect(plan.citations.length).toBeGreaterThan(0);
    expect(plan.userMessage).not.toContain("[当前页面]");
  });

  it("没有 CT 上下文或问的是三视图高亮时不注入 CT 事实", () => {
    const withoutCt = planTurn({ text: "这一层有哪些结构" }, retrieve);
    if (withoutCt.kind === "answer") expect(withoutCt.userMessage).not.toContain("[当前 CT 轴位]");

    const triView = planTurn(
      {
        text: "这个高亮是什么",
        focus: "lv",
        ct: {
          index: 48,
          total: 96,
          window: "mediastinal",
          windowName: "纵隔窗",
          structures: [{ id: "lv", name: "左心室", voxels: 320 }],
          selected: { id: "lv", name: "左心室", voxels: 320 },
        },
      },
      retrieve,
    );
    expect(triView.kind).toBe("answer");
    if (triView.kind === "answer") {
      expect(triView.topic).toBe("view");
      expect(triView.userMessage).toContain("[当前切面]");
      expect(triView.userMessage).not.toContain("[当前 CT 轴位]");
    }
  });

  it("CT 上下文不会污染泛问，也不会绕过安全分流", () => {
    const ct = {
      index: 48,
      total: 96,
      window: "mediastinal" as const,
      windowName: "纵隔窗",
      structures: [{ id: "lv", name: "左心室", voxels: 320 }],
      selected: { id: "lv", name: "左心室", voxels: 320 },
    };
    const overview = planTurn({ text: "心脏有哪些结构", focus: "lv", ct }, retrieve);
    expect(overview.kind).toBe("answer");
    if (overview.kind === "answer") expect(overview.userMessage).not.toContain("[当前 CT 轴位]");

    const unsafe = planTurn({ text: "这一层能看出我胸痛的原因吗", ct }, retrieve);
    expect(unsafe.kind).toBe("static");
    if (unsafe.kind === "static") expect(unsafe.reply).not.toContain("第 49");
  });

  it("问刚才问了哪些问题时从对话历史回答", () => {
    const plan = planTurn(
      {
        text: "我刚才问了你哪些问题",
        history: [
          { role: "user", text: "心脏有哪些结构" },
          { role: "assistant", text: "心脏的结构可以分几块来看……" },
          { role: "user", text: "左心室为什么壁厚" },
        ],
      },
      retrieve,
    );
    expect(plan.kind).toBe("static");
    if (plan.kind !== "static") return;
    expect(plan.reply).toContain("心脏有哪些结构");
    expect(plan.reply).toContain("左心室为什么壁厚");
    expect(plan.reply).not.toContain("[资料");
  });

  it("没有历史时元问题如实说明", () => {
    const plan = planTurn({ text: "我们刚才聊了什么" }, retrieve);
    expect(plan.kind).toBe("static");
    if (plan.kind === "static") expect(plan.reply).toContain("第一个问题");
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

describe("AGENT_SYSTEM", () => {
  it("不让模型在正文里播报知识缺口或建议换问法", () => {
    expect(AGENT_SYSTEM).not.toContain("知识库暂无");
    expect(AGENT_SYSTEM).not.toContain("换个问法");
    expect(AGENT_SYSTEM).toContain("不说明缺少什么");
  });
});
