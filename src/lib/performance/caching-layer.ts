/**
 * Intelligent Caching Layer
 * 
 * Multi-tier caching system for queries, embeddings, and retrieval results.
 * Optimized for healthcare AI assistant with HIPAA-compliant design.
 */

import { createHash } from 'crypto';
import { logMetric, incrementMetric } from '../monitoring/datadog-integration';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  cacheKey: string;
  metadata?: CacheMetadata;
}

interface CacheMetadata {
  orgId: string;
  userId?: string;
  queryHash?: string;
  documentHash?: string;
  sourceType: 'query' | 'embedding' | 'retrieval';
  ttl: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  ttlVariance: number; // Random variance to prevent thundering herd
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  memoryUsage: number;
}

interface CacheWarmupResult {
  warmed: number;
  failed: number;
  duration: number;
}

// ============================================================================
// Cache Storage
// ============================================================================

// In-memory cache stores (for production, use Redis)
const queryCache = new Map<string, CacheEntry<unknown>>();
const embeddingCache = new Map<string, CacheEntry<number[]>>();
const retrievalCache = new Map<string, CacheEntry<unknown>>();

// Cache statistics
const cacheStats = {
  query: { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0, memoryUsage: 0 },
  embedding: { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0, memoryUsage: 0 },
  retrieval: { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0, memoryUsage: 0 }
};

// ============================================================================
// Configuration
// ============================================================================

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  query: {
    maxSize: 10000,
    defaultTTL: 3600000, // 1 hour
    ttlVariance: 300000 // 5 minutes variance
  },
  embedding: {
    maxSize: 50000,
    defaultTTL: 604800000, // 7 days
    ttlVariance: 86400000 // 1 day variance
  },
  retrieval: {
    maxSize: 20000,
    defaultTTL: 1800000, // 30 minutes
    ttlVariance: 60000 // 1 minute variance
  }
};

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate cache key for query result
 */
export function generateQueryCacheKey(
  query: string,
  orgId: string,
  userId?: string,
  options?: { context?: string; filters?: Record<string, unknown> }
): string {
  const keyData = {
    query: query.toLowerCase().trim(),
    orgId,
    userId,
    options
  };
  
  return `query:${createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 32)}`;
}

/**
 * Generate cache key for embedding
 */
export function generateEmbeddingCacheKey(
  content: string,
  documentId?: string
): string {
  const keyData = {
    content: createHash('sha256').update(content).digest('hex'),
    documentId
  };
  
  return `embedding:${createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 32)}`;
}

/**
 * Generate cache key for retrieval result
 */
