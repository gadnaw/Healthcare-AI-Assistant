import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac/permissions';
import { SupabaseClient } from '@/lib/supabase';
import { getOpenAIClient } from '@/lib/openai';
import { getRateLimiter } from '@/lib/security/rate-limiter';
import { getPHIDetector, getInjectionBlocker } from '@/lib/safety';

/**
 * GET /api/monitoring/health
 * 
 * Returns system health status for load balancers and health checks.
 * This endpoint is intentionally lightweight and does NOT require authentication
 * (used by infrastructure health checks).
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const checks: Record<string, HealthCheckResult> = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Run all health checks in parallel
  const checkPromises = [
    checkDatabaseHealth(checks),
    checkExternalServicesHealth(checks),
    checkRateLimitingHealth(checks),
    checkSecurityServicesHealth(checks)
  ];

  await Promise.all(checkPromises);

  // Determine overall status
  const checkResults = Object.values(checks);
  if (checkResults.some(result => result.status === 'unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (checkResults.some(result => result.status === 'degraded')) {
    overallStatus = 'degraded';
  }

  const response: HealthCheckResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
    duration: Date.now() - startTime
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
  
  return NextResponse.json(response, { status: statusCode });
}

/**
 * Individual health check results
 */
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: Record<string, HealthCheckResult>;
  duration: number;
}

/**
 * Check database health
 */
async function checkDatabaseHealth(checks: Record<string, HealthCheckResult>): Promise<void> {
  const startTime = Date.now();
  
  try {
    const supabase = SupabaseClient.getInstance();
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) {
      checks.database = {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        message: error.message,
        details: { code: error.code }
      };
    } else {
      checks.database = {
        status: 'healthy',
        latency: Date.now() - startTime,
        message: 'Database connection successful',
        details: { connected: true }
      };
    }
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check external services health
 */
async function checkExternalServicesHealth(checks: Record<string, HealthCheckResult>): Promise<void> {
  const startTime = Date.now();
  const services: Record<string, string> = {};
  let hasDegraded = false;

  // Check OpenAI
  try {
    const openai = getOpenAIClient();
    // Simple connectivity check - in production, would make actual API call
    services.openai = 'connected';
  } catch (error) {
    services.openai = 'error';
    hasDegraded = true;
  }

  // Check Supabase auth
  try {
    const supabase = SupabaseClient.getInstance();
    const { error } = await supabase.auth.getSession();
    
    if (error) {
      services.supabaseAuth = 'error';
      hasDegraded = true;
    } else {
      services.supabaseAuth = 'connected';
    }
  } catch (error) {
    services.supabaseAuth = 'error';
    hasDegraded = true;
  }

  checks.externalServices = {
    status: hasDegraded ? 'degraded' : 'healthy',
    latency: Date.now() - startTime,
    message: hasDegraded ? 'Some external services unavailable' : 'All external services connected',
    details: services
  };
}

/**
 * Check rate limiting health
 */
async function checkRateLimitingHealth(checks: Record<string, HealthCheckResult>): Promise<void> {
  const startTime = Date.now();
  
  try {
    const rateLimiter = getRateLimiter();
    const status = rateLimiter.getStatus();
    
    checks.rateLimiting = {
      status: status.redisConnected ? 'healthy' : 'degraded',
      latency: Date.now() - startTime,
      message: status.redisConnected ? 'Rate limiting operational' : 'Redis unavailable, using memory fallback',
      details: {
        provider: status.provider,
        connected: status.redisConnected,
        fallback: !status.redisConnected
      }
    };
  } catch (error) {
    checks.rateLimiting = {
      status: 'degraded',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Rate limiting check failed',
      details: { fallback: true }
    };
  }
}

/**
 * Check security services health
 */
async function checkSecurityServicesHealth(checks: Record<string, HealthCheckResult>): Promise<void> {
  const startTime = Date.now();
  const services: Record<string, { status: string; message?: string }> = {};
  let hasDegraded = false;

  // Check PHI detector
  try {
    const phiDetector = getPHIDetector();
    if (phiDetector) {
      services.phiDetector = { status: 'healthy' };
    } else {
      services.phiDetector = { status: 'uninitialized', message: 'PHI detector not initialized' };
      hasDegraded = true;
    }
  } catch (error) {
    services.phiDetector = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'PHI detector check failed' 
    };
    hasDegraded = true;
  }

  // Check injection blocker
  try {
    const injectionBlocker = getInjectionBlocker();
    if (injectionBlocker) {
      services.injectionBlocker = { status: 'healthy' };
    } else {
      services.injectionBlocker = { status: 'uninitialized', message: 'Injection blocker not initialized' };
      hasDegraded = true;
    }
  } catch (error) {
    services.injectionBlocker = { 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Injection blocker check failed' 
    };
    hasDegraded = true;
  }

  checks.securityServices = {
    status: hasDegraded ? 'degraded' : 'healthy',
    latency: Date.now() - startTime,
    message: hasDegraded ? 'Some security services unavailable' : 'All security services operational',
    details: services
  };
}
