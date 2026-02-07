import { DocumentChunk, ChunkMetadata } from '../types';

/**
 * ChunkManager - Chunk lifecycle management and persistence
 * 
 * Handles chunk CRUD operations, persistence to pgvector,
 * and bulk operations for document processing pipeline.
 */
export class ChunkManager {
  private supabase: any; // Supabase client instance
  
  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Create chunks for a document with transaction support
   */
  async createChunks(
    documentId: string,
    chunks: DocumentChunk[],
    organizationId: string
  ): Promise<{ success: boolean; chunkCount: number; error?: string }> {
    if (!chunks || chunks.length === 0) {
      return { success: true, chunkCount: 0 };
    }

    try {
      // Prepare chunk records for database insertion
      const chunkRecords = chunks.map(chunk => ({
        document_id: documentId,
        organization_id: organizationId,
        content: chunk.content,
        chunk_index: chunk.chunkIndex,
        token_count: chunk.tokenCount,
        embedding: chunk.embedding || null, // Will be populated after embedding
        metadata: chunk.metadata as Record<string, unknown>,
        chunk_id: chunk.id,
        created_at: new Date().toISOString()
      }));

      // Bulk insert with transaction
      const { data, error } = await this.supabase
        .from('document_chunks')
        .insert(chunkRecords)
        .select('id');

      if (error) {
        console.error('Chunk creation failed:', error);
        return { success: false, chunkCount: 0, error: error.message };
      }

      return { success: true, chunkCount: data?.length || 0 };
    } catch (error) {
      console.error('Chunk creation exception:', error);
      return { 
        success: false, 
        chunkCount: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Retrieve all chunks for a document
   */
  async getChunksByDocument(
    documentId: string,
    organizationId: string
  ): Promise<DocumentChunk[]> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select('*')
        .eq('document_id', documentId)
        .eq('organization_id', organizationId)
        .order('chunk_index', { ascending: true });

      if (error) {
        console.error('Failed to fetch chunks:', error);
        return [];
      }

      return (data || []).map((record: any) => this.mapRecordToChunk(record));
    } catch (error) {
      console.error('Chunk retrieval exception:', error);
      return [];
    }
  }

  /**
   * Get single chunk by ID
   */
  async getChunkById(
    chunkId: string,
    organizationId: string
  ): Promise<DocumentChunk | null> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select('*')
        .eq('id', chunkId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapRecordToChunk(data);
    } catch (error) {
      console.error('Chunk fetch exception:', error);
      return null;
    }
  }

  /**
   * Check if chunk already exists (for deduplication)
   */
  async chunkExists(
    documentId: string,
    chunkIndex: number
  ): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select('id')
        .eq('document_id', documentId)
        .eq('chunk_index', chunkIndex)
        .limit(1);

      if (error) {
        console.error('Chunk existence check failed:', error);
        return false;
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('Chunk existence check exception:', error);
      return false;
    }
  }

  /**
   * Update chunk with embedding vector
   */
  async updateChunkEmbedding(
    chunkId: string,
    embedding: number[],
    organizationId: string
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('document_chunks')
        .update({ 
          embedding,
          updated_at: new Date().toISOString()
        })
        .eq('id', chunkId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Embedding update failed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Embedding update exception:', error);
      return false;
    }
  }

  /**
   * Bulk update embeddings for multiple chunks
   */
  async updateEmbeddings(
    chunks: { id: string; embedding: number[] }[],
    organizationId: string
  ): Promise<{ success: boolean; count: number; errors: string[] }> {
    const errors: string[] = [];
    let successCount = 0;

    for (const chunk of chunks) {
      try {
        const { error } = await this.supabase
          .from('document_chunks')
          .update({ 
            embedding: chunk.embedding,
            updated_at: new Date().toISOString()
          })
          .eq('id', chunk.id)
          .eq('organization_id', organizationId);

        if (error) {
          errors.push(`Chunk ${chunk.id}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (error) {
        errors.push(
          `Chunk ${chunk.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      success: errors.length === 0,
      count: successCount,
      errors
    };
  }

  /**
   * Delete all chunks for a document
   */
  async deleteChunksByDocument(
    documentId: string,
    organizationId: string
  ): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId)
        .eq('organization_id', organizationId)
        .select('id');

      if (error) {
        return { success: false, count: 0, error: error.message };
      }

      return { success: true, count: data?.length || 0 };
    } catch (error) {
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get chunk count for a document
   */
  async getChunkCount(
    documentId: string,
    organizationId: string
  ): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('document_chunks')
        .select('id', { count: 'exact' })
        .eq('document_id', documentId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Chunk count failed:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Chunk count exception:', error);
      return 0;
    }
  }

  /**
   * Get chunks that need embedding (embedding is null)
   */
  async getChunksNeedingEmbedding(
    documentId: string,
    organizationId: string
  ): Promise<DocumentChunk[]> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select('*')
        .eq('document_id', documentId)
        .eq('organization_id', organizationId)
        .is('embedding', null)
        .order('chunk_index', { ascending: true });

      if (error) {
        console.error('Failed to fetch chunks needing embedding:', error);
        return [];
      }

      return (data || []).map((record: any) => this.mapRecordToChunk(record));
    } catch (error) {
      console.error('Chunk fetch exception:', error);
      return [];
    }
  }

  /**
   * Map database record to DocumentChunk
   */
  private mapRecordToChunk(record: any): DocumentChunk {
    return {
      id: record.chunk_id || record.id,
      documentId: record.document_id,
      content: record.content,
      chunkIndex: record.chunk_index,
      tokenCount: record.token_count,
      embedding: record.embedding,
      metadata: record.metadata as ChunkMetadata
    };
  }
}

/**
 * Factory function to create ChunkManager instance
 */
export function createChunkManager(supabaseClient: any): ChunkManager {
  return new ChunkManager(supabaseClient);
}

export default ChunkManager;