export function generateRetrievalCacheKey(
  queryEmbedding: number[],
  orgId: string,
  options?: { limit?: number; threshold?: number; filters?: Record<string, unknown> }
): string {
  // Quantize embedding for cache key (full precision not needed)
  const quantizedEmbedding = queryEmbedding.map(v => Math.round(v * 100) / 100);
  
  const keyData = {
    embedding: quantizedEmbedding,
    orgId,
    options
  };
  
  return `retrieval:${createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 32)}`;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get cached result
 */
export async function getCachedResult<T>(
  cacheType: 'query' | 'embedding' | 'retrieval',
  cacheKey: string
): Promise<T | null> {
  const store = getCacheStore(cacheType);
  const stats = cacheStats[cacheType];
  
  const entry = store.get(cacheKey) as CacheEntry<T> | undefined;
  
  if (!entry) {
    stats.misses++;
    await updateCacheStats(cacheType);
    return null;
  }
  
  // Check if expired
  if (Date.now() > entry.expiresAt) {
    store.delete(cacheKey);
    stats.misses++;
    await updateCacheStats(cacheType);
    return null;
  }
  
  // Update access stats
  entry.accessCount++;
  entry.lastAccessedAt = Date.now();
  stats.hits++;
  
  await updateCacheStats(cacheType);
  
  // Log cache hit for monitoring
  await logCacheEvent(cacheType, 'hit', cacheKey);
  
  return entry.data;
}

/**
 * Cache result with TTL
 */
export async function cacheResult<T>(
  cacheType: 'query' | 'embedding' | 'retrieval',
  cacheKey: string,
  data: T,
  metadata: CacheMetadata
): Promise<void> {
  const store = getCacheStore(cacheType);
  const config = CACHE_CONFIGS[cacheType];
  
  // Calculate TTL with variance
  const ttl = metadata.ttl || config.defaultTTL;
  const ttlVariance = Math.random() * config.ttlVariance;
  const expiresAt = Date.now() + ttl + ttlVariance;
  
  const entry: CacheEntry<T> = {
    data,
    createdAt: Date.now(),
    expiresAt,
    accessCount: 0,
    lastAccessedAt: Date.now(),
    cacheKey,
    metadata
  };
  
  // Evict old entries if at capacity
  if (store.size >= config.maxSize) {
    await evictOldestEntries(cacheType, Math.floor(config.maxSize * 0.1));
  }
  
  store.set(cacheKey, entry);
  
  await updateCacheStats(cacheType);
  await logCacheEvent(cacheType, 'set', cacheKey);
}

/**
 * Invalidate cache entries
 */
export async function invalidateCache(
  cacheType: 'query' | 'embedding' | 'retrieval',
  pattern?: string
): Promise<number> {
  const store = getCacheStore(cacheType);
  let invalidated = 0;
  
  if (!pattern) {
    // Invalidate all entries
    invalidated = store.size;
    store.clear();
  } else {
    // Invalidate matching entries
    for (const [key, entry] of store.entries()) {
      if (key.includes(pattern) || 
          (entry.metadata && JSON.stringify(entry.metadata).includes(pattern))) {
        store.delete(key);
        invalidated++;
      }
    }
  }
  
  await updateCacheStats(cacheType);
  
  await incrementMetric(`cache.${cacheType}.invalidations`, {
    pattern: pattern || 'all'
  });
  
  return invalidated;
}

/**
 * Invalidate cache on document update
 */
export async function invalidateOnDocumentUpdate(
  documentId: string,
  orgId: string
): Promise<void> {
  // Invalidate retrieval cache for this document
  await invalidateCache('retrieval', documentId);
  
  // Invalidate query cache that might reference this document
  // This is a broader invalidation for safety
  await invalidateCache('query', orgId);
  
  // Note: We don't invalidate embedding cache as embeddings are content-hashed
  // and remain valid even if document metadata changes
}

// ============================================================================
// Cache Monitoring
// ============================================================================

/**
 * Get cache statistics
 */
export function getCacheStats(cacheType?: string): CacheStats | Record<string, CacheStats> {
  if (cacheType) {
    return calculateCacheStats(cacheType);
  }
  
  return {
    query: calculateCacheStats('query'),
    embedding: calculateCacheStats('embedding'),
    retrieval: calculateCacheStats('retrieval')
  };
}

/**
 * Calculate cache statistics
 */
function calculateCacheStats(cacheType: string): CacheStats {
  const stats = cacheStats[cacheType as keyof typeof cacheStats];
  const store = getCacheStore(cacheType);
  
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? (stats.hits / total) * 100 : 0;
  
  // Estimate memory usage (rough calculation)
  let memoryUsage = 0;
  for (const entry of store.values()) {
    memoryUsage += JSON.stringify(entry.data).length * 2; // UTF-16
    memoryUsage += JSON.stringify(entry.metadata).length * 2;
  }
  
  return {
    ...stats,
    size: store.size,
    hitRate,
    memoryUsage
  };
}

/**
 * Update cache statistics in monitoring system
 */
async function updateCacheStats(cacheType: string): Promise<void> {
  const stats = calculateCacheStats(cacheType);
  
  await logMetric(`cache.${cacheType}.size`, stats.size);
  await logMetric(`cache.${cacheType}.hit_rate`, stats.hitRate);
  await logMetric(`cache.${cacheType}.memory_usage`, stats.memoryUsage);
  await logMetric(`cache.${cacheType}.hits`, stats.hits);
  await logMetric(`cache.${cacheType}.misses`, stats.misses);
}

/**
 * Log cache event for monitoring
 */
async function logCacheEvent(
  cacheType: string,
  event: 'hit' | 'miss' | 'set' | 'evict',
  cacheKey: string
): Promise<void> {
  await incrementMetric(`cache.${cacheType}.${event}s`, {
    cache_key_prefix: cacheKey.substring(0, 8)
  });
}

// ============================================================================
// Cache Warming
// ============================================================================

/**
 * Warm cache with common queries
 */
export async function warmCache(
  cacheType: 'query' | 'embedding' | 'retrieval',
  entries: Array<{ key: string; data: unknown; metadata: CacheMetadata }>
): Promise<CacheWarmupResult> {
  const startTime = Date.now();
  let warmed = 0;
  let failed = 0;
  
  for (const entry of entries) {
    try {
      await cacheResult(cacheType, entry.key, entry.data, entry.metadata);
      warmed++;
    } catch (error) {
      console.error(`Failed to warm cache entry ${entry.key}:`, error);
      failed++;
    }
  }
  
  const duration = Date.now() - startTime;
  
  await incrementMetric(`cache.${cacheType}.warmup`, {
    warmed: String(warmed),
    failed: String(failed)
  });
  
  return { warmed, failed, duration };
}

/**
 * Pre-warm cache for common clinical queries
 */
export async function warmCommonClinicalQueries(orgId: string): Promise<CacheWarmupResult> {
  const commonQueries = [
    'hypertension treatment guidelines',
    'diabetes mellitus management',
    'acute coronary syndrome symptoms',
    'COPD exacerbation treatment',
    'urinary tract infection diagnosis',
    'stroke protocol',
    'heart failure NYHA classification',
    'chronic kidney disease staging',
    'pneumonia treatment guidelines',
    'migraine treatment protocol'
  ];
  
  const entries = commonQueries.map(query => ({
    key: generateQueryCacheKey(query, orgId),
    data: { query, cached: true, prewarmed: true },
    metadata: {
      orgId,
      sourceType: 'query',
      ttl: 86400000 // 24 hours for clinical queries
    }
  }));
  
  return warmCache('query', entries);
}

// ============================================================================
// Cache Eviction
// ============================================================================

/**
 * Evict oldest entries to make space
 */
async function evictOldestEntries(
  cacheType: string,
  count: number
): Promise<void> {
  const store = getCacheStore(cacheType);
  const stats = cacheStats[cacheType as keyof typeof cacheStats];
  
  // Find oldest entries by access count and time
  const entries = Array.from(store.entries())
    .sort((a, b) => {
      // Prioritize by access count (less accessed = higher priority to evict)
      if (a[1].accessCount !== b[1].accessCount) {
        return a[1].accessCount - b[1].accessCount;
      }
      // Then by last accessed time
      return a[1].lastAccessedAt - b[1].lastAccessedAt;
    })
    .slice(0, count);
  
  for (const [key] of entries) {
    store.delete(key);
    stats.evictions++;
  }
}

/**
 * Clean up expired entries
 */
export async function cleanupExpiredEntries(cacheType: string): Promise<number> {
  const store = getCacheStore(cacheType);
  const stats = cacheStats[cacheType as keyof typeof cacheStats];
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(key);
      cleaned++;
      stats.evictions++;
    }
  }
  
  await updateCacheStats(cacheType);
  
  if (cleaned > 0) {
    await incrementMetric(`cache.${cacheType}.cleanup`, { cleaned: String(cleaned) });
  }
  
  return cleaned;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get cache store for type
 */
