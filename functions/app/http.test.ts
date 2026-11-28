import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, readRequestBody, requestClientIp } from "./http.ts";

function streamedRequest(chunks: readonly string[], headers?: HeadersInit): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("https://example.test/chat", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readRequestBody", () => {
  it("按流累计字节并还原中文，不依赖 Content-Length", async () => {
    const result = await readRequestBody(streamedRequest(['{"text":"', "左心室", '"}']));
    expect(result).toEqual({ ok: true, text: '{"text":"左心室"}' });
  });

  it("无 Content-Length 的请求超过字节上限时拒绝", async () => {
    const result = await readRequestBody(streamedRequest(["a".repeat(MAX_BODY_BYTES), "b"]));
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("Content-Length 超限时在读取前拒绝", async () => {
    const request = new Request("https://example.test/chat", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    });
    expect(await readRequestBody(request)).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("requestClientIp", () => {
  it("优先使用网关提供的 x-real-ip", () => {
    const request = new Request("https://example.test/chat", {
      headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.2" },
    });
    expect(requestClientIp(request)).toBe("203.0.113.8");
  });

  it("只信任转发链最右侧地址，避免客户端伪造首项", () => {
    const request = new Request("https://example.test/chat", {
      headers: { "x-forwarded-for": "198.51.100.2, 203.0.113.8" },
    });
    expect(requestClientIp(request)).toBe("203.0.113.8");
  });
});
