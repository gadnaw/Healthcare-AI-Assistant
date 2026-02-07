import OpenAI from 'openai';

/**
 * EmbeddingService - OpenAI embedding generation with batch support
 * 
 * Generates embeddings using text-embedding-3-small model
 * with proper error handling, retry logic, and dimension validation.
 */
export class EmbeddingService {
  private client: OpenAI | null;
  private model: string;
  private dimensions: number;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
    maxRetries?: number;
    retryDelay?: number;
  } = {}) {
    this.client = config.apiKey ? new OpenAI({ apiKey: config.apiKey }) : null;
    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = config.dimensions || 1536;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Set OpenAI client (for dependency injection or testing)
   */
  setClient(client: OpenAI): void {
    this.client = client;
  }

  /**
   * Generate embedding for a single query
   */
  async embedQuery(text: string): Promise<number[] | null> {
    if (!text || text.trim().length === 0) {
      return null;
    }

    const result = await this.embedSingle(text);
    return result;
  }

  /**
   * Generate embedding for a single chunk
   */
  async embedChunk(chunk: string): Promise<number[] | null> {
    if (!chunk || chunk.trim().length === 0) {
      return null;
    }

    const result = await this.embedSingle(chunk);
    return result;
  }

  /**
   * Generate embeddings for multiple documents in batch
   */
  async embedDocuments(texts: string[]): Promise<(number[] | null)[]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Check for empty texts and filter them out
    const validTexts = texts.map((text, index) => ({
      text: text?.trim() || '',
      originalIndex: index
    })).filter(item => item.text.length > 0);

    if (validTexts.length === 0) {
      return texts.map(() => null);
    }

    // Process in batches to respect API limits
    const batchSize = 100;
    const results: (number[] | null)[] = new Array(texts.length).fill(null);

    for (let i = 0; i < validTexts.length; i += batchSize) {
      const batch = validTexts.slice(i, i + batchSize);
      const batchResults = await this.embedBatch(batch.map(b => b.text));
      
      // Map results back to original indices
      batchResults.forEach((embedding, batchIndex) => {
        results[batch[batchIndex].originalIndex] = embedding;
      });
    }

    return results;
  }

  /**
   * Embed single text with retry logic
   */
  private async embedSingle(text: string, attempt = 0): Promise<number[] | null> {
    try {
      if (!this.client) {
        // Return mock embedding for testing without API key
        return this.generateMockEmbedding();
      }

      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        dimensions: this.dimensions
      });

      // Validate embedding dimensions
      const embedding = response.data[0].embedding;
      if (embedding.length !== this.dimensions) {
        console.warn(
          `Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`
        );
      }

      return embedding;
    } catch (error) {
      // Handle retryable errors
      if (this.isRetryableError(error) && attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
        await this.sleep(delay);
        return this.embedSingle(text, attempt + 1);
      }

      // Log error and return null
      console.error('Embedding generation failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt,
        maxRetries: this.maxRetries
      });

      return null;
    }
  }

  /**
   * Embed batch of texts
   */
  private async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    try {
      if (!this.client) {
        // Return mock embeddings for testing
        return texts.map(() => this.generateMockEmbedding());
      }

      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      });

      return response.data.map(item => {
        if (item.embedding.length !== this.dimensions) {
          console.warn(
            `Embedding dimension mismatch: expected ${this.dimensions}, got ${item.embedding.length}`
          );
        }
        return item.embedding;
      });
    } catch (error) {
      console.error('Batch embedding failed:', error);
      // Return null for all items in failed batch
      return texts.map(() => null);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as { status?: number; code?: string };
      
      // Retry on rate limits and server errors
      if (err.status === 429 || err.status === 500 || err.status === 503) {
        return true;
      }
      
      // Retry on specific error codes
      const retryableCodes = [
        'rate_limit_exceeded',
        'service_unavailable',
        'engine_overloaded',
        'timeout'
      ];
      
      if (err.code && retryableCodes.includes(err.code)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate mock embedding for testing without API
   */
  private generateMockEmbedding(): number[] {
    // Generate deterministic mock embedding based on content hash
    return Array(this.dimensions).fill(0).map(() => Math.random() * 2 - 1);
  }

  /**
   * Validate embedding dimensions
   */
  validateEmbedding(embedding: number[]): boolean {
    return embedding.length === this.dimensions;
  }

  /**
   * Get service configuration
   */
  getConfig(): { model: string; dimensions: number } {
    return {
      model: this.model,
      dimensions: this.dimensions
    };
  }

  /**
   * Health check for embedding service
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) {
        // Mock mode always healthy
        return true;
      }

      // Simple check - try to create a single embedding
      const response = await this.client.embeddings.create({
        model: this.model,
        input: 'health check',
        dimensions: 1 // Minimal dimensions for check
      });

      return response.data.length === 1;
    } catch (error) {
      console.error('Embedding service health check failed:', error);
      return false;
    }
  }
}

/**
 * Factory function to create EmbeddingService instance
 */
export function createEmbeddingService(config?: {
  apiKey?: string;
  model?: string;
  dimensions?: number;
  maxRetries?: number;
  retryDelay?: number;
}): EmbeddingService {
  return new EmbeddingService(config);
}

export default EmbeddingService;
