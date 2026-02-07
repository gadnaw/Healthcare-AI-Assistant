import { createClient } from '@supabase/supabase-js';
import { DocumentChunk, ChunkMetadata } from '../types';

// ============================================================================
// Search Result Types
// ============================================================================

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  section?: string;
  pageNumber?: number;
  metadata: ChunkMetadata;
}

export interface SearchOptions {
  organizationId: string;
  documentIds?: string[];
  minSimilarity?: number;
  maxResults?: number;
  filterBySection?: string[];
  includeMetadata?: boolean;
}

export interface RAGSearchOptions extends SearchOptions {
  maxContextChunks?: number;
}

export interface RAGSearchResult {
  query: string;
  context: string;
  citations: Citation[];
  chunksUsed: number;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  section?: string;
  pageNumber?: number;
  snippet: string;
}

// ============================================================================
// Vector Store Configuration
// ============================================================================

interface VectorStoreConfig {
  supabaseUrl: string;
  supabaseKey: string;
  defaultMinSimilarity?: number;
  defaultMaxResults?: number;
}

// ============================================================================
// OrgScopedVectorStore Service
// ============================================================================

/**
 * VectorStore - pgvector similarity search with organization scoping
 * 
 * Provides org-scoped vector search operations for document chunks.
 * Enforces tenant isolation via org_id filtering on all queries.
 * 
 * Key Features:
 * - Cosine similarity search with threshold filtering
 * - Org-scoped results only (no cross-tenant access)
 * - Citation support with document/section attribution
 * - Flexible filtering by document IDs and sections
 */
export class OrgScopedVectorStore {
  private supabase: ReturnType<typeof createClient>;
  private defaultMinSimilarity: number;
  private defaultMaxResults: number;

  constructor(config: VectorStoreConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.defaultMinSimilarity = config.defaultMinSimilarity ?? 0.7;
    this.defaultMaxResults = config.defaultMaxResults ?? 5;
  }

  /**
   * Set Supabase client (for dependency injection or testing)
   */
  setSupabaseClient(supabase: ReturnType<typeof createClient>): void {
    this.supabase = supabase;
  }

