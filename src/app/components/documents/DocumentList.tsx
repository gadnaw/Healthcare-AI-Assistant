'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// Types
// ============================================================================

interface Document {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  status: 'uploaded' | 'validating' | 'processing' | 'chunking' | 'embedding' | 'storing' | 'ready' | 'error' | 'deleting';
  uploaded_at: string;
  processed_at?: string;
  uploaded_by: string;
  metadata: {
    chunk_count?: number;
    page_count?: number;
  };
}

interface DocumentListProps {
  onDocumentSelect?: (documentId: string) => void;
  onDeleteComplete?: (documentId: string) => void;
  refreshTrigger?: number; // Increment to trigger refresh
}

// ============================================================================
// Constants
// ============================================================================

const API_ENDPOINT = '/api/documents';
const ITEMS_PER_PAGE = 10;

// ============================================================================
// Component
// ============================================================================

export function DocumentList({
  onDocumentSelect,
  onDeleteComplete,
  refreshTrigger = 0,
}: DocumentListProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

  // =========================================================================
  // Data Fetching
  // =========================================================================

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get auth token
      const authToken = localStorage.getItem('auth_token') || '';

      const response = await fetch(
        `${API_ENDPOINT}?page=${currentPage}&limit=${ITEMS_PER_PAGE}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch documents');
      }

      const result = await response.json();

      if (result.success) {
        setDocuments(result.data.documents || []);
        setTotalCount(result.data.total || 0);
      } else {
        throw new Error(result.error?.message || 'Failed to fetch documents');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshTrigger]);

  // =========================================================================
  // Delete Handling
  // =========================================================================

  const handleDeleteClick = (document: Document) => {
    setDocumentToDelete(document);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;

    try {
      setDeletingId(documentToDelete.id);
      setDeleteConfirmOpen(false);

      // Get auth token
      const authToken = localStorage.getItem('auth_token') || '';

      const response = await fetch(`${API_ENDPOINT}/${documentToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          reason: 'User requested deletion from document list',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to delete document');
      }

      const result = await response.json();

      if (result.success) {
        // Refresh list
        await fetchDocuments();

        // Notify parent
        if (onDeleteComplete) {
          onDeleteComplete(documentToDelete.id);
        }
      } else {
        throw new Error(result.error?.message || 'Failed to delete document');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingId(null);
      setDocumentToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDocumentToDelete(null);
  };

  // =========================================================================
  // Document Click
  // =========================================================================

  const handleDocumentClick = (documentId: string) => {
    if (onDocumentSelect) {
      onDocumentSelect(documentId);
    } else {
      router.push(`/documents/${documentId}`);
    }
  };

  // =========================================================================
  // Formatting Helpers
  // =========================================================================

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: Document['status']) => {
    const statusConfig: Record<Document['status'], { color: string; label: string }> = {
      uploaded: { color: 'bg-blue-100 text-blue-800', label: 'Uploaded' },
      validating: { color: 'bg-blue-100 text-blue-800', label: 'Validating' },
      processing: { color: 'bg-yellow-100 text-yellow-800', label: 'Processing' },
      chunking: { color: 'bg-yellow-100 text-yellow-800', label: 'Chunking' },
      embedding: { color: 'bg-yellow-100 text-yellow-800', label: 'Embedding' },
      storing: { color: 'bg-yellow-100 text-yellow-800', label: 'Storing' },
      ready: { color: 'bg-green-100 text-green-800', label: 'Ready' },
      error: { color: 'bg-red-100 text-red-800', label: 'Error' },
      deleting: { color: 'bg-gray-100 text-gray-800', label: 'Deleting' },
    };

    const config = statusConfig[status] || statusConfig.uploaded;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getFileIcon = (fileType: string) => {
    const icons: Record<string, string> = {
      pdf: (
        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      ),
      docx: (
        <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      ),
      txt: (
        <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      ),
    };

    return icons[fileType.toLowerCase()] || icons.txt;
  };

  // =========================================================================
  // Render States
  // =========================================================================

  const renderLoading = () => (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="ml-3 text-gray-600">Loading documents...</span>
    </div>
  );

  const renderError = () => (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load documents</h3>
      <p className="text-gray-500 mb-4">{error}</p>
      <button
        onClick={fetchDocuments}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );

  const renderEmpty = () => (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No documents uploaded</h3>
      <p className="text-gray-500 mb-6">Get started by uploading your first document</p>
    </div>
  );

  const renderDeleteConfirmation = () => {
    if (!deleteConfirmOpen || !documentToDelete) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center space-x-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Delete Document</h3>
              <p className="text-sm text-gray-500">This action cannot be undone</p>
            </div>
          </div>
          
          <p className="text-gray-600 mb-6">
            Are you sure you want to delete <span className="font-medium">{documentToDelete.name}</span>?
            This will permanently remove the document and all its chunks from the system.
          </p>
          
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleDeleteCancel}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
    
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-4">
        <div className="text-sm text-gray-700">
          Showing <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
          <span className="font-medium">
            {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
          </span>{' '}
          of <span className="font-medium">{totalCount}</span> documents
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // =========================================================================
  // Main Render
  // =========================================================================

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage your uploaded clinical documents
        </p>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          renderLoading()
        ) : error ? (
          renderError()
        ) : documents.length === 0 ? (
          renderEmpty()
        ) : (
          <>
            {/* Document List */}
            <div className="divide-y divide-gray-200">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleDocumentClick(doc.id)}
                >
                  <div className="flex items-center justify-between">
                    {/* Document Info */}
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        {getFileIcon(doc.file_type)}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {doc.name}
                          </p>
                          {getStatusBadge(doc.status)}
                        </div>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                          <span>{formatDate(doc.uploaded_at)}</span>
                          <span>{formatFileSize(doc.file_size)}</span>
                          {doc.metadata.chunk_count !== undefined && (
                            <span>{doc.metadata.chunk_count} chunks</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 ml-4">
                      {doc.status === 'ready' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/search?q=document:${doc.id}`);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Search in document"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                      )}
                      
                      {doc.status === 'error' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/documents/${doc.id}/retry`);
                          }}
                          className="p-2 text-gray-400 hover:text-yellow-600 transition-colors"
                          title="Retry processing"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}

                      {!['processing', 'deleting'].includes(doc.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(doc);
                          }}
                          disabled={deletingId === doc.id}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete document"
                        >
                          {deletingId === doc.id ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="px-4 pb-4">
              {renderPagination()}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {renderDeleteConfirmation()}
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export default DocumentList;