function getCacheStore(cacheType: string): Map<string, CacheEntry<unknown>> {
  switch (cacheType) {
    case 'query':
      return queryCache;
    case 'embedding':
      return embeddingCache;
    case 'retrieval':
      return retrievalCache;
    default:
      throw new Error(`Unknown cache type: ${cacheType}`);
  }
}

/**
 * Check if cache hit rate target is met
 */
export function isCacheHitRateTargetMet(): boolean {
  const stats = calculateCacheStats('query');
  return stats.hitRate >= 30; // Target: >30%
}

/**
 * Get cache efficiency score (combination of hit rate and freshness)
 */
export function getCacheEfficiencyScore(): number {
  const stats = calculateCacheStats('query');
  const hitRateScore = Math.min(stats.hitRate / 30, 1) * 50; // 50 points for 30% hit rate
  const freshnessScore = Math.min(stats.size / 1000, 1) * 50; // 50 points for 1000 entries
  
  return hitRateScore + freshnessScore;
}

// ============================================================================
// HIPAA-Compliant Cache Security
// ============================================================================

/**
 * Verify cache entry is safe (no PHI)
 */
export function isCacheEntrySafe(entry: CacheEntry<unknown>): boolean {
  // Check if entry contains sensitive data patterns
  const dataStr = JSON.stringify(entry.data);
  
  // Check for SSN pattern
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(dataStr)) {
    return false;
  }
  
  // Check for MRN pattern
  if (/\bMRN[:\s]*[A-Z0-9]+\b/i.test(dataStr)) {
    return false;
  }
  
  // Check for phone number
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(dataStr)) {
    return false;
  }
  
  return true;
}

/**
 * Sanitize cache entry before storage
 */
export function sanitizeCacheEntry<T>(data: T): T {
  const sanitized = { ...data as object };
  
  // Remove any potential PHI fields
  const sensitiveFields = ['ssn', 'mrn', 'dateOfBirth', 'dob', 'phone', 'email', 'address'];
  
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      delete (sanitized as Record<string, unknown>)[field];
    }
  });
  
  return sanitized as T;
}

// ============================================================================
// Exports
// ============================================================================

export {
  CacheEntry,
  CacheConfig,
  CacheStats,
  CacheMetadata,
  CacheWarmupResult,
  generateQueryCacheKey,
  generateEmbeddingCacheKey,
  generateRetrievalCacheKey,
  getCacheStats,
  isCacheHitRateTargetMet,
  getCacheEfficiencyScore,
  isCacheEntrySafe,
  sanitizeCacheEntry,
  warmCommonClinicalQueries,
  invalidateOnDocumentUpdate
};

export default {
  getCachedResult,
  cacheResult,
  invalidateCache,
  getCacheStats,
  warmCache,
  warmCommonClinicalQueries,
  cleanupExpiredEntries,
  isCacheHitRateTargetMet,
  generateQueryCacheKey,
  generateEmbeddingCacheKey,
  generateRetrievalCacheKey
};