  /**
   * Perform similarity search with org scoping
   * 
   * @param queryEmbedding - The query vector to search against
   * @param options - Search options including org_id, filters, and thresholds
   * @returns Array of search results sorted by similarity (descending)
   */
  async similaritySearch(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const {
      organizationId,
      documentIds,
      minSimilarity = this.defaultMinSimilarity,
      maxResults = this.defaultMaxResults,
      filterBySection,
      includeMetadata = true
    } = options;

    try {
      // Build query with org filtering
      let query = this.supabase
        .from('document_chunks')
        .select(`
          id,
          document_id,
          content,
          content_vector,
          chunk_index,
          section_name,
          page_number,
          metadata,
          documents!inner (
            id,
            name,
            organization_id,
            status
          )
        `)
        .eq('documents.organization_id', organizationId)
        .eq('documents.status', 'ready')
        .eq('documents.organization_id', organizationId); // Double RLS enforcement

      // Apply document ID filter if specified
      if (documentIds && documentIds.length > 0) {
        query = query.in('document_id', documentIds);
      }

      // Apply section filter if specified
      if (filterBySection && filterBySection.length > 0) {
        query = query.in('section_name', filterBySection);
      }

      // Execute search using pgvector cosine similarity
      // pgvector operator <=> computes cosine distance
      // We want similarity = 1 - distance, filtered by minSimilarity
      const { data, error } = await this.supabase
        .rpc('search_similar_chunks', {
          query_embedding: queryEmbedding,
          match_threshold: minSimilarity,
          match_count: maxResults,
          p_organization_id: organizationId,
          p_document_ids: documentIds ?? null,
          p_sections: filterBySection ?? null
        })
        .select();

      if (error) {
        // Fallback to manual similarity computation if RPC not available
        return this.similaritySearchManual(queryEmbedding, options);
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Transform results to SearchResult format
      return data.map((row: Record<string, unknown>) => ({
        chunkId: row.id as string,
        documentId: row.document_id as string,
        documentName: (row.document_name as string) || 'Unknown Document',
        content: row.content as string,
        similarity: row.similarity as number ?? 0,
        section: row.section_name as string | undefined,
        pageNumber: row.page_number as number | undefined,
        metadata: this.parseMetadata(row.metadata as Record<string, unknown>)
      }));

    } catch (error) {
      console.error('Vector similarity search failed:', error);
      throw new Error('Failed to perform similarity search');
    }
  }

  /**
   * Manual similarity search fallback (when RPC not available)
   */
  private async similaritySearchManual(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const {
      organizationId,
      documentIds,
      minSimilarity = this.defaultMinSimilarity,
      maxResults = this.defaultMaxResults,
      filterBySection
    } = options;

    try {
      // Fetch all ready chunks for the organization
      let query = this.supabase
        .from('document_chunks')
        .select(`
          id,
          document_id,
          content,
          content_vector,
          chunk_index,
          section_name,
          page_number,
          metadata,
          documents!inner (
            id,
            name,
            organization_id,
            status
          )
        `)
        .eq('documents.organization_id', organizationId)
        .eq('documents.status', 'ready');

      if (documentIds && documentIds.length > 0) {
        query = query.in('document_id', documentIds);
      }

      if (filterBySection && filterBySection.length > 0) {
        query = query.in('section_name', filterBySection);
      }

      const { data: chunks, error } = await query;

      if (error) {
        throw error;
      }

      if (!chunks || chunks.length === 0) {
        return [];
      }

      // Compute cosine similarity for each chunk
      const results: SearchResult[] = chunks
        .map((chunk: Record<string, unknown>) => {
          const vector = chunk.content_vector as number[];
          if (!vector || vector.length === 0) {
            return null;
          }

          const similarity = this.cosineSimilarity(queryEmbedding, vector);
          
          return {
            chunkId: chunk.id as string,
            documentId: chunk.document_id as string,
            documentName: ((chunk.documents as unknown[]) as Record<string, unknown>[])[0]?.name as string || 'Unknown Document',
            content: chunk.content as string,
            similarity,
            section: chunk.section_name as string | undefined,
            pageNumber: chunk.page_number as number | undefined,
            metadata: this.parseMetadata(chunk.metadata as Record<string, unknown>)
          };
        })
        .filter((result: SearchResult | null): result is SearchResult => 
          result !== null && result.similarity >= minSimilarity
        )
        .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
        .slice(0, maxResults);

      return results;

    } catch (error) {
      console.error('Manual similarity search failed:', error);
      throw new Error('Failed to perform similarity search');
    }
  }

  /**
   * RAG search with context generation and citations
   * 
   * @param query - Natural language query to search for
   * @param embeddingService - Service to generate query embeddings
   * @param options - Search options including org scope and thresholds
   * @returns RAGSearchResult with context and citations
   */
  async ragSearch(
    query: string,
    embeddingService: { embedQuery: (text: string) => Promise<number[] | null> },
    options: RAGSearchOptions
  ): Promise<RAGSearchResult> {
    const {
      organizationId,
      documentIds,
      minSimilarity = this.defaultMinSimilarity,
      maxResults = this.defaultMaxResults,
      filterBySection,
      maxContextChunks = 5
    } = options;

    try {
      // Generate query embedding
      const queryEmbedding = await embeddingService.embedQuery(query);
      
      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Perform similarity search
      const searchResults = await this.similaritySearch(queryEmbedding, {
        organizationId,
        documentIds,
        minSimilarity,
        maxResults: Math.max(maxResults, maxContextChunks),
        filterBySection
      });

      // Limit to maxContextChunks for context
      const topResults = searchResults.slice(0, maxContextChunks);

      // Generate context string from chunks
      const context = topResults
        .map((result, index) => {
          const source = result.section 
            ? `[${result.documentName}] Section: ${result.section}`
            : `[${result.documentName}]`;
          return `[${index + 1}] ${source}\n${result.content}`;
        })
        .join('\n\n');

      // Generate citations from results
      const citations: Citation[] = searchResults.map((result, index) => ({
        chunkId: result.chunkId,
        documentId: result.documentId,
        documentName: result.documentName,
        content: result.content,
        similarity: result.similarity,
        section: result.section,
        pageNumber: result.pageNumber,
        snippet: this.generateCitationSnippet(result, index + 1)
      }));

      return {
        query,
        context,
        citations,
        chunksUsed: topResults.length
      };

    } catch (error) {
      console.error('RAG search failed:', error);
      throw new Error('Failed to perform RAG search');
    }
  }

  /**
   * Advanced search with metadata filters
   * 
   * @param queryEmbedding - The query vector
   * @param filters - Metadata filters to apply
   * @returns Filtered search results
   */
  async searchWithFilters(
    queryEmbedding: number[],
    filters: {
      organizationId: string;
      documentIds?: string[];
      minSimilarity?: number;
      maxResults?: number;
      sections?: string[];
      dateFrom?: string;
      dateTo?: string;
      documentTypes?: string[];
    }
  ): Promise<SearchResult[]> {
    const options: SearchOptions = {
      organizationId: filters.organizationId,
      documentIds: filters.documentIds,
      minSimilarity: filters.minSimilarity,
      maxResults: filters.maxResults,
      filterBySection: filters.sections
    };

    // First get similarity results
    let results = await this.similaritySearch(queryEmbedding, options);

    // Apply additional date filters if specified
    if (filters.dateFrom || filters.dateTo) {
      results = results.filter(result => {
        const docDate = result.metadata.document_date;
        if (!docDate) return true;

        const date = new Date(docDate as string);
        
        if (filters.dateFrom && date < new Date(filters.dateFrom)) {
          return false;
        }
        
        if (filters.dateTo && date > new Date(filters.dateTo)) {
          return false;
        }
        
        return true;
      });
    }

    // Apply document type filters if specified
    if (filters.documentTypes && filters.documentTypes.length > 0) {
      results = results.filter(result => {
        const docType = result.metadata.document_type;
        return docType && filters.documentTypes!.includes(docType as string);
      });
    }

    return results;
  }

  /**
   * Retrieve specific chunks by IDs for citation purposes
   * 
   * @param chunkIds - Array of chunk IDs to retrieve
   * @param organizationId - Organization ID for RLS enforcement
   * @returns Array of chunks with document attribution
   */
  async getSimilarChunks(
    chunkIds: string[],
    organizationId: string
  ): Promise<SearchResult[]> {
    if (!chunkIds || chunkIds.length === 0) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select(`
          id,
          document_id,
          content,
          chunk_index,
          section_name,
          page_number,
          metadata,
          documents!inner (
            id,
            name,
            organization_id,
            status
          )
        `)
        .in('id', chunkIds)
        .eq('documents.organization_id', organizationId)
        .eq('documents.status', 'ready');

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Return in same order as input IDs
      const idToIndex = new Map(chunkIds.map((id, index) => [id, index]));
      
      return (data as unknown[]).map((row: Record<string, unknown>) => ({
        chunkId: row.id as string,
        documentId: row.document_id as string,
        documentName: ((row.documents as unknown[]) as Record<string, unknown>[])[0]?.name as string || 'Unknown Document',
        content: row.content as string,
        similarity: 1.0, // Direct retrieval, similarity = 1.0
        section: row.section_name as string | undefined,
        pageNumber: row.page_number as number | undefined,
        metadata: this.parseMetadata(row.metadata as Record<string, unknown>)
      }))
      .sort((a: SearchResult, b: SearchResult) => 
        (idToIndex.get(a.chunkId) ?? Infinity) - (idToIndex.get(b.chunkId) ?? Infinity)
      );

    } catch (error) {
      console.error('Get similar chunks failed:', error);
      throw new Error('Failed to retrieve chunks');
    }
  }

