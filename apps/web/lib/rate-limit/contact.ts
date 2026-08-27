import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface LimitDecision {
  allowed: boolean;
  degraded: boolean;
}

interface ContactLimiters {
  credentials: string;
  hourly: Ratelimit;
  daily: Ratelimit;
}

let cachedLimiters: ContactLimiters | undefined;

function getContactLimiters(url: string, token: string) {
  const credentials = `${url}\u0000${token}`;
  if (cachedLimiters?.credentials === credentials) return cachedLimiters;
  const redis = new Redis({ url, token });
  cachedLimiters = {
    credentials,
    hourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "contact-hour",
    }),
    daily: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 d"),
      prefix: "contact-day",
    }),
  };
  return cachedLimiters;
}

export async function checkContactRateLimit(identifier: string | null): Promise<LimitDecision> {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!identifier || !url || !token) return { allowed: false, degraded: true };
  try {
    const { hourly, daily } = getContactLimiters(url, token);
    const [hour, day] = await Promise.race([
      Promise.all([hourly.limit(identifier), daily.limit(identifier)]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("upstash-timeout")), 2000),
      ),
    ]);
    return { allowed: hour.success && day.success, degraded: false };
  } catch {
    return { allowed: false, degraded: true };
  }
}
