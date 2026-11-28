export interface RateLimitPolicy {
  windowMs: number;
  limit: number;
  dailyLimit: number;
  maxBuckets: number;
  now?: () => number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly policy: RateLimitPolicy;
  private dayKey = "";
  private dailyCount = 0;

  constructor(policy: RateLimitPolicy) {
    this.policy = policy;
    this.now = policy.now ?? Date.now;
  }

  allow(key: string): boolean {
    const now = this.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.dayKey) {
      this.dayKey = day;
      this.dailyCount = 0;
    }
    if (this.dailyCount >= this.policy.dailyLimit) return false;

    const recent = (this.buckets.get(key) ?? []).filter(
      (stamp) => now - stamp < this.policy.windowMs,
    );
    if (recent.length >= this.policy.limit) {
      this.buckets.set(key, recent);
      return false;
    }

    if (!this.buckets.has(key) && this.buckets.size >= this.policy.maxBuckets) {
      this.pruneStale(now);
      if (this.buckets.size >= this.policy.maxBuckets) this.evictOldest(now);
    }

    recent.push(now);
    this.buckets.set(key, recent);
    this.dailyCount += 1;
    return true;
  }

  private pruneStale(now: number): void {
    for (const [key, stamps] of this.buckets) {
      if (stamps.every((stamp) => now - stamp >= this.policy.windowMs)) {
        this.buckets.delete(key);
      }
    }
  }

  private evictOldest(now: number): void {
    let oldestKey: string | undefined;
    let oldestStamp = now;
    for (const [key, stamps] of this.buckets) {
      const first = stamps[0] ?? now;
      if (first <= oldestStamp) {
        oldestStamp = first;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) this.buckets.delete(oldestKey);
  }
}