  /**
   * Get search statistics for an organization
   */
  async getSearchStats(organizationId: string): Promise<{
    totalChunks: number;
    indexedDocuments: number;
    lastIndexedAt?: string;
  }> {
    try {
      // Get chunk count
      const { count: chunkCount, error: chunkError } = await this.supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (chunkError) throw chunkError;

      // Get indexed document count
      const { count: docCount, error: docError } = await this.supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'ready');

      if (docError) throw docError;

      // Get last indexed timestamp
      const { data: latestChunk } = await this.supabase
        .from('document_chunks')
        .select('created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        totalChunks: chunkCount ?? 0,
        indexedDocuments: docCount ?? 0,
        lastIndexedAt: latestChunk?.created_at
      };

    } catch (error) {
      console.error('Failed to get search stats:', error);
      throw new Error('Failed to retrieve search statistics');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Parse metadata from JSONB
   */
  private parseMetadata(metadata: Record<string, unknown> | null): ChunkMetadata {
    if (!metadata) {
      return {};
    }
    return metadata as ChunkMetadata;
  }

  /**
   * Generate citation snippet for a search result
   */
  private generateCitationSnippet(result: SearchResult, index: number): string {
    const source = result.section 
      ? `${result.documentName} (Section: ${result.section})`
      : result.documentName;
    
    const snippet = result.content.length > 200 
      ? result.content.substring(0, 200) + '...'
      : result.content;

    return `[${index}] ${source}: ${snippet}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createVectorStore(config: VectorStoreConfig): OrgScopedVectorStore {
  return new OrgScopedVectorStore(config);
}

export default OrgScopedVectorStore;
