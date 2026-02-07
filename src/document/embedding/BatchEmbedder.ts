import { EmbeddingService, createEmbeddingService } from './EmbeddingService';

/**
 * BatchEmbedder - Concurrent batch embedding with rate limiting
 * 
 * Handles batch processing of chunks with concurrency control,
 * progress tracking, retry logic, and cost estimation.
 */
export class BatchEmbedder {
  private embeddingService: EmbeddingService;
  private batchSize: number;
  private concurrency: number;
  private maxRetries: number;
  private retryDelay: number;
  private onProgress?: (progress: {
    completed: number;
    total: number;
    percentage: number;
    currentBatch: number;
    totalBatches: number;
  }) => void;

  constructor(config: {
    embeddingService?: EmbeddingService;
    batchSize?: number;
    concurrency?: number;
    maxRetries?: number;
    retryDelay?: number;
    onProgress?: (progress: {
      completed: number;
      total: number;
      percentage: number;
      currentBatch: number;
      totalBatches: number;
    }) => void;
  } = {}) {
    this.embeddingService = config.embeddingService || createEmbeddingService();
    this.batchSize = config.batchSize || 100;
    this.concurrency = config.concurrency || 3;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.onProgress = config.onProgress;
  }

  /**
   * Process chunks in batches with concurrency
   */
  async batchEmbed(
    chunks: string[]
  ): Promise<{
    embeddings: (number[] | null)[];
    statistics: {
      totalChunks: number;
      successfulEmbeddings: number;
      failedEmbeddings: number;
      totalBatches: number;
      totalRetries: number;
      totalCost: number;
    };
  }> {
    if (!chunks || chunks.length === 0) {
      return {
        embeddings: [],
        statistics: {
          totalChunks: 0,
          successfulEmbeddings: 0,
          failedEmbeddings: 0,
          totalBatches: 0,
          totalRetries: 0,
          totalCost: 0
        }
      };
    }

    const statistics = {
      totalChunks: chunks.length,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      totalBatches: 0,
      totalRetries: 0,
      totalCost: 0
    };

    // Calculate total batches
    const totalBatches = Math.ceil(chunks.length / this.batchSize);
    const embeddings: (number[] | null)[] = new Array(chunks.length).fill(null);

    // Process batches with concurrency limit
    let completedChunks = 0;
    let totalRetries = 0;

    for (let batchStart = 0; batchStart < chunks.length; batchStart += this.batchSize * this.concurrency) {
      const batchPromises: Promise<void>[] = [];
      
      // Create concurrent batch promises
      for (let offset = 0; offset < this.batchSize * this.concurrency; offset += this.batchSize) {
        const batchIndex = batchStart + offset;
        
        if (batchIndex >= chunks.length) {
          break;
        }

        const batchEnd = Math.min(batchIndex + this.batchSize, chunks.length);
        const batchChunks = chunks.slice(batchIndex, batchEnd);
        const batchNumber = Math.floor(batchIndex / this.batchSize) + 1;

        const batchPromise = this.processBatch(batchChunks, batchNumber, totalBatches)
          .then(({ results, retries }) => {
            // Map results back to original positions
            results.forEach((embedding, index) => {
              const originalIndex = batchIndex + index;
              if (embedding) {
                embeddings[originalIndex] = embedding;
                statistics.successfulEmbeddings++;
              } else {
                statistics.failedEmbeddings++;
              }
            });
            statistics.totalRetries += retries;
            completedChunks += results.length;
          })
          .catch(error => {
            console.error(`Batch ${batchNumber} failed:`, error);
            statistics.failedEmbeddings += (batchEnd - batchIndex);
          });

        batchPromises.push(batchPromise);
      }

      // Wait for all concurrent batches to complete
      await Promise.all(batchPromises);

      // Report progress
      if (this.onProgress) {
        this.onProgress({
          completed: Math.min(completedChunks, chunks.length),
          total: chunks.length,
          percentage: Math.round((completedChunks / chunks.length) * 100),
          currentBatch: Math.min(Math.floor(batchStart / this.batchSize) + this.concurrency, totalBatches),
          totalBatches
        });
      }
    }

    statistics.totalBatches = totalBatches;
    statistics.totalCost = this.estimateCost(statistics.successfulEmbeddings);

    return {
      embeddings,
      statistics
    };
  }

