import { describe, expect, it } from "vitest";
import { assessDifficulty, classifyIntent } from "./intent.ts";

describe("classifyIntent", () => {
  it("把心脏结构问题判为解剖范围", () => {
    const intent = classifyIntent("左心室为什么壁厚");
    expect(intent.kind).toBe("answer");
    if (intent.kind === "answer") expect(intent.topic).toBe("anatomy");
  });

  it("把 CT 基础问题判为影像范围", () => {
    const intent = classifyIntent("CT 的窗宽窗位怎么选");
    expect(intent).toMatchObject({ kind: "answer", topic: "ct" });
  });

  it("把页面切面问题判为视图范围", () => {
    expect(classifyIntent("左心室在轴位是第几层")).toMatchObject({ kind: "answer", topic: "view" });
    expect(classifyIntent("这个高亮是什么")).toMatchObject({ kind: "answer", topic: "view" });
  });

  it("独立的问候走静态回复", () => {
    expect(classifyIntent("你好！")).toEqual({ kind: "static", reply: "greeting" });
  });

  it("站内用法问题走帮助", () => {
    expect(classifyIntent("这个网站怎么用")).toEqual({ kind: "static", reply: "help" });
  });

  it("无关话题被挡住", () => {
    expect(classifyIntent("帮我写一段 Python 脚本")).toEqual({
      kind: "static",
      reply: "off_topic",
    });
    expect(classifyIntent("今天天气怎么样")).toEqual({ kind: "static", reply: "off_topic" });
  });

  it("个人症状与用药诉求走安全分流", () => {
    expect(classifyIntent("我最近胸痛，要吃什么药")).toEqual({ kind: "static", reply: "unsafe" });
    expect(classifyIntent("二尖瓣反流需要手术吗")).toEqual({ kind: "static", reply: "unsafe" });
  });

  it("急症优先于其他规则", () => {
    expect(classifyIntent("呼吸困难，救命")).toEqual({ kind: "static", reply: "emergency" });
  });

  it("空输入单独标记", () => {
    expect(classifyIntent("   ")).toEqual({ kind: "static", reply: "empty" });
  });
});

describe("assessDifficulty", () => {
  it("短事实题走常规模式", () => {
    expect(assessDifficulty("左心室在哪")).toBe(false);
  });

  it("多问句的比较题走深入模式", () => {
    expect(
      assessDifficulty(
        "为什么左心室壁比右心室厚？收缩期和舒张期分别有什么影响，和主动脉压力有什么关系？",
      ),
    ).toBe(true);
  });
});
