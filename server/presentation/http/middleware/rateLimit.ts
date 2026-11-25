import {
  MemoryStore,
  rateLimiter,
  type ClientRateLimitInfo,
} from 'hono-rate-limiter';
import type { ApiContext, AppEnv } from '../types';

const registeredStores = new Set<ManagedMemoryStore>();

class ManagedMemoryStore extends MemoryStore<{ Bindings: AppEnv }> {
  private windowDurationMs = 60_000;

  override init(options: { windowMs: number }): void {
    this.windowDurationMs = options.windowMs;
    registeredStores.add(this);
  }

  override increment(key: string): ClientRateLimitInfo {
    const now = Date.now();
    if (this.current.size > 5000) {
      for (const [entryKey, entry] of this.current.entries()) {
        if (entry.resetTime.getTime() <= now) {
          this.current.delete(entryKey);
        }
      }
    }
    const existing = this.current.get(key);
    if (existing && existing.resetTime.getTime() > now) {
      existing.totalHits += 1;
      return existing;
    }
    const created: Required<ClientRateLimitInfo> = {
      totalHits: 1,
      resetTime: new Date(now + this.windowDurationMs),
    };
    this.current.set(key, created);
    return created;
  }

  override shutdown(): void {
    super.shutdown();
    registeredStores.delete(this);
  }
}

function getClientRateLimitKey(c: ApiContext): string {
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = c.req.header('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'local-client';
}

export function createApiRateLimiter(options: {
  windowMs: number;
  limit: number;
  message: string;
}) {
  const store = new ManagedMemoryStore();
  return rateLimiter<{ Bindings: AppEnv }>({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-6',
    store,
    keyGenerator: getClientRateLimitKey,
    handler: (c) => {
      return c.json({ error: options.message }, 429);
    },
  });
}

export const apiRateLimiter = createApiRateLimiter({
  windowMs: 60_000,
  limit: 120,
  message: 'Too many API requests. Please wait a moment and try again.',
});

export const strictEndpointRateLimiter = createApiRateLimiter({
  windowMs: 60_000,
  limit: 25,
  message: 'Rate limit exceeded for this endpoint. Please retry shortly.',
});

export function shutdownRateLimiters(): void {
  for (const store of Array.from(registeredStores)) {
    store.shutdown();
  }
}
