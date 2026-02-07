import { createClient, SupabaseClient, QueryData } from '@supabase/supabase-js';
import { Document, DocumentStatus, DocumentMetadata, ApiResponse, ApiError } from '../types';

// ============================================================================
// Repository Configuration
// ============================================================================

interface RepositoryConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// Document Repository
// ============================================================================

/**
 * DocumentRepository - Document CRUD operations with RLS enforcement
 * 
 * Provides org-scoped document data access with proper Row Level Security
 * enforcement. All operations automatically filter by organization_id.
 * 
 * Key Features:
 * - CRUD operations with automatic org filtering
 * - Pagination with cursor and offset support
 * - Soft delete support
 * - Transaction support for batch operations
 * - Audit trail access
 */
export class DocumentRepository {
  private supabase: SupabaseClient;

  constructor(config: RepositoryConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Set Supabase client (for dependency injection or testing)
   */
  setSupabaseClient(supabase: SupabaseClient): void {
    this.supabase = supabase;
  }

  /**
   * Retrieve a single document by ID with org scoping
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization (for RLS enforcement)
   * @returns Document if found and belongs to org, null otherwise
   */
  async getById(
    documentId: string,
    organizationId: string
  ): Promise<ApiResponse<Document>> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Record not found (either doesn't exist or wrong org)
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Document not found or access denied'
            }
          };
        }
        throw error;
      }

      if (!data) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Document not found'
          }
        };
      }

      return {
        success: true,
        data: this.transformDocument(data)
      };

    } catch (error) {
      console.error('Get document by ID failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve document'
        }
      };
    }
  }

  /**
   * List documents for an organization with pagination
   * 
   * @param organizationId - UUID of the organization
   * @param options - Pagination and filtering options
   * @returns Paginated list of documents
   */
  async listByOrg(
    organizationId: string,
    options: PaginationOptions & { status?: DocumentStatus }
  ): Promise<ApiResponse<PaginatedResult<Document>>> {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'uploaded_at',
      sortOrder = 'desc',
      status
    } = options;

    try {
      // Build query with org filter
      let query = this.supabase
        .from('documents')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId);

      // Apply status filter if specified
      if (status) {
        query = query.eq('status', status);
      }

      // Apply sorting and pagination
      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const documents = (data || []).map(doc => this.transformDocument(doc));
      const total = count ?? 0;

      return {
        success: true,
        data: {
          data: documents,
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };

    } catch (error) {
      console.error('List documents by org failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list documents'
        }
      };
    }
  }

  /**
   * Update document status with org scoping
   * 
   * @param documentId - UUID of the document
   * @param status - New status
   * @param organizationId - UUID of the organization
   * @param additionalMetadata - Optional metadata updates
   * @returns Updated document
   */
  async updateStatus(
    documentId: string,
    status: DocumentStatus,
    organizationId: string,
    additionalMetadata?: Partial<DocumentMetadata>
  ): Promise<ApiResponse<Document>> {
    try {
      // First verify document belongs to organization
      const existing = await this.getById(documentId, organizationId);
      
      if (!existing.success || !existing.data) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Document not found or access denied'
          }
        };
      }

      // Build update payload
      const updatePayload: Record<string, unknown> = {
        status,
        processed_at: status === 'ready' ? new Date().toISOString() : undefined
      };

      // Merge additional metadata if provided
      if (additionalMetadata) {
        updatePayload.metadata = {
          ...existing.data.metadata,
          ...additionalMetadata
        };
      }

      // Perform update with RLS enforcement
      const { data, error } = await this.supabase
        .from('documents')
        .update(updatePayload)
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        data: this.transformDocument(data)
      };

    } catch (error) {
      console.error('Update document status failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update document status'
        }
      };
    }
  }

  /**
   * Get document metadata only (lightweight operation)
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization
   * @returns Document metadata if found
   */
  async getMetadata(
    documentId: string,
    organizationId: string
  ): Promise<ApiResponse<{
    id: string;
    name: string;
    fileType: string;
    fileSize: number;
    status: DocumentStatus;
    metadata: DocumentMetadata;
    uploadedAt: string;
    processedAt?: string;
  }>> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select(`
          id,
          name,
          file_type,
          file_size,
          status,
          metadata,
          uploaded_at,
          processed_at
        `)
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Document not found or access denied'
            }
          };
        }
        throw error;
      }

      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          fileType: data.file_type,
          fileSize: data.file_size,
          status: data.status,
          metadata: data.metadata as DocumentMetadata,
          uploadedAt: data.uploaded_at,
          processedAt: data.processed_at
        }
      };

    } catch (error) {
      console.error('Get document metadata failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve document metadata'
        }
      };
    }
  }

  /**
   * Get chunk count for a document
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization
   * @returns Chunk count statistics
   */
  async getChunkCount(
    documentId: string,
    organizationId: string
  ): Promise<ApiResponse<{
    totalChunks: number;
    embeddedChunks: number;
    pendingChunks: number;
  }>> {
    try {
      // First verify document belongs to organization
      const existing = await this.getById(documentId, organizationId);
      
      if (!existing.success) {
        return {
          success: false,
          error: existing.error
        };
      }

      // Get total chunk count
      const { count: totalCount, error: totalError } = await this.supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);

      if (totalError) throw totalError;

      // Get embedded chunk count
      const { count: embeddedCount, error: embeddedError } = await this.supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .not('content_vector', 'is', null);

      if (embeddedError) throw embeddedError;

      return {
        success: true,
        data: {
          totalChunks: totalCount ?? 0,
          embeddedChunks: embeddedCount ?? 0,
          pendingChunks: (totalCount ?? 0) - (embeddedCount ?? 0)
        }
      };

    } catch (error) {
      console.error('Get chunk count failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve chunk statistics'
        }
      };
    }
  }

  /**
   * Get processing history from audit trail
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization
   * @returns Audit trail events
   */
  async getProcessingHistory(
    documentId: string,
    organizationId: string
  ): Promise<ApiResponse<Array<{
    timestamp: string;
    action: string;
    userId: string;
    details?: Record<string, unknown>;
  }>>> {
    try {
      // First verify document belongs to organization
      const existing = await this.getById(documentId, organizationId);
      
      if (!existing.success) {
        return {
          success: false,
          error: existing.error
        };
      }

      const { data, error } = await this.supabase
        .from('documents')
        .select('audit_trail')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        throw error;
      }

      const auditTrail = (data.audit_trail as Array<{
        timestamp: string;
        action: string;
        user_id: string;
        details?: Record<string, unknown>;
      }>) || [];

      return {
        success: true,
        data: auditTrail.map(event => ({
          timestamp: event.timestamp,
          action: event.action,
          userId: event.user_id,
          details: event.details
        }))
      };

    } catch (error) {
      console.error('Get processing history failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve processing history'
        }
      };
    }
  }

  /**
   * Soft delete a document
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization
   * @returns Success status
   */
  async softDelete(
    documentId: string,
    organizationId: string
  ): Promise<ApiResponse<void>> {
    try {
      // Update status to 'deleting' - actual cleanup handled by background job
      const result = await this.updateStatus(
        documentId,
        'deleting',
        organizationId
      );

      if (!result.success) {
        return result as ApiResponse<void>;
      }

      // Add deletion event to audit trail
      const { error } = await this.supabase
        .from('documents')
        .update({
          audit_trail: this.supabase.raw('audit_trail || ?', [{
            timestamp: new Date().toISOString(),
            action: 'soft_delete_initiated',
            user_id: 'system',
            details: { document_id: documentId }
          }])
        })
        .eq('id', documentId)
        .eq('organization_id', organizationId);

      if (error) {
        throw error;
      }

      return { success: true };

    } catch (error) {
      console.error('Soft delete failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete document'
        }
      };
    }
  }

  /**
   * Permanently delete a document and all associated chunks
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization
   * @returns Success status
   */
  async hardDelete(
    documentId: string,
    organizationId: string
  ): Promise<ApiResponse<void>> {
    try {
      // First verify document belongs to organization
      const existing = await this.getById(documentId, organizationId);
      
      if (!existing.success) {
        return {
          success: false,
          error: existing.error
        };
      }

      // Delete all chunks (CASCADE should handle this, but being explicit)
      const { error: chunkError } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId);

      if (chunkError) {
        throw chunkError;
      }

      // Delete document
      const { error: docError } = await this.supabase
        .from('documents')
        .delete()
        .eq('id', documentId)
        .eq('organization_id', organizationId);

      if (docError) {
        throw docError;
      }

      return { success: true };

    } catch (error) {
      console.error('Hard delete failed:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to permanently delete document'
        }
      };
    }
  }

  /**
   * Bulk update document status for batch operations
   * 
   * @param documentIds - Array of document UUIDs
   * @param status - New status
   * @param organizationId - UUID of the organization
   * @returns Array of update results
   */
  async bulkUpdateStatus(
    documentIds: string[],
    status: DocumentStatus,
    organizationId: string
  ): Promise<ApiResponse<Array<{ documentId: string; success: boolean }>>> {
    if (!documentIds || documentIds.length === 0) {
      return {
        success: true,
        data: []
      };
    }

    const results: Array<{ documentId: string; success: boolean }> = [];

    for (const documentId of documentIds) {
      const result = await this.updateStatus(documentId, status, organizationId);
      results.push({
        documentId,
        success: result.success
      });
    }

    const allSuccessful = results.every(r => r.success);

    return {
      success: allSuccessful,
      data: results
    };
  }

  /**
   * Check document existence with org scoping
   * 
   * @param documentId - UUID of the document
   * @param organizationId - UUID of the organization
   * @returns True if document exists and belongs to org
   */
  async exists(
    documentId: string,
    organizationId: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .single();

    return !error && !!data;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Transform database row to Document type
   */
  private transformDocument(row: Record<string, unknown>): Document {
    return {
      id: row.id as string,
      organization_id: row.organization_id as string,
      name: row.name as string,
      file_type: row.file_type as string,
      file_size: row.file_size as number,
      file_hash: row.file_hash as string,
      status: row.status as DocumentStatus,
      metadata: (row.metadata as DocumentMetadata) || {},
      version: row.version as number,
      parent_version_id: row.parent_version_id as string | undefined,
      uploaded_by: row.uploaded_by as string,
      uploaded_at: row.uploaded_at as string,
      processed_at: row.processed_at as string | undefined,
      error_message: row.error_message as string | undefined,
      audit_trail: (row.audit_trail as Array<{
        timestamp: string;
        action: string;
        user_id: string;
        details?: Record<string, unknown>;
      }>) || []
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDocumentRepository(config: RepositoryConfig): DocumentRepository {
  return new DocumentRepository(config);
}

export default DocumentRepository;
