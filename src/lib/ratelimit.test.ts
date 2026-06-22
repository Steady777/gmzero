import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `server-only` throws in a browser bundle; in the node test env we stub it out.
vi.mock("server-only", () => ({}));

import { rateLimit, clientIp, enforceRateLimit } from "./ratelimit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then blocks", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 1000).success).toBe(true);
    }
    const blocked = rateLimit(key, 3, 1000);
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const key = `t-${Math.random()}`;
    rateLimit(key, 1, 1000);
    expect(rateLimit(key, 1, 1000).success).toBe(false);
    vi.setSystemTime(1001);
    expect(rateLimit(key, 1, 1000).success).toBe(true);
  });

  it("tracks keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 1000);
    expect(rateLimit(a, 1, 1000).success).toBe(false);
    expect(rateLimit(b, 1, 1000).success).toBe(true);
  });
});

describe("clientIp", () => {
  it("reads the first x-forwarded-for hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to anon", () => {
    expect(clientIp(new Request("http://x"))).toBe("anon");
  });
});

describe("enforceRateLimit", () => {
  it("returns null while under the limit and a 429 once over", async () => {
    const headers = { "x-forwarded-for": `9.9.9.${Math.floor(Math.random() * 1000)}` };
    const mk = () => new Request("http://x", { headers });
    expect(enforceRateLimit(mk(), "scope", 1, 1000)).toBeNull();
    const res = enforceRateLimit(mk(), "scope", 1, 1000);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("retry-after")).toBeTruthy();
  });
});
