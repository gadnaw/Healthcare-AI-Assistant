/**
 * Jailbreak Test API Endpoint
 * 
 * Security team endpoint for running jailbreak tests:
 * - POST /api/security/jailbreak-test/run - Run tests with custom attack
 * 
 * Requires admin role authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  JailbreakTester, 
  JailbreakTestSuite, 
  JailbreakAttack,
  runJailbreakTests,
  runCategoryTests
} from '@/lib/security/jailbreak-tester';
import { 
  JailbreakDefenseService, 
  detectJailbreak 
} from '@/lib/security/jailbreak-defense';
import { hasPermission } from '@/lib/rbac/permissions';
import { auditService } from '@/lib/audit';

// ============================================================================
// API Configuration
// ============================================================================

const jailbreakTester = new JailbreakTester();
const jailbreakDefense = new JailbreakDefenseService();

// ============================================================================
// POST /api/security/jailbreak-test/run
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization
    const authResult = await checkAuth(request);
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    // Parse request body
    const body = await request.json();
    
    // Route based on action
    const { action, ...params } = body;
    
    switch (action) {
      case 'detect':
        return handleDetection(params, authResult.userId);
        
      case 'test_single':
        return handleSingleTest(params, authResult.userId);
        
      case 'test_category':
        return handleCategoryTest(params, authResult.userId);
        
      case 'test_suite':
        return handleSuiteTest(params, authResult.userId);
        
      case 'metrics':
        return handleMetrics(params, authResult.userId);
        
      case 'evaluate_attack':
        return handleEvaluateAttack(params, authResult.userId);
        
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Jailbreak test API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/security/jailbreak-test
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await checkAuth(request);
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    // Return available test categories and attacks
    const categories = jailbreakTester.getAttackCategories();
    const attacks = jailbreakTester.getAllAttacks();
    
    // Get metrics
    const metrics = jailbreakDefense.getDefenseMetrics();
    
    return NextResponse.json({
      categories,
      totalAttacks: attacks.length,
      attacksByCategory: categories.reduce((acc, cat) => {
        acc[cat] = attacks.filter(a => a.category === cat).length;
        return acc;
      }, {} as Record<string, number>),
      metrics: {
        totalRequests: metrics.totalRequests,
        blockedCount: metrics.blockedCount,
        blockedRate: metrics.blockedRate
      },
      endpoints: {
        detect: { method: 'POST', description: 'Detect jailbreak in input' },
        test_single: { method: 'POST', description: 'Test single attack prompt' },
        test_category: { method: 'POST', description: 'Test all attacks in category' },
        test_suite: { method: 'POST', description: 'Run complete test suite' },
        metrics: { method: 'POST', description: 'Get defense metrics' }
      }
    });
    
  } catch (error) {
    console.error('Jailbreak test GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Request Handlers
// ============================================================================

/**
 * Handle jailbreak detection for user input
 */
async function handleDetection(
  params: { input: string },
  userId: string
): Promise<NextResponse> {
  const { input } = params;
  
  if (!input || typeof input !== 'string') {
    return NextResponse.json(
      { error: 'Input is required' },
      { status: 400 }
    );
  }

  // Run detection
  const result = await detectJailbreak(input);
  
  // Log the detection
  await auditService.log({
    action: 'JAILBREAK_API_DETECTION',
    entityType: 'security_test',
    entityId: result.timestamp.toISOString(),
    userId,
    metadata: {
      inputLength: input.length,
      isJailbreak: result.isJailbreak,
      confidence: result.confidence,
      category: result.category,
      severity: result.severity
    }
  });

  return NextResponse.json({
    input: input.substring(0, 100) + (input.length > 100 ? '...' : ''),
    detection: result
  });
}

/**
 * Handle single attack test
 */
async function handleSingleTest(
  params: { prompt: string; category?: string; severity?: string; name?: string },
  userId: string
): Promise<NextResponse> {
  const { prompt, category = 'manual', severity = 'high', name = 'Manual Test' } = params;
  
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json(
      { error: 'Prompt is required' },
      { status: 400 }
    );
  }

  // Create attack object
  const attack: JailbreakAttack = {
    category: category as any,
    severity: severity as any,
    name,
    description: 'Manual test via API',
    prompt,
    expectedDefense: 'blocked'
  };

  // Run evaluation
  const results = await jailbreakTester.evaluateDefense([{
    attack,
    timestamp: new Date(),
    defenseTriggered: false,
    confidence: 0,
    analysis: 'Pending evaluation'
  }}]);

  // Log the test
  await auditService.log({
    action: 'JAILBREAK_API_SINGLE_TEST',
    entityType: 'security_test',
    entityId: new Date().toISOString(),
    userId,
    metadata: {
      category,
      severity,
      name,
      promptLength: prompt.length
    }
  });

  return NextResponse.json({
    attack,
    message: 'Attack evaluated. Use POST /api/security/jailbreak-test/run with action="detect" to test against live system.'
  });
}

/**
 * Handle category-specific test suite
 */
