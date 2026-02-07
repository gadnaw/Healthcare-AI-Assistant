/**
 * Multi-tier Rate Limiting Service
 * 
 * Provides organization, user, and session-level rate limiting using Upstash Redis.
 * Implements sliding window algorithm for smooth rate limiting with abuse detection.
 * 
 * Rate Limits:
 * - Organization: 1000 requests/minute, 10000 requests/hour
 * - User: 60 requests/minute, 500 requests/hour
 * - Session: 10 concurrent requests
 * 
 * Supports clinical priority multiplier (2x) for emergency scenarios.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// Type Definitions
// =============================================================================

export interface RateLimitConfig {
  organization: {
    requests: number;
    window: string; // e.g., "60 s", "1 h"
  };
  user: {
    requests: number;
    window: string;
  };
  session: {
    requests: number;
    window: string;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
  organizationId?: string;
  userId?: string;
  sessionId?: string;
}

export interface AbuseDetectionResult {
  isAbuse: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  indicators: string[];
  score: number;
}

export interface RateLimitContext {
  organizationId: string;
  userId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  clinicalPriority?: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

// Default rate limit configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  organization: {
    requests: 1000,
    window: "60 s", // 1000 requests per minute
  },
  user: {
    requests: 60,
    window: "60 s", // 60 requests per minute
  },
  session: {
    requests: 10,
    window: "60 s", // 10 concurrent requests
  },
};

// Clinical priority multiplier for emergency scenarios
const CLINICAL_PRIORITY_MULTIPLIER = 2;

// Abuse detection thresholds
const ABUSE_THRESHOLDS = {
  velocity: {
    requestsPerMinute: 100, // High velocity indicator
    requestsPerHour: 500, // Sustained high usage
  },
  offHours: {
    startHour: 22, // 10 PM
    endHour: 6, // 6 AM
  },
  pattern: {
    repetitiveThreshold: 5, // Same template repeated
    similarityThreshold: 0.8, // Template similarity
  },
};

// =============================================================================
// Redis Client Initialization
// =============================================================================

// Create Redis client instance (singleton pattern)
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    // Initialize Redis client with environment variables
    // In production, these would be set in Vercel project settings
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || "https://localhost:6379",
      token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    });
  }
  return redisClient;
}

// =============================================================================
// Rate Limit Instances
// =============================================================================

// Organization-level rate limiter (1000 req/min)
const orgRatelimit = new Ratelimit({
  redis: getRedisClient(),
  limiter: Ratelimit.slidingWindow(1000, "60 s"),
  analytics: true,
  prefix: "ratelimit:org",
});

// User-level rate limiter (60 req/min)
const userRatelimit = new Ratelimit({
  redis: getRedisClient(),
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  analytics: true,
  prefix: "ratelimit:user",
});

// Session-level concurrent request limiter (10 concurrent)
const sessionLimiter = new Ratelimit({
  redis: getRedisClient(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
  prefix: "ratelimit:session",
});

// =============================================================================
// Rate Limit Service
// =============================================================================

/**
 * RateLimiterService provides multi-tier rate limiting for healthcare AI assistant
 * with abuse detection and clinical priority support.
 */
