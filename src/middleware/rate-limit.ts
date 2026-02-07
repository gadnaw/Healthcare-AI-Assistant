/**
 * Rate Limiting Middleware
 * 
 * Reusable Next.js middleware for rate limiting API routes.
 * Extracts context from JWT tokens and applies multi-tier rate limiting.
 * 
 * Usage:
 * import { withRateLimiting } from '@/middleware/rate-limit';
 * 
 * export const POST = withRateLimiting(async (request) => {
 *   // Your API handler
 * });
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  RateLimiterService, 
  RateLimitContext, 
  RateLimitResult,
  RateLimitConfig,
  withRateLimiting as createRateLimiter,
  getRateLimiterService 
} from "@/lib/security/rate-limiter";

// =============================================================================
// Context Extraction from JWT/Token
// =============================================================================

/**
 * Extract rate limit context from authenticated request
 * In production, this would decode the JWT/token to extract claims
 */
export async function extractRateLimitContext(request: NextRequest): Promise<RateLimitContext> {
  // Get organization ID from JWT token
  // In production, decode JWT and extract from claims
  const orgId = request.headers.get("x-organization-id") || 
                extractFromJWT(request, "orgId") || 
                "default-org";
  
  // Get user ID from JWT token
  const userId = request.headers.get("x-user-id") || 
                 extractFromJWT(request, "userId") || 
                 "default-user";
  
  // Get session ID from JWT token or cookie
  const sessionId = request.headers.get("x-session-id") || 
                    getSessionCookie(request) || 
                    generateSessionId();
  
  // Extract client information
  const ipAddress = extractClientIP(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  
  // Check for clinical priority header
  const clinicalPriority = request.headers.get("x-clinical-priority") === "true";
  
  return {
    organizationId: orgId,
    userId,
    sessionId,
    ipAddress,
    userAgent,
    clinicalPriority,
  };
}

/**
 * Extract claim from JWT token
 */
function extractFromJWT(request: NextRequest, claim: string): string | null {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Decode JWT payload (simplified - in production use proper JWT library)
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    
    return payload[claim] || null;
  } catch {
    return null;
  }
}

/**
 * Get session ID from cookie
 */
function getSessionCookie(request: NextRequest): string | null {
  const cookie = request.cookies.get("session_id");
  return cookie?.value || null;
}

/**
 * Generate session ID if not present
 */
function generateSessionId(): string {
  // In production, this would be handled by auth system
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract client IP address from request headers
 */
function extractClientIP(request: NextRequest): string {
  // Check forwarded headers (for proxy setups)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP in the chain (original client)
    return forwarded.split(",")[0].trim();
  }
  
  // Check real IP header
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  
  return "unknown";
}

// =============================================================================
// Middleware Factory
// =============================================================================

/**
 * Create rate limiting middleware for API routes
 * 
 * @param handler - The API route handler to wrap
 * @param options - Optional rate limiting configuration
 * @returns Wrapped handler with rate limiting applied
 * 
 * @example
 * // Simple usage
 * export const POST = withRateLimiting(async (request) => {
 *   // Handle request
 * });
 * 
 * @example
 * // With custom configuration
 * export const POST = withRateLimiting(
 *   async (request) => { /* handler *\/ },
 *   { user: { requests: 30, window: "60 s" } }
 * );
 */
export function withRateLimiting(
  handler: (request: NextRequest, context: RateLimitContext) => Promise<NextResponse>,
  options?: {
    config?: Partial<RateLimitConfig>;
    skipPaths?: string[];
    customContext?: (request: NextRequest) => Promise<RateLimitContext>;
  }
) {
  const { config, skipPaths = [], customContext } = options || {};
  
  return createRateLimiter(async (request: NextRequest, baseContext?: RateLimitContext) => {
    // Get rate limit context
    const context = customContext 
      ? await customContext(request)
      : await extractRateLimitContext(request);
    
    // Apply rate limiting
    const rateLimiter = getRateLimiterService();
    const result = await rateLimiter.limit(context);
    
    // Create response headers
    const headers = new Headers();
    headers.set("X-RateLimit-Limit", String(result.limit));
    headers.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
    headers.set("X-RateLimit-Reset", result.resetAt.toISOString());
    
    // If rate limited, return 429
    if (!result.allowed) {
      // Log rate limit event
      await rateLimiter.logRateLimitEvent("blocked", context, result);
      
      // Check for abuse patterns
      const abuseResult = await rateLimiter.detectAbusePattern(
        context.organizationId,
        context.userId
      );
      
      if (abuseResult.isAbuse) {
        headers.set("X-Abuse-Detected", "true");
        headers.set("X-Abuse-Risk-Level", abuseResult.riskLevel);
        await rateLimiter.logRateLimitEvent("abuse", context, result);
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
            "Retry-After": String(
              Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
            ),
          },
        }
      );
    }
    
    // Execute original handler
    const response = await handler(request, context);
    
    // Add headers to successful response
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }, config);
}

// =============================================================================
// Express-style Middleware (for compatibility)
// =============================================================================

/**
 * Express-style rate limiting middleware for use with API routes
 * 
 * @param options - Middleware configuration options
 * @returns Middleware function
 * 
 * @example
 * // In route.ts
 * export async function POST(request: NextRequest) {
 *   // Apply rate limiting
 *   const rateLimitResult = await rateLimitMiddleware(request);
 *   
 *   if (!rateLimitResult.allowed) {
 *     return new NextResponse(JSON.stringify({
 *       error: "Rate limit exceeded"
 *     }), { status: 429 });
 *   }
 *   
 *   // Continue with handler
 * }
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  options?: {
    organizationId?: string;
    userId?: string;
    sessionId?: string;
    clinicalPriority?: boolean;
  }
): Promise<RateLimitResult> {
  const context = await extractRateLimitContext(request);
  
  // Override with provided values if specified
  if (options?.organizationId) context.organizationId = options.organizationId;
  if (options?.userId) context.userId = options.userId;
  if (options?.sessionId) context.sessionId = options.sessionId;
  if (options?.clinicalPriority !== undefined) {
    context.clinicalPriority = options.clinicalPriority;
  }
  
  const rateLimiter = getRateLimiterService();
  const result = await rateLimiter.limit(context);
  
  // Log the request
  await rateLimiter.logRateLimitEvent(
    result.allowed ? "warning" : "blocked",
    context,
    result
  );
  
  return result;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if request should skip rate limiting
 * Useful for internal IPs, health checks, etc.
 */
export function shouldSkipRateLimit(request: NextRequest): boolean {
  const skipPaths = [
    "/api/health",
    "/api/status",
    "/api/ping",
    "/_next/static",
    "/_next/image",
    "/favicon.ico",
  ];
  
  const pathname = request.nextUrl.pathname;
  
  return skipPaths.some(path => 
    pathname === path || pathname.startsWith(path + "/")
  );
}

/**
 * Create rate limit headers from result
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

/**
 * Create 429 response with rate limit information
 */
export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const headers: Record<string, string> = {
    ...createRateLimitHeaders(result),
    "Content-Type": "application/json",
    "Retry-After": String(
      Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
    ),
  };
  
  return new NextResponse(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers,
    }
  );
}

// =============================================================================
// Re-exports from rate-limiter for convenience
// =============================================================================

export { 
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitContext,
  type AbuseDetectionResult,
} from "@/lib/security/rate-limiter";

export { 
  RateLimiterService,
  getRateLimiterService,
  detectAbusePattern,
  checkRemaining,
  limit,
} from "@/lib/security/rate-limiter";
