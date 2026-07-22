import Redis from 'ioredis';

/**  Documentation §3.2 Gateway — coarse per-IP rate limiting (Redis fixed window) */
export class GatewayRateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(scope: string, id: string, limit: number, windowSeconds: number): Promise<boolean> {
    // Local/load harness only — never enable in production
    if (process.env.LOAD_TEST_BYPASS === 'true' || process.env.LOAD_TEST_BYPASS === '1') {
      return true;
    }
    const key = `rl:gw:${scope}:${id}`;
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return n <= limit;
  }
}
