import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.ts";

describe("RateLimiter", () => {
  it("按 IP 限制窗口内请求数，并在窗口结束后恢复", () => {
    let now = 0;
    const limiter = new RateLimiter({
      windowMs: 1_000,
      limit: 2,
      dailyLimit: 10,
      maxBuckets: 8,
      now: () => now,
    });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    now = 1_000;
    expect(limiter.allow("a")).toBe(true);
  });

  it("全站每日额度跨 IP 生效", () => {
    const limiter = new RateLimiter({
      windowMs: 1_000,
      limit: 10,
      dailyLimit: 2,
      maxBuckets: 8,
      now: () => 0,
    });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("c")).toBe(false);
  });

  it("桶数量达到硬上限时淘汰最旧 IP", () => {
    let now = 0;
    const limiter = new RateLimiter({
      windowMs: 10_000,
      limit: 10,
      dailyLimit: 20,
      maxBuckets: 2,
      now: () => now,
    });
    expect(limiter.allow("a")).toBe(true);
    now = 1;
    expect(limiter.allow("b")).toBe(true);
    now = 2;
    expect(limiter.allow("c")).toBe(true);
    now = 3;
    expect(limiter.allow("a")).toBe(true);
  });
});