async function handleCategoryTest(
  params: { category: string },
  userId: string
): Promise<NextResponse> {
  const { category } = params;
  
  const validCategories = jailbreakTester.getAttackCategories();
  if (!validCategories.includes(category as any)) {
    return NextResponse.json(
      { error: `Invalid category. Valid categories: ${validCategories.join(', ')}` },
      { status: 400 }
    );
  }

  // Run category test suite
  const suite = await runCategoryTests(category as any);
  
  // Log the test
  await auditService.log({
    action: 'JAILBREAK_API_CATEGORY_TEST',
    entityType: 'security_test',
    entityId: suite.executedAt.toISOString(),
    userId,
    metadata: {
      category,
      totalAttacks: suite.totalAttacks,
      blockedRate: suite.overallBlockedRate,
      successRate: suite.overallSuccessRate
    }
  });

  return NextResponse.json({
    category,
    suite: {
      executedAt: suite.executedAt,
      totalAttacks: suite.totalAttacks,
      overallBlockedRate: suite.overallBlockedRate,
      overallSuccessRate: suite.overallSuccessRate,
      evaluations: suite.evaluations.map(e => ({
        category: e.category,
        blockedRate: e.blockedRate,
        blockedCount: e.blockedCount,
        totalTests: e.totalTests
      })),
      summary: suite.summary
    }
  });
}

/**
 * Handle complete test suite
 */
async function handleSuiteTest(
  params: { sampleSize?: number; categories?: string[] },
  userId: string
): Promise<NextResponse> {
  const { sampleSize, categories } = params;
  
  // Run comprehensive test suite
  const suite = await runJailbreakTests({
    categories: categories as any,
    sampleSize
  });
  
  // Log the test
  await auditService.log({
    action: 'JAILBREAK_API_SUITE_TEST',
    entityType: 'security_test',
    entityId: suite.executedAt.toISOString(),
    userId,
    metadata: {
      totalAttacks: suite.totalAttacks,
      overallBlockedRate: suite.overallBlockedRate,
      overallSuccessRate: suite.overallSuccessRate,
      categories: suite.evaluations.map(e => e.category)
    }
  });

  return NextResponse.json({
    suite: {
      name: suite.suiteName,
      executedAt: suite.executedAt,
      totalAttacks: suite.totalAttacks,
      overallBlockedRate: suite.overallBlockedRate,
      overallSuccessRate: suite.overallSuccessRate,
      evaluations: suite.evaluations.map(e => ({
        category: e.category,
        blockedRate: e.blockedRate,
        averageConfidence: e.averageConfidence,
        phiLeakageCount: e.phiLeakageCount,
        systemPromptRevealCount: e.systemPromptRevealCount
      })),
      summary: suite.summary
    }
  });
}

/**
 * Handle metrics request
 */
async function handleMetrics(
  params: {},
  userId: string
): Promise<NextResponse> {
  const metrics = jailbreakDefense.getDefenseMetrics();
  
  return NextResponse.json({
    metrics: {
      totalRequests: metrics.totalRequests,
      blockedCount: metrics.blockedCount,
      allowedCount: metrics.allowedCount,
      blockedRate: metrics.blockedRate,
      averageConfidence: metrics.averageConfidence,
      falsePositiveRate: metrics.falsePositiveRate,
      lastUpdated: metrics.lastUpdated,
      byCategory: metrics.byCategory,
      bySeverity: metrics.bySeverity
    }
  });
}

/**
 * Handle attack evaluation against defense
 */
async function handleEvaluateAttack(
  params: { prompt: string; category: string; severity: string },
  userId: string
): Promise<NextResponse> {
  const { prompt, category, severity } = params;
  
  if (!prompt) {
    return NextResponse.json(
      { error: 'Prompt is required' },
      { status: 400 }
    );
  }

  // Run detection on the prompt
  const detection = await detectJailbreak(prompt);
  
  // Create attack object for reference
  const attack: JailbreakAttack = {
    category: category as any,
    severity: severity as any,
    name: 'API Evaluation',
    description: 'Attack evaluated via API',
    prompt,
    expectedDefense: 'blocked'
  };

  // Log the evaluation
  await auditService.log({
    action: 'JAILBREAK_API_EVALUATE',
    entityType: 'security_test',
    entityId: new Date().toISOString(),
    userId,
    metadata: {
      category,
      severity,
      isJailbreak: detection.isJailbreak,
      confidence: detection.confidence,
      severity: detection.severity
    }
  });

  return NextResponse.json({
    attack,
    detection,
    defenseAction: detection.isJailbreak ? 'BLOCK' : 'ALLOW',
    response: detection.isJailbreak 
      ? 'Request would be blocked'
      : 'Request would be allowed (with normal processing)'
  });
}

// ============================================================================
// Authentication Helper
// ============================================================================

interface AuthResult {
  authorized: boolean;
  userId?: string;
  error?: string;
  status?: number;
}

async function checkAuth(request: NextRequest): Promise<AuthResult> {
  // In production, this would check session/JWT
  // For now, we check for admin permission
  
  try {
    // Check for admin permission
    const hasAdminPermission = await hasPermission('SYSTEM_CONFIG');
    
    if (!hasAdminPermission) {
      return {
        authorized: false,
        error: 'Admin permission required for jailbreak testing',
        status: 403
      };
    }

    // Get user ID from session/token (placeholder)
    const userId = 'admin'; // Would come from session in production

    return {
      authorized: true,
      userId
    };
    
  } catch (error) {
    return {
      authorized: false,
      error: 'Authentication failed',
      status: 401
    };
  }
}
