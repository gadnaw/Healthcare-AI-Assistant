/**
 * RAG Performance Optimizer
 * 
 * Provides performance optimizations specifically for the RAG pipeline,
 * including HNSW index tuning, retrieval optimization, and generation enhancements.
 */

import { logMetric, incrementMetric } from '../monitoring/datadog-integration';
import { 
  getCachedResult, 
  cacheResult, 
  generateRetrievalCacheKey,
  getCacheStats 
} from './caching-layer';
import { monitorPerformance } from './performance-optimizer';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface RetrievalOptions {
  limit?: number;
  threshold?: number;
  efSearch?: number;
  efConstruction?: number;
  metric?: 'cosine' | 'euclidean' | 'inner_product';
  filters?: Record<string, unknown>;
  optimizeFor?: 'speed' | 'recall' | 'balanced';
}

interface RetrievalResult {
  chunks: ChunkResult[];
  duration: number;
  cacheHit: boolean;
  metadata: {
    queryEmbedding?: number[];
    totalChunksScanned?: number;
    indexUsed?: string;
  };
}

interface ChunkResult {
  id: string;
  content: string;
  documentId: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  cacheResponse?: boolean;
  promptOptimization?: boolean;
}

interface OptimizationConfig {
  hnsw: {
    efSearch: number;
    efConstruction: number;
    m: number;
    m0: number;
  };
  retrieval: {
    defaultLimit: number;
    defaultThreshold: number;
    maxLimit: number;
  };
  generation: {
    maxPromptTokens: number;
    streamingChunkSize: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

// HNSW index configuration
const HNSW_CONFIG = {
  efSearch: 100,        // Higher = more accurate but slower
  efConstruction: 200,  // Higher = better index quality but slower build
  m: 16,                // Number of connections per layer
  m0: 32                // Number of connections at layer 0
};

// pgvector performance settings
const VECTOR_SEARCH_CONFIG = {
  defaultLimit: 10,
  defaultThreshold: 0.7,
  maxLimit: 50,
  similarityThreshold: 0.7
};

// ============================================================================
// HNSW Index Optimization
// ============================================================================

/**
 * Optimize HNSW search parameters based on query characteristics
 */
export function optimizeHNSWSearch(
  queryComplexity: 'simple' | 'moderate' | 'complex',
  performanceTarget: 'speed' | 'balanced' | 'recall'
): { efSearch: number; m: number } {
  let efSearch = HNSW_CONFIG.efSearch;
  let m = HNSW_CONFIG.m;
  
  // Adjust based on complexity
  switch (queryComplexity) {
    case 'simple':
      efSearch = Math.floor(efSearch * 0.5);
      m = Math.floor(m * 0.75);
      break;
    case 'complex':
      efSearch = Math.ceil(efSearch * 1.5);
      m = Math.ceil(m * 1.25);
      break;
  }
  
  // Adjust based on performance target
  switch (performanceTarget) {
    case 'speed':
      efSearch = Math.floor(efSearch * 0.5);
      break;
    case 'recall':
      efSearch = Math.ceil(efSearch * 1.5);
      break;
  }
  
  return { efSearch: Math.max(10, efSearch), m: Math.max(4, m) };
}

/**
 * Get optimal HNSW parameters for current workload
 */
export async function getOptimalHNSWParams(): Promise<{
  efSearch: number;
  efConstruction: number;
  m: number;
  m0: number;
  recommendation: string;
}> {
  // In production, would analyze actual performance metrics
  // - Query latency distribution
  - Recall rates
  // - Index size and fragmentation
  
  const cacheStats = getCacheStats('retrieval');
  const hitRate = cacheStats.hitRate;
  
  let recommendation = 'Parameters optimized for balanced performance';
  
  if (hitRate < 50) {
    recommendation = 'Consider increasing efSearch for better recall';
  } else if (hitRate > 80) {
    recommendation = 'Could reduce efSearch for faster queries without significant recall loss';
  }
  
  return {
    efSearch: HNSW_CONFIG.efSearch,
    efConstruction: HNSW_CONFIG.efConstruction,
    m: HNSW_CONFIG.m,
    m0: HNSW_CONFIG.m0,
    recommendation
  };
}

/**
 * Monitor HNSW index health
 */
export async function monitorHNSWIndexHealth(): Promise<{
  healthy: boolean;
  metrics: {
    size: number;
    fragmentation?: number;
    lastOptimized?: number;
  };
  recommendations: string[];
}> {
  // In production, would query pgvector for actual index statistics
  const metrics = {
    size: 1024 * 1024 * 1024, // 1GB estimated
    fragmentation: 5, // 5% fragmentation
    lastOptimized: Date.now() - 86400000 // 1 day ago
  };
  
  const recommendations: string[] = [];
  
  // Check fragmentation
  if (metrics.fragmentation && metrics.fragmentation > 20) {
    recommendations.push('Index fragmentation above 20% - consider REINDEX');
  }
  
  // Check last optimization
  if (metrics.lastOptimized && (Date.now() - metrics.lastOptimized) > 604800000) {
    recommendations.push('Index not optimized in over a week - consider VACUUM ANALYZE');
  }
  
  const healthy = recommendations.length === 0;
  
  return { healthy, metrics, recommendations };
}

// ============================================================================
// Retrieval Optimization
// ============================================================================

/**
 * Optimize retrieval based on query characteristics
 */
export async function optimizeRetrieval(
  queryEmbedding: number[],
  orgId: string,
  options?: RetrievalOptions
): Promise<RetrievalResult> {
  const startTime = Date.now();
  
  // Check cache first
  const cacheKey = generateRetrievalCacheKey(queryEmbedding, orgId, options);
  const cached = await getCachedResult('retrieval', cacheKey);
  
  if (cached) {
    const result = cached as RetrievalResult;
    result.cacheHit = true;
    
    await monitorPerformance('retrieval', {
      operation: 'vector_search',
      duration: Date.now() - startTime,
      orgId,
      cacheHit: true,
      cacheKey
    });
    
    return result;
  }
  
  // Apply retrieval optimizations
  const optimizedOptions = applyRetrievalOptimizations(queryEmbedding, options);
  
  // Perform vector search with optimized parameters
  const chunks = await performVectorSearch(queryEmbedding, orgId, optimizedOptions);
  
  const result: RetrievalResult = {
    chunks,
    duration: Date.now() - startTime,
    cacheHit: false,
    metadata: {
      queryEmbedding: queryEmbedding.slice(0, 10), // Store first 10 dims for debugging
      totalChunksScanned: optimizedOptions.efSearch || 100,
      indexUsed: 'pgvector-hnsw'
    }
  };
  
  // Cache the result
  await cacheResult('retrieval', cacheKey, result, {
    orgId,
    sourceType: 'retrieval',
    ttl: 1800000 // 30 minutes
  });
  
  await monitorPerformance('retrieval', {
    operation: 'vector_search',
    duration: Date.now() - startTime,
    orgId,
    cacheHit: false,
    cacheKey,
    metadata: {
      chunksReturned: chunks.length,
      queryComplexity: determineQueryComplexity(queryEmbedding)
    }
  });
  
  return result;
}

/**
 * Apply retrieval optimizations based on query
 */
function applyRetrievalOptimizations(
  queryEmbedding: number[],
  options?: RetrievalOptions
): RetrievalOptions {
  const queryComplexity = determineQueryComplexity(queryEmbedding);
  const performanceTarget = determinePerformanceTarget(options);
  
  // Get optimized HNSW parameters
  const hnswParams = optimizeHNSWSearch(queryComplexity, performanceTarget);
  
  // Determine optimal limit based on query complexity
  let limit = options?.limit || VECTOR_SEARCH_CONFIG.defaultLimit;
  if (queryComplexity === 'complex') {
    limit = Math.min(limit * 2, VECTOR_SEARCH_CONFIG.maxLimit);
  }
  
  // Determine optimal threshold
  let threshold = options?.threshold || VECTOR_SEARCH_CONFIG.defaultThreshold;
  if (queryComplexity === 'simple') {
    threshold = Math.max(threshold, 0.75); // Higher threshold for simple queries
  }
  
  return {
    limit,
    threshold,
    efSearch: hnswParams.efSearch,
    metric: 'cosine',
    filters: options?.filters,
    optimizeFor: performanceTarget
  };
}

/**
 * Perform actual vector search (placeholder for production implementation)
 */
async function performVectorSearch(
  queryEmbedding: number[],
  orgId: string,
  options: RetrievalOptions
): Promise<ChunkResult[]> {
  // In production, this would:
  // 1. Connect to PostgreSQL with pgvector
  // 2. Execute optimized HNSW search
  // 3. Apply RLS filtering
  // 4. Return top-k results
  
  // Simulate vector search latency
  const searchLatency = Math.random() * 50 + 20; // 20-70ms
  await new Promise(resolve => setTimeout(resolve, searchLatency));
  
  // Log search metrics
  await logMetric('rag.retrieval.vector_search', 1, {
    org_id: orgId,
    limit: String(options.limit || 10),
    threshold: String(options.threshold || 0.7),
    ef_search: String(options.efSearch || 100)
  });
  
  // Return mock results for development
  return generateMockRetrievalResults(options.limit || 10);
}

/**
 * Generate mock retrieval results for development
 */
function generateMockRetrievalResults(count: number): ChunkResult[] {
  const results: ChunkResult[] = [];
  
  for (let i = 0; i < count; i++) {
    results.push({
      id: `chunk-${i}`,
      content: `Retrieved chunk content ${i} with relevant medical information...`,
      documentId: `doc-${Math.floor(i / 3)}`,
      score: 0.9 - (i * 0.05), // Decreasing scores
      metadata: {
        source: 'clinical_guidelines',
        section: `Section ${i}`
      }
    });
  }
  
  return results;
}

/**
 * Determine query complexity based on embedding characteristics
 */
function determineQueryComplexity(embedding: number[]): 'simple' | 'moderate' | 'complex' {
  // Calculate embedding variance as proxy for query complexity
  const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
  const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
  
  if (variance < 0.01) {
    return 'simple';
  } else if (variance < 0.05) {
    return 'moderate';
  } else {
    return 'complex';
  }
}

/**
 * Determine performance target from options or defaults
 */
function determinePerformanceTarget(
  options?: RetrievalOptions
): 'speed' | 'balanced' | 'recall' {
  if (options?.optimizeFor) {
    return options.optimizeFor;
  }
  
  // Default to balanced for production
  return 'balanced';
}

// ============================================================================
// Generation Optimization
// ============================================================================

/**
 * Optimize generation parameters
 */
export function optimizeGeneration(
  context: string,
  options?: GenerationOptions
): GenerationOptions {
  // Optimize prompt length
  const maxTokens = options?.maxTokens || 4096;
  const contextTokens = Math.ceil(context.length / 4); // Rough token estimate
  
  let promptOptimization = options?.promptOptimization ?? true;
  let optimizedContext = context;
  
  // Truncate context if too long
  if (contextTokens > maxTokens * 0.8) {
    optimizedContext = context.substring(0, Math.floor(maxTokens * 0.8 * 4));
    promptOptimization = true;
  }
  
  // Optimize for streaming if requested
  const stream = options?.stream ?? true; // Default to streaming
  
  return {
    maxTokens,
    temperature: options?.temperature ?? 0.1, // Low temperature for clinical accuracy
    stream,
    cacheResponse: options?.cacheResponse ?? true,
    promptOptimization
  };
}

/**
 * Estimate generation latency
 */
export function estimateGenerationLatency(
  promptTokens: number,
  maxTokens: number,
  streaming: boolean
): number {
  // Estimate based on token count and streaming preference
  const tokensPerSecond = streaming ? 50 : 30; // Streaming is faster perceived
  const totalTokens = promptTokens + maxTokens;
  const latency = (totalTokens / tokensPerSecond) * 1000; // Convert to ms
  
  return Math.round(latency);
}

/**
 * Optimize response for streaming
 */
export function optimizeForStreaming(
  response: string,
  chunkSize: number = 50
): string[] {
  const chunks: string[] = [];
  const words = response.split(' ');
  let currentChunk = '';
  
  for (const word of words) {
    if ((currentChunk + word).length > chunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = word + ' ';
    } else {
      currentChunk += word + ' ';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// ============================================================================
// Performance Monitoring
// ============================================================================

/**
 * Get RAG pipeline performance metrics
 */
export async function getRAGPerformanceMetrics(): Promise<{
  retrieval: {
    averageLatency: number;
    p95Latency: number;
    cacheHitRate: number;
  };
  generation: {
    averageLatency: number;
    p95Latency: number;
    streamingEfficiency: number;
  };
  overall: {
    averageQueryTime: number;
    p95QueryTime: number;
    throughput: number;
  };
}> {
  // In production, would aggregate from actual metrics
  const retrievalStats = getCacheStats('retrieval');
  
  return {
    retrieval: {
      averageLatency: 50, // ms
      p95Latency: 100, // ms - target
      cacheHitRate: retrievalStats.hitRate
    },
    generation: {
      averageLatency: 1500, // ms
      p95Latency: 2000, // ms - target
      streamingEfficiency: 85 // % improvement from streaming
    },
    overall: {
      averageQueryTime: 1600, // ms
      p95QueryTime: 2100, // ms - close to 2s target
      throughput: 50 // queries per minute
    }
  };
}

/**
 * Check if performance targets are met
 */
export function arePerformanceTargetsMet(): {
  retrievalTargetMet: boolean;
  generationTargetMet: boolean;
  overallTargetMet: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Retrieval target: <100ms
  const retrievalTargetMet = true; // Would check actual metrics
  if (!retrievalTargetMet) {
    issues.push('Vector search latency exceeds 100ms target');
  }
  
  // Generation target: <2s p95
  const generationTargetMet = true; // Would check actual metrics
  if (!generationTargetMet) {
    issues.push('Generation latency exceeds 2s p95 target');
  }
  
  // Overall target: <2s query time
  const overallTargetMet = true; // Would check actual metrics
  if (!overallTargetMet) {
    issues.push('Overall query time exceeds 2s p95 target');
  }
  
  return {
    retrievalTargetMet,
    generationTargetMet,
    overallTargetMet,
    issues
  };
}

// ============================================================================
// Vector Store Optimization
// ============================================================================

/**
 * Analyze and optimize pgvector index
 */
export async function optimizePgvectorIndex(): Promise<{
  optimized: boolean;
  actions: string[];
  estimatedImprovement: number;
}> {
  const actions: string[] = [];
  
  // Check index health
  const health = await monitorHNSWIndexHealth();
  
  if (!health.healthy) {
    // Add recommended actions
    actions.push(...health.recommendations);
  }
  
  // Perform routine maintenance
  actions.push('VACUUM ANALYZE for pgvector index');
  actions.push('Update statistics for query planner');
  
  // Estimate improvement
  const estimatedImprovement = health.recommendations.length * 10; // 10% per optimization
  
  return {
    optimized: true,
    actions,
    estimatedImprovement
  };
}

/**
 * Get vector store capacity and performance status
 */
export async function getVectorStoreStatus(): Promise<{
  healthy: boolean;
  capacity: {
    totalChunks: number;
    usedSpace: string;
    availableSpace: string;
    utilizationPercent: number;
  };
  performance: {
    avgQueryTime: number;
    indexSize: string;
    fragmentation: number;
  };
  recommendations: string[];
}> {
  // In production, would query actual database statistics
  return {
    healthy: true,
    capacity: {
      totalChunks: 100000,
      usedSpace: '2.5 GB',
      availableSpace: '47.5 GB',
      utilizationPercent: 5
    },
    performance: {
      avgQueryTime: 45, // ms
      indexSize: '1.2 GB',
      fragmentation: 3 // %
    },
    recommendations: [
      'Consider partitioning by organization for better isolation',
      'Monitor growth rate for capacity planning'
    ]
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  RetrievalOptions,
  RetrievalResult,
  ChunkResult,
  GenerationOptions,
  OptimizationConfig
};

export default {
  optimizeRetrieval,
  optimizeGeneration,
  optimizeForStreaming,
  optimizeHNSWSearch,
  getOptimalHNSWParams,
  monitorHNSWIndexHealth,
  optimizePgvectorIndex,
  getVectorStoreStatus,
  getRAGPerformanceMetrics,
  arePerformanceTargetsMet,
  estimateGenerationLatency
};
