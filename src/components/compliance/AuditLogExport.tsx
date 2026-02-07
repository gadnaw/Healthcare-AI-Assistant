'use client';

import React, { useState, useCallback } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Download, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuditLogFilters } from './AuditFilters';

// ============================================================================
// Types
// ============================================================================

interface AuditLogExportProps {
  filters: AuditLogFilters;
  recordCount: number;
  onExport: () => Promise<void>;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const EXPORT_LIMIT = 10000;
const EXPORT_WARNING_THRESHOLD = 10000;

// ============================================================================
// Main Component
// ============================================================================

export function AuditLogExport({
  filters,
  recordCount,
  onExport,
  className,
}: AuditLogExportProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [showLargeExportDialog, setShowLargeExportDialog] = useState(false);

  // Determine if export needs confirmation
  const needsConfirmation = recordCount >= EXPORT_WARNING_THRESHOLD;
  const isDisabled = recordCount === 0;

  // Handle export with confirmation for large datasets
  const handleExport = useCallback(async () => {
    if (needsConfirmation) {
      setShowLargeExportDialog(true);
      return;
    }

    await performExport();
  }, [needsConfirmation, recordCount]);

  // Perform the actual export
  const performExport = useCallback(async () => {
    setIsExporting(true);
    setShowLargeExportDialog(false);

    try {
      await onExport();

      toast({
        title: 'Export successful',
        description: `Downloaded ${recordCount.toLocaleString()} audit log records as CSV`,
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export audit logs',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  }, [onExport, recordCount, toast]);

  // Format record count for display
  const formatRecordCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toLocaleString();
  };

  return (
    <>
      <div className={cn('flex items-center gap-2', className)} role="region" aria-label="Audit Log Export">
        {/* Export Info */}
        <div className="text-sm text-gray-600">
          {recordCount > 0 ? (
            <span>
              {formatRecordCount(recordCount)} record{recordCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span>No records to export</span>
          )}
        </div>

        {/* Export Button */}
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isDisabled || isExporting}
          className="gap-2"
          aria-label={
            recordCount > 0
              ? `Export ${formatRecordCount(recordCount)} audit log records to CSV`
              : 'No audit log records to export'
          }
        >
          {isExporting ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </>
          )}
        </Button>

        {/* Warning Badge for Large Exports */}
        {recordCount >= EXPORT_WARNING_THRESHOLD && recordCount < EXPORT_LIMIT && (
          <div className="flex items-center gap-1 text-amber-600 text-sm" role="status" aria-live="polite">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Large dataset</span>
          </div>
        )}

        {/* Limit Warning */}
        {recordCount >= EXPORT_LIMIT && (
          <div className="flex items-center gap-1 text-red-600 text-sm" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Exceeds {EXPORT_LIMIT.toLocaleString()} limit</span>
          </div>
        )}
      </div>

      {/* Large Export Confirmation Dialog */}
      <AlertDialog open={showLargeExportDialog} onOpenChange={setShowLargeExportDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Export Large Dataset
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to export <strong>{recordCount.toLocaleString()}</strong> audit log records.
              This may take several minutes depending on your network connection.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Export Details */}
          <div className="space-y-3">
            <div className="rounded-md bg-gray-50 p-3 text-sm">
              <h4 className="font-medium text-gray-700 mb-2">Export Details</h4>
              <dl className="space-y-1">
                {filters.userId && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">User:</dt>
                    <dd className="text-gray-900">{filters.userId}</dd>
                  </div>
                )}
                {filters.actionType && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Action Type:</dt>
                    <dd className="text-gray-900">{filters.actionType}</dd>
                  </div>
                )}
                {filters.entityType && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Entity Type:</dt>
                    <dd className="text-gray-900">{filters.entityType}</dd>
                  </div>
                )}
                {(filters.startDate || filters.endDate) && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Date Range:</dt>
                    <dd className="text-gray-900">
                      {filters.startDate || '...'} to {filters.endDate || '...'}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
              <Download className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">CSV Format</p>
                <p className="text-blue-600">
                  Includes: Timestamp, User, Action, Entity, IP Address, and Metadata
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performExport}
              disabled={isExporting}
              className="bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
            >
              {isExporting ? 'Exporting...' : 'Export Anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
