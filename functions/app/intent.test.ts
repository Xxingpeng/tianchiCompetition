import { describe, expect, it } from "vitest";
import { assessDifficulty, classifyIntent, isOverviewQuestion } from "./intent.ts";

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
    expect(classifyIntent("你能回答哪些问题")).toEqual({ kind: "static", reply: "help" });
  });

  it("常见心脏疾病词按解剖范围处理，交给资料判断能否回答", () => {
    expect(classifyIntent("心衰是怎么回事")).toMatchObject({ kind: "answer", topic: "anatomy" });
    expect(classifyIntent("房颤是什么")).toMatchObject({ kind: "answer", topic: "anatomy" });
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

  it("问对话本身的问题走历史元意图", () => {
    expect(classifyIntent("我刚才问了你哪些问题")).toEqual({
      kind: "meta",
      reply: "history_questions",
    });
    expect(classifyIntent("我们刚才聊了什么")).toEqual({
      kind: "meta",
      reply: "history_questions",
    });
    // 带解剖对象时仍按解剖题回答，不抢成"列问题"。
    expect(classifyIntent("你刚才说的左心室为什么厚")).toMatchObject({
      kind: "answer",
      topic: "anatomy",
    });
  });
});

describe("isOverviewQuestion", () => {
  it("识别泛指心脏组成的问法", () => {
    expect(isOverviewQuestion("心脏有哪些结构")).toBe(true);
    expect(isOverviewQuestion("心脏由哪些部分组成")).toBe(true);
    expect(isOverviewQuestion("心脏的结构有哪些")).toBe(true);
  });

  it("口语变体与漏字也走泛问检索", () => {
    for (const question of [
      "心脏有什么结构",
      "心脏有什结构",
      "心脏的结构是什么",
      "心脏由什么组成",
      "心脏包括什么",
      "心脏有哪几部分",
      "人的心脏有哪些结构",
    ]) {
      expect(isOverviewQuestion(question), question).toBe(true);
    }
  });

  it("问到具体结构时不走泛问检索", () => {
    expect(isOverviewQuestion("心脏有哪些瓣膜")).toBe(false);
    expect(isOverviewQuestion("心脏有什么大血管")).toBe(false);
    expect(isOverviewQuestion("左心室有哪些结构")).toBe(false);
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