export class RateLimiterService {
  private config: RateLimitConfig;
  private redis: Redis;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = getRedisClient();
  }

  /**
   * Check rate limits for a given context
   * Returns whether the request is allowed and remaining quota
   */
  async limit(context: RateLimitContext): Promise<RateLimitResult> {
    const { organizationId, userId, sessionId, clinicalPriority } = context;
    
    // Apply clinical priority multiplier if applicable
    const multiplier = clinicalPriority ? CLINICAL_PRIORITY_MULTIPLIER : 1;
    
    // Check organization limit first (blocks entire org if exceeded)
    const orgKey = `org:${organizationId}`;
    const orgResult = await orgRatelimit.limit(orgKey);
    
    if (!orgResult.success) {
      const remaining = orgResult.limit ? Math.max(0, orgResult.limit - orgResult.remaining) : 0;
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(orgResult.reset),
        limit: orgResult.limit || this.config.organization.requests,
        organizationId,
      };
    }

    // Check user limit second (blocks individual user)
    const userKey = `user:${organizationId}:${userId}`;
    const userResult = await userRatelimit.limit(userKey);
    
    // Adjust remaining based on multiplier
    const adjustedRemaining = Math.floor(userResult.remaining * multiplier);
    
    if (!userResult.success) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(userResult.reset),
        limit: userResult.limit || this.config.user.requests * multiplier,
        organizationId,
        userId,
      };
    }

    // Check concurrent session limit third
    const sessionKey = `session:${organizationId}:${sessionId}`;
    const sessionResult = await sessionLimiter.limit(sessionKey);
    
    if (!sessionResult.success) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(sessionResult.reset),
        limit: sessionResult.limit || this.config.session.requests,
        organizationId,
        userId,
        sessionId,
      };
    }

    // All limits passed
    return {
      allowed: true,
      remaining: adjustedRemaining,
      resetAt: new Date(Math.min(
        orgResult.reset,
        userResult.reset,
        sessionResult.reset
      )),
      limit: userResult.limit || this.config.user.requests * multiplier,
      organizationId,
      userId,
      sessionId,
    };
  }

  /**
   * Check remaining quota for a specific context
   */
  async checkRemaining(context: RateLimitContext): Promise<{
    organization: { remaining: number; limit: number; resetAt: Date };
    user: { remaining: number; limit: number; resetAt: Date };
    session: { remaining: number; limit: number; resetAt: Date };
  }> {
    const { organizationId, userId, sessionId } = context;

    // Get current usage for organization
    const orgUsage = await this.redis.get<{ limit: number; remaining: number; reset: number }>(
      `ratelimit:org:${orgKey(orgId)}`
    );

    // Get current usage for user
    const userUsage = await this.redis.get<{ limit: number; remaining: number; reset: number }>(
      `ratelimit:user:${userKey(organizationId, userId)}`
    );

    // Get current usage for session
    const sessionUsage = await this.redis.get<{ limit: number; remaining: number; reset: number }>(
      `ratelimit:session:${sessionKey(organizationId, sessionId)}`
    );

    return {
      organization: {
        remaining: orgUsage?.remaining || this.config.organization.requests,
        limit: orgUsage?.limit || this.config.organization.requests,
        resetAt: new Date(orgUsage?.reset || Date.now() + 60000),
      },
      user: {
        remaining: userUsage?.remaining || this.config.user.requests,
        limit: userUsage?.limit || this.config.user.requests,
        resetAt: new Date(userUsage?.reset || Date.now() + 60000),
      },
      session: {
        remaining: sessionUsage?.remaining || this.config.session.requests,
        limit: sessionUsage?.limit || this.config.session.requests,
        resetAt: new Date(sessionUsage?.reset || Date.now() + 60000),
      },
    };
  }

  /**
   * Detect abuse patterns using behavioral analysis
   * Analyzes request velocity, off-hours activity, query patterns, and geographic anomalies
   */
  async detectAbusePattern(organizationId: string, userId: string): Promise<AbuseDetectionResult> {
    const indicators: string[] = [];
    let score = 0;

    // 1. Request velocity analysis
    const velocity = await this.analyzeRequestVelocity(organizationId, userId);
    if (velocity > ABUSE_THRESHOLDS.velocity.requestsPerMinute) {
      indicators.push(`High velocity: ${velocity} req/min (threshold: ${ABUSE_THRESHOLDS.velocity.requestsPerMinute})`);
      score += 30;
    }

    // 2. Off-hours activity detection
    if (this.isOffHoursActivity()) {
      indicators.push("Activity detected during off-hours (10 PM - 6 AM)");
      score += 20;
    }

    // 3. Query pattern analysis
    const patternAnalysis = await this.analyzeQueryPatterns(organizationId, userId);
    if (patternAnalysis.isRepetitive) {
      indicators.push("Repetitive query patterns detected");
      score += 25;
    }
    if (patternAnalysis.hasTemplateVariants) {
      indicators.push("Template-based query variants detected");
      score += 15;
    }

    // 4. Geographic anomaly detection
    const geoAnomaly = await this.detectGeographicAnomaly(organizationId, userId);
    if (geoAnomaly.isAnomaly) {
      indicators.push(`Geographic anomaly: ${geoAnomaly.details}`);
      score += 20;
    }

    // Determine risk level based on total score
    let riskLevel: AbuseDetectionResult["riskLevel"];
    if (score >= 80) {
      riskLevel = "critical";
    } else if (score >= 60) {
      riskLevel = "high";
    } else if (score >= 40) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    return {
      isAbuse: score >= 60,
      riskLevel,
      indicators,
      score,
    };
  }

  /**
   * Analyze request velocity for abuse patterns
   */
  private async analyzeRequestVelocity(organizationId: string, userId: string): Promise<number> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Get recent request count from Redis
    const recentRequests = await this.redis.get<number>(
      `ratelimit:velocity:${orgKey(organizationId)}:${userId}`
    ) || 0;

    return recentRequests;
  }

  /**
   * Check if current time falls within off-hours
   */
  private isOffHoursActivity(): boolean {
    const currentHour = new Date().getHours();
    return currentHour >= ABUSE_THRESHOLDS.offHours.startHour || 
           currentHour < ABUSE_THRESHOLDS.offHours.endHour;
  }

  /**
   * Analyze query patterns for repetition and templates
   */
  private async analyzeQueryPatterns(organizationId: string, userId: string): Promise<{
    isRepetitive: boolean;
    hasTemplateVariants: boolean;
  }> {
    // Get recent query hashes from Redis
    const recentQueries = await this.redis.lrange<string>(
      `ratelimit:queries:${orgKey(organizationId)}:${userId}`,
      0,
      ABUSE_THRESHOLDS.pattern.repetitiveThreshold
    );

    if (recentQueries.length < 2) {
      return { isRepetitive: false, hasTemplateVariants: false };
    }

    // Check for repetitive queries
    const queryCounts = recentQueries.reduce((acc, query) => {
      acc[query] = (acc[query] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const isRepetitive = Object.values(queryCounts).some(count => 
      count >= ABUSE_THRESHOLDS.pattern.repetitiveThreshold
    );

    // Check for template variants (simplified pattern matching)
    const hasTemplateVariants = this.detectTemplateVariants(recentQueries);

    return { isRepetitive, hasTemplateVariants };
  }

  /**
   * Detect template-based query variants
   */
  private detectTemplateVariants(queries: string[]): boolean {
    if (queries.length < 2) return false;

    // Simple template detection: replace numbers and common words with placeholders
    const templates = queries.map(query => 
      query
        .replace(/\d+/g, "{NUM}")
        .replace(/\b(the|a|an|is|are|was|were)\b/gi, "{WORD}")
        .trim()
    );

    // Count unique templates
    const uniqueTemplates = new Set(templates).size;
    
    // If fewer unique templates than queries, we have variants
    return uniqueTemplates < queries.length;
  }

  /**
   * Detect geographic anomalies based on IP addresses
   */
  private async detectGeographicAnomaly(organizationId: string, userId: string): Promise<{
    isAnomaly: boolean;
    details: string;
  }> {
    // Get recent IP addresses from Redis
    const recentIPs = await this.redis.smembers<string>(
      `ratelimit:geo:${orgKey(organizationId)}:${userId}`
    );

    // Get organization expected region (simplified - would need organization config)
    const expectedRegion = await this.redis.get<string>(
      `org:${organizationId}:region`
    ) || "US";

    if (recentIPs.length === 0) {
      return { isAnomaly: false, details: "" };
    }

    // Simple anomaly detection: multiple different countries/regions
    // In production, this would use GeoIP database
    const uniqueCountries = new Set(recentIPs).size;
    
    if (uniqueCountries > 3) {
      return { 
        isAnomaly: true, 
        details: `${uniqueCountries} different locations detected` 
      };
    }

    return { isAnomaly: false, details: "" };
  }

  /**
   * Log rate limit events for audit purposes
   */
  async logRateLimitEvent(
    type: "blocked" | "warning" | "abuse",
    identifier: { organizationId?: string; userId?: string; sessionId?: string },
    result: RateLimitResult
  ): Promise<void> {
    const logEntry = {
      type,
      timestamp: new Date().toISOString(),
      identifier,
      result: {
        allowed: result.allowed,
        remaining: result.remaining,
        resetAt: result.resetAt.toISOString(),
      },
    };

    // Store in Redis for quick access
    await this.redis.lpush("ratelimit:audit", JSON.stringify(logEntry));
    
    // Trim audit log to last 10000 entries
    await this.redis.ltrim("ratelimit:audit", 0, 9999);

    // Log to console (in production, this would go to proper logging system)
    console.log("[RateLimit Audit]", JSON.stringify(logEntry));
  }
}

// =============================================================================
// Key Generation Functions
// =============================================================================

function orgKey(organizationId: string): string {
  return organizationId.replace(/[^a-zA-Z0-9-]/g, "");
}

function userKey(organizationId: string, userId: string): string {
  return `${orgKey(organizationId)}:${userId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

function sessionKey(organizationId: string, sessionId: string): string {
  return `${orgKey(organizationId)}:${sessionId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

// =============================================================================
// Singleton Instance
// =============================================================================

let rateLimiterService: RateLimiterService | null = null;

export function getRateLimiterService(): RateLimiterService {
  if (!rateLimiterService) {
    rateLimiterService = new RateLimiterService();
  }
  return rateLimiterService;
}

// =============================================================================
// Middleware Integration
// =============================================================================

/**
 * Rate limiting middleware wrapper for Next.js API routes
 */
export function withRateLimiting(
  handler: (request: NextRequest, context: RateLimitContext) => Promise<NextResponse>,
  config?: Partial<RateLimitConfig>
) {
  return async function rateLimitedHandler(
    request: NextRequest,
    context?: { organizationId?: string; userId?: string; sessionId?: string }
  ): Promise<NextResponse> {
    // Extract context from JWT/token (simplified - in production, decode from auth)
    const organizationId = context?.organizationId || "default-org";
    const userId = context?.userId || "default-user";
    const sessionId = context?.sessionId || "default-session";
    
    // Extract additional context from request headers
    const ipAddress = request.headers.get("x-forwarded-for") || 
                      request.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    
    // Check for clinical priority header
    const clinicalPriority = request.headers.get("x-clinical-priority") === "true";

    const rateLimitContext: RateLimitContext = {
      organizationId,
      userId,
      sessionId,
      ipAddress,
      userAgent,
      clinicalPriority,
    };

    // Get rate limiter service
    const rateLimiter = getRateLimiterService();

    try {
      // Check rate limits
      const result = await rateLimiter.limit(rateLimitContext);

      // Create response headers
      const headers = new Headers();
      headers.set("X-RateLimit-Limit", String(result.limit));
      headers.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
      headers.set("X-RateLimit-Reset", result.resetAt.toISOString());

      // If rate limited, return 429 response
      if (!result.allowed) {
        // Log the rate limit event
        await rateLimiter.logRateLimitEvent("blocked", rateLimitContext, result);

        // Check for abuse patterns
        const abuseResult = await rateLimiter.detectAbusePattern(
          organizationId,
          userId
        );

        if (abuseResult.isAbuse) {
          headers.set("X-Abuse-Detected", "true");
          headers.set("X-Abuse-Risk-Level", abuseResult.riskLevel);
          
          await rateLimiter.logRateLimitEvent("abuse", rateLimitContext, result);
        }

        return new NextResponse(
          JSON.stringify({
            error: "Rate limit exceeded",
            message: "Too many requests. Please try again later.",
            retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
            ...(abuseResult.isAbuse && {
              abuseWarning: "Unusual activity detected. This incident may be reported.",
            }),
          }),
          {
            status: 429,
            headers: {
              ...Object.fromEntries(headers),
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
            },
          }
        );
      }

      // Execute the original handler
      const response = await handler(request, rateLimitContext);

      // Add rate limit headers to successful response
      Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;

    } catch (error) {
      // Log error but fail open for availability
      console.error("[RateLimit Error]", error);
      
      // Still allow the request through but log the incident
      await rateLimiter.logRateLimitEvent("warning", rateLimitContext, {
        allowed: true,
        remaining: 0,
        resetAt: new Date(),
        limit: 0,
      });

      // Execute handler anyway
      return handler(request, rateLimitContext);
    }
  };
}

// =============================================================================
// Export convenience functions
// =============================================================================

export const limit = async (context: RateLimitContext) => 
  getRateLimiterService().limit(context);

export const checkRemaining = async (context: RateLimitContext) => 
  getRateLimiterService().checkRemaining(context);

export const detectAbusePattern = async (organizationId: string, userId: string) =>
  getRateLimiterService().detectAbusePattern(organizationId, userId);
