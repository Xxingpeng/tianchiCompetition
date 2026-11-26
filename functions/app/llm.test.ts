import { describe, expect, it } from "vitest";
import {
  buildChatMessages,
  dashScopeConfig,
  DEFAULT_DASHSCOPE_BASE_URL,
  DEFAULT_DASHSCOPE_MODEL,
  parseDashScopeFrame,
} from "./llm.ts";

function env(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe("dashScopeConfig", () => {
  it("没有密钥时返回 null，交给知识库降级", () => {
    expect(dashScopeConfig(env({}))).toBeNull();
    expect(dashScopeConfig(env({ DASHSCOPE_API_KEY: "   " }))).toBeNull();
  });

  it("默认使用公开兼容端点与 qwen4-max", () => {
    const config = dashScopeConfig(env({ DASHSCOPE_API_KEY: "sk-test" }));
    expect(config).toEqual({
      apiKey: "sk-test",
      model: DEFAULT_DASHSCOPE_MODEL,
      baseUrl: DEFAULT_DASHSCOPE_BASE_URL,
    });
  });

  it("接受 https 覆盖并去掉尾部斜杠", () => {
    const config = dashScopeConfig(
      env({
        DASHSCOPE_API_KEY: "sk-test",
        DASHSCOPE_BASE_URL: "https://example.com/compatible-mode/v1///",
        DASHSCOPE_MODEL: " custom-model ",
      }),
    );
    expect(config?.baseUrl).toBe("https://example.com/compatible-mode/v1");
    expect(config?.model).toBe("custom-model");
  });

  it("拒绝非 https、畸形地址与换行注入", () => {
    expect(
      dashScopeConfig(
        env({ DASHSCOPE_API_KEY: "sk-test", DASHSCOPE_BASE_URL: "http://example.com" }),
      ),
    ).toBeNull();
    expect(
      dashScopeConfig(env({ DASHSCOPE_API_KEY: "sk-test", DASHSCOPE_BASE_URL: "not a url" })),
    ).toBeNull();
    expect(dashScopeConfig(env({ DASHSCOPE_API_KEY: "sk-a\nb" }))).toBeNull();
  });

  it("清洗整行粘贴、包裹引号与 Bearer 前缀", () => {
    expect(dashScopeConfig(env({ DASHSCOPE_API_KEY: "DASHSCOPE_API_KEY=sk-test" }))?.apiKey).toBe(
      "sk-test",
    );
    expect(dashScopeConfig(env({ DASHSCOPE_API_KEY: ' "sk-test" ' }))?.apiKey).toBe("sk-test");
    expect(dashScopeConfig(env({ DASHSCOPE_API_KEY: "Bearer sk-test" }))?.apiKey).toBe("sk-test");
    expect(
      dashScopeConfig(env({ DASHSCOPE_API_KEY: "export DASHSCOPE_API_KEY=sk-test" }))?.apiKey,
    ).toBe("sk-test");
    expect(dashScopeConfig(env({ DASHSCOPE_API_KEY: "DASHSCOPE_API_KEY=" }))).toBeNull();
    expect(
      dashScopeConfig(
        env({
          DASHSCOPE_API_KEY: "DASHSCOPE_API_KEY=sk-a\nDASHSCOPE_BASE_URL=https://example.com",
        }),
      ),
    ).toBeNull();
  });
});

describe("buildChatMessages", () => {
  it("系统提示在前、历史居中、本轮资料问题在最后", () => {
    const messages = buildChatMessages(
      "系统",
      [
        { role: "user", text: "左心室在哪" },
        { role: "assistant", text: " " },
        { role: "assistant", text: "在左心房下方。" },
      ],
      "[资料 1] 左心室",
    );
    expect(messages).toEqual([
      { role: "system", content: "系统" },
      { role: "user", content: "左心室在哪" },
      { role: "assistant", content: "在左心房下方。" },
      { role: "user", content: "[资料 1] 左心室" },
    ]);
  });
});

describe("parseDashScopeFrame", () => {
  it("取出流式内容并识别结束帧", () => {
    const chunk = JSON.stringify({
      choices: [{ delta: { content: "左心室" }, finish_reason: null }],
    });
    expect(parseDashScopeFrame(chunk)).toEqual({ text: "左心室" });
    expect(parseDashScopeFrame("[DONE]")).toEqual({ done: true });
    expect(
      parseDashScopeFrame(JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })),
    ).toEqual({});
  });

  it("识别错误帧与坏 JSON，不把原文透传给用户", () => {
    expect(parseDashScopeFrame(JSON.stringify({ error: { message: "upstream detail" } }))).toEqual({
      failed: true,
    });
    expect(parseDashScopeFrame("{not json")).toEqual({ invalid: true });
  });
});