  /**
   * Process single batch with retry logic
   */
  private async processBatch(
    chunks: string[],
    batchNumber: number,
    totalBatches: number
  ): Promise<{ results: (number[] | null)[]; retries: number }> {
    let retries = 0;
    let lastError: Error | null = null;

    while (retries < this.maxRetries) {
      try {
        const results = await this.embeddingService.embedDocuments(chunks);
        return { results, retries };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (retries < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, retries);
          console.warn(
            `Batch ${batchNumber}/${totalBatches} failed, retry ${retries + 1}/${this.maxRetries} after ${delay}ms:`,
            lastError.message
          );
          await this.sleep(delay);
        }
        
        retries++;
      }
    }

    // All retries failed
    console.error(
      `Batch ${batchNumber}/${totalBatches} failed after ${this.maxRetries} retries:`,
      lastError?.message
    );

    // Return null results for all chunks
    return {
      results: chunks.map(() => null),
      retries
    };
  }

  /**
   * Handle oversized chunks by splitting and averaging
   */
  async embedWithFallback(
    oversizedChunk: string,
    maxTokens = 8000
  ): Promise<number[] | null> {
    // Estimate tokens (4 chars per token)
    const estimatedTokens = Math.ceil(oversizedChunk.length / 4);
    
    if (estimatedTokens <= maxTokens) {
      return this.embeddingService.embedChunk(oversizedChunk);
    }

    // Split oversized chunk into smaller pieces
    const pieces: string[] = [];
    const pieceSize = maxTokens * 4; // Convert back to characters

    for (let i = 0; i < oversizedChunk.length; i += pieceSize) {
      pieces.push(oversizedChunk.substring(i, i + pieceSize));
    }

    // Embed each piece and average the results
    const pieceEmbeddings: number[] = [];
    
    for (const piece of pieces) {
      const embedding = await this.embeddingService.embedChunk(piece);
      if (embedding) {
        pieceEmbeddings.push(...embedding);
      }
    }

    if (pieceEmbeddings.length === 0) {
      return null;
    }

    // Average the embeddings dimension-wise
    const dimensions = this.embeddingService.getConfig().dimensions;
    const averagedEmbedding: number[] = new Array(dimensions).fill(0);

    for (let i = 0; i < pieceEmbeddings.length; i++) {
      averagedEmbedding[i % dimensions] += pieceEmbeddings[i];
    }

    // Normalize by number of pieces
    const numPieces = Math.ceil(oversizedChunk.length / pieceSize);
    for (let i = 0; i < dimensions; i++) {
      averagedEmbedding[i] /= numPieces;
    }

    return averagedEmbedding;
  }

  /**
   * Estimate cost for embedding operations
   */
  estimateCost(successfulEmbeddings: number): number {
    // text-embedding-3-small pricing: $0.00002 per 1K tokens
    // Assuming average 500 tokens per chunk
    const avgTokensPerChunk = 500;
    const costPer1KTokens = 0.00002;
    
    return (successfulEmbeddings * avgTokensPerChunk / 1000) * costPer1KTokens;
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    batchSize: number;
    concurrency: number;
    maxRetries: number;
    retryDelay: number;
    embeddingModel: string;
    embeddingDimensions: number;
  } {
    const embeddingConfig = this.embeddingService.getConfig();
    return {
      batchSize: this.batchSize,
      concurrency: this.concurrency,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      embeddingModel: embeddingConfig.model,
      embeddingDimensions: embeddingConfig.dimensions
    };
  }

  /**
   * Set progress callback
   */
  setProgressCallback(
    callback: (progress: {
      completed: number;
      total: number;
      percentage: number;
      currentBatch: number;
      totalBatches: number;
    }) => void
  ): void {
    this.onProgress = callback;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create BatchEmbedder instance
 */
export function createBatchEmbedder(config?: {
  embeddingService?: EmbeddingService;
  batchSize?: number;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  onProgress?: (progress: {
    completed: number;
    total: number;
    percentage: number;
    currentBatch: number;
    totalBatches: number;
  }) => void;
}): BatchEmbedder {
  return new BatchEmbedder(config);
}

export default BatchEmbedder;
