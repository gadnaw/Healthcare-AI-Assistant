'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { AuditFilters, AuditLogFilters } from './AuditFilters';
import { AuditLogExport } from './AuditLogExport';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  History,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  Copy,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface AuditLogViewerProps {
  showFilters?: boolean;
  showExport?: boolean;
  className?: string;
}

interface AuditLogDetailModalProps {
  log: AuditLogEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PaginationProps {
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

// ============================================================================
// Mock Types (from audit service)
// ============================================================================

interface AuditLogEntry {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  org_id: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

// ============================================================================
// UI Components
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Table skeleton */}
      <div className="border rounded-lg">
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="grid grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b px-4 py-3">
            <div className="grid grid-cols-6 gap-4">
              {[...Array(6)].map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-gray-100 p-4">
        <Search className="h-8 w-8 text-gray-400" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No audit logs found</h3>
      <p className="mt-2 text-sm text-gray-500">
        No audit events match your current filters. Try adjusting your search criteria.
      </p>
      <Button variant="outline" onClick={onClearFilters} className="mt-4">
        Clear all filters
      </Button>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-red-100 p-4">
        <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">Access Denied</h3>
      <p className="mt-2 text-sm text-gray-500">
        You do not have permission to view audit logs. Please contact your administrator if you believe this is an error.
      </p>
    </div>
  );
}

function Pagination({ currentPage, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
    const endPage = Math.min(totalPages, startPage + showPages - 1);

    if (endPage - startPage < showPages - 1) {
      startPage = Math.max(1, endPage - showPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (startPage > 1) {
      pages.unshift('...');
      pages.unshift(1);
    }

    if (endPage < totalPages) {
      pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">
          Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 rounded border border-gray-300 px-2 text-sm"
          aria-label="Rows per page"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={!canGoPrevious}
          aria-label="Go to first page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <ChevronLeft className="h-4 w-4 -ml-2" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>

        {pageNumbers.map((page, idx) =>
          typeof page === 'string' ? (
            <span key={idx} className="px-2 text-gray-400">
              {page}
            </span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(page)}
              aria-label={`Go to page ${page}`}
              aria-current={currentPage === page ? 'page' : undefined}
              className={cn(currentPage === page && 'bg-blue-600 text-white hover:bg-blue-700')}
            >
              {page}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={!canGoNext}
          aria-label="Go to last page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <ChevronRight className="h-4 w-4 -ml-2" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function DetailModal({ log, isOpen, onClose }: AuditLogDetailModalProps) {
  if (!isOpen || !log) return null;

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Audit Log Details</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close modal">
            ×
          </Button>
        </div>

        <dl className="space-y-4">
          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <dt className="text-sm font-medium text-gray-500">Log ID</dt>
            <dd className="col-span-2 flex items-center gap-2 text-sm font-mono">
              {log.id}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(log.id)}
                aria-label="Copy log ID"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </dd>
          </div>

          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <dt className="text-sm font-medium text-gray-500">Timestamp</dt>
            <dd className="col-span-2 text-sm">
              {format(new Date(log.created_at), 'PPP pp')}
            </dd>
          </div>

          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <dt className="text-sm font-medium text-gray-500">User ID</dt>
            <dd className="col-span-2 flex items-center gap-2 text-sm font-mono">
              {log.user_id}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(log.user_id)}
                aria-label="Copy user ID"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </dd>
          </div>

          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <dt className="text-sm font-medium text-gray-500">Action Type</dt>
            <dd className="col-span-2">
              <Badge variant="outline">{log.action_type}</Badge>
            </dd>
          </div>

          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <dt className="text-sm font-medium text-gray-500">Entity Type</dt>
            <dd className="col-span-2 text-sm">{log.entity_type}</dd>
          </div>

          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <dt className="text-sm font-medium text-gray-500">Entity ID</dt>
            <dd className="col-span-2 flex items-center gap-2 text-sm font-mono">
              {log.entity_id}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(log.entity_id)}
                aria-label="Copy entity ID"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </dd>
          </div>

          {log.ip_address && (
            <div className="grid grid-cols-3 gap-4 border-b pb-4">
              <dt className="text-sm font-medium text-gray-500">IP Address</dt>
              <dd className="col-span-2 text-sm font-mono">{log.ip_address}</dd>
            </div>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="border-b pb-4">
              <dt className="text-sm font-medium text-gray-500 mb-2">Metadata</dt>
              <dd className="text-sm">
                <pre className="bg-gray-50 p-3 rounded overflow-x-auto text-xs">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuditLogTable({ logs, onRowClick, loading }: { logs: AuditLogEntry[]; onRowClick: (log: AuditLogEntry) => void; loading: boolean }) {
  const getActionBadgeVariant = (actionType: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (actionType.includes('CREATE') || actionType.includes('APPROVE') || actionType.includes('LOGIN')) {
      return 'default';
    }
    if (actionType.includes('DELETE') || actionType.includes('REJECT') || actionType.includes('FAILED')) {
      return 'destructive';
    }
    return 'secondary';
  };

  return (
    <div className="border rounded-lg">
      {/* Table Header */}
      <div className="bg-gray-50 px-4 py-3 border-b">
        <div className="grid grid-cols-6 gap-4 text-sm font-medium text-gray-600">
          <div>Timestamp</div>
          <div>User</div>
          <div>Action</div>
          <div>Entity</div>
          <div>IP Address</div>
          <div></div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y">
        {logs.map((log) => (
          <div
            key={log.id}
            className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => onRowClick(log)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onRowClick(log)}
            aria-label={`View details for audit log ${log.id}`}
          >
            <div className="grid grid-cols-6 gap-4 text-sm">
              <div className="text-gray-600">
                {format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}
              </div>
              <div className="truncate font-mono text-gray-900" title={log.user_id}>
                {log.user_id}
              </div>
              <div>
                <Badge variant={getActionBadgeVariant(log.action_type)}>
                  {log.action_type.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="truncate text-gray-600" title={`${log.entity_type}: ${log.entity_id}`}>
                <span className="text-gray-400">{log.entity_type}/</span>
                {log.entity_id}
              </div>
              <div className="truncate font-mono text-gray-500">
                {log.ip_address || '-'}
              </div>
              <div className="flex justify-end">
                <Eye className="h-4 w-4 text-gray-400" aria-hidden="true" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AuditLogViewer({
  showFilters = true,
  showExport = true,
  className,
}: AuditLogViewerProps) {
  const { logs, loading, error, filters, total, setFilter, exportLogs, refresh } = useAuditLog();
  const { hasPermission, loading: permissionLoading } = usePermissions();
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Check permission
  const canViewAudit = hasPermission('AUDIT_VIEW');
  const canExportAudit = hasPermission('AUDIT_EXPORT');

  // Handle row click
  const handleRowClick = useCallback((log: AuditLogEntry) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  }, []);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedLog(null);
  }, []);

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setFilter('page', 1);
    // Clear other filters
  }, []);

  // Loading state
  if (permissionLoading) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" aria-hidden="true" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  // Access denied state
  if (!canViewAudit) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" aria-hidden="true" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AccessDenied />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" aria-hidden="true" />
            Audit Log
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} aria-label="Refresh audit logs">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            </Button>
            {showExport && canExportAudit && (
              <AuditLogExport
                filters={filters}
                recordCount={total}
                onExport={exportLogs}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          {showFilters && (
            <AuditFilters
              filters={filters}
              onFilterChange={(newFilters) => {
                Object.entries(newFilters).forEach(([key, value]) => {
                  setFilter(key as keyof AuditLogFilters, value);
                });
              }}
            />
          )}

          {/* Error State */}
          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-600" role="alert">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {error.message}
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && logs.length === 0 ? (
            <LoadingSkeleton />
          ) : logs.length === 0 ? (
            <EmptyState onClearFilters={handleClearFilters} />
          ) : (
            <>
              {/* Results Summary */}
              <div className="text-sm text-gray-600">
                Showing {logs.length} of {total.toLocaleString()} audit events
              </div>

              {/* Table */}
              <AuditLogTable logs={logs} onRowClick={handleRowClick} loading={loading} />

              {/* Pagination */}
              <Pagination
                currentPage={filters.page || 1}
                pageSize={filters.pageSize || 50}
                total={total}
                onPageChange={(page) => setFilter('page', page)}
                onPageSizeChange={(size) => setFilter('pageSize', size)}
              />
            </>
          )}
        </div>
      </CardContent>

      {/* Detail Modal */}
      <DetailModal log={selectedLog} isOpen={isModalOpen} onClose={handleModalClose} />
    </Card>
  );
}
