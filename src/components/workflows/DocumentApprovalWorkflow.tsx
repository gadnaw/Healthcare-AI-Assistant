'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DocumentApprovalCard } from './DocumentApprovalCard';
import { getPendingDocuments, getAllDocumentsForApproval, DocumentApprovalItem } from '@/server/actions/workflows/get-pending-documents';
import { WorkflowStateBadge, WorkflowStatus } from './WorkflowStateBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

type FilterType = 'pending' | 'all';
type SortType = 'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'type';

interface DocumentApprovalWorkflowProps {
  /**
   * Current user ID for permission checking
   */
  userId: string;
  
  /**
   * Current organization ID
   */
  orgId: string;
  
  /**
   * Whether user has DOC_APPROVE permission
   */
  canApprove: boolean;
  
  /**
   * Optional custom class name
   */
  className?: string;
}

// ============================================
// Component
// ============================================

export function DocumentApprovalWorkflow({
  userId,
  orgId,
  canApprove,
  className
}: DocumentApprovalWorkflowProps) {
  const [documents, setDocuments] = useState<DocumentApprovalItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  // Load documents
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let result: { documents: DocumentApprovalItem[]; total: number };

      if (filter === 'pending') {
        const pendingDocs = await getPendingDocuments(orgId, userId);
        result = { documents: pendingDocs, total: pendingDocs.length };
      } else {
        result = await getAllDocumentsForApproval(orgId, userId, {
          filter: 'ALL',
          search: searchQuery,
          limit: pageSize,
          offset: (page - 1) * pageSize
        });
      }

      setDocuments(result.documents);
      setTotalCount(result.total);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, filter, searchQuery, page]);

  // Reload when dependencies change
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Handle document approval
  const handleApprove = useCallback((documentId: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    setTotalCount(prev => Math.max(0, prev - 1));
  }, []);

  // Handle document rejection
  const handleReject = useCallback((documentId: string, reason: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== documentId));
    setTotalCount(prev => Math.max(0, prev - 1));
  }, []);

  // Handle error
  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    const sorted = [...documents];
    
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
      case 'title-asc':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case 'type':
        return sorted.sort((a, b) => a.fileType.localeCompare(b.fileType));
      default:
        return sorted;
    }
  }, [documents, sortBy]);

  // If no permission, show access denied
  if (!canApprove) {
    return (
      <div className={cn('bg-red-50 border border-red-200 rounded-lg p-6 text-center', className)}>
        <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-lg font-semibold text-red-800 mb-2">Access Denied</h3>
        <p className="text-red-600">
          You don't have permission to approve documents. Please contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Document Approval</h2>
          <p className="text-gray-500 mt-1">
            Review and approve documents before they become available to users
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={loading}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200">
          <button
            onClick={() => setFilter('pending')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              filter === 'pending'
                ? 'bg-yellow-100 text-yellow-800'
                : 'text-gray-600 hover:bg-gray-100'
            )}
            aria-pressed={filter === 'pending'}
          >
            Pending
            {filter === 'pending' && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-200 rounded-full">
                {totalCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              filter === 'all'
                ? 'bg-blue-100 text-blue-800'
                : 'text-gray-600 hover:bg-gray-100'
            )}
            aria-pressed={filter === 'all'}
          >
            All
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              type="search"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              aria-label="Search documents by title"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-sm text-gray-600">
            Sort by:
          </label>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortType)}>
            <SelectTrigger id="sort-select" className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title-asc">Title (A-Z)</SelectItem>
              <SelectItem value="title-desc">Title (Z-A)</SelectItem>
              <SelectItem value="type">File type</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="ml-auto text-red-600 hover:text-red-700"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4" role="status" aria-label="Loading documents">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full mt-4" />
                </div>
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading document approval list...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && documents.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {filter === 'pending' ? 'No documents pending approval' : 'No documents found'}
          </h3>
          <p className="text-gray-500">
            {filter === 'pending' 
              ? 'All documents have been reviewed. Check the "All" tab to see approved and rejected documents.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      )}

      {/* Document List */}
      {!loading && !error && documents.length > 0 && (
        <div className="space-y-4" role="list" aria-label="Documents pending approval">
          {sortedDocuments.map((document) => (
            <DocumentApprovalCard
              key={document.id}
              document={document}
              onApprove={handleApprove}
              onReject={handleReject}
              onError={handleError}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && filter === 'all' && totalCount > pageSize && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-gray-500">
            Showing {documents.length} of {totalCount} documents
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} of {Math.ceil(totalCount / pageSize)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(totalCount / pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Export Types
// ============================================

export type { DocumentApprovalWorkflowProps };
