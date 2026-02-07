'use client';

import React, { useState, useCallback } from 'react';
import { DocumentApprovalItem } from '@/server/actions/workflows/get-pending-documents';
import { WorkflowStateBadge, WorkflowStatus } from './WorkflowStateBadge';
import { approveDocument } from '@/server/actions/workflows/approve-document';
import { rejectDocument } from '@/server/actions/workflows/reject-document';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface DocumentApprovalCardProps {
  /**
   * The document to display
   */
  document: DocumentApprovalItem;
  
  /**
   * Callback when document is approved
   */
  onApprove: (documentId: string) => void;
  
  /**
   * Callback when document is rejected
   */
  onReject: (documentId: string, reason: string) => void;
  
  /**
   * Callback when an error occurs
   */
  onError?: (error: string) => void;
  
  /**
   * Optional custom class name
   */
  className?: string;
}

// ============================================
// Constants
// ============================================

const PREVIEW_TEXT_LENGTH = 200;
const REJECTION_REASON_MIN_LENGTH = 10;
const REJECTION_REASON_MAX_LENGTH = 1000;

// ============================================
// Component
// ============================================

export function DocumentApprovalCard({
  document,
  onApprove,
  onReject,
  onError,
  className
}: DocumentApprovalCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle document preview click
  const handlePreviewClick = useCallback(() => {
    // TODO: Implement document preview modal
    console.log('Preview document:', document.id);
  }, [document.id]);

  // Handle approve action
  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      await approveDocument(document.id, 'current-user-id', document.uploadedBy);
      onApprove(document.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to approve document';
      onError?.(errorMessage);
    } finally {
      setIsApproving(false);
    }
  }, [document.id, document.uploadedBy, onApprove, onError]);

  // Handle reject action with validation
  const handleReject = useCallback(async () => {
    // Validate rejection reason
    if (rejectionReason.length < REJECTION_REASON_MIN_LENGTH) {
      setRejectionError(`Rejection reason must be at least ${REJECTION_REASON_MIN_LENGTH} characters`);
      return;
    }
    
    if (rejectionReason.length > REJECTION_REASON_MAX_LENGTH) {
      setRejectionError(`Rejection reason cannot exceed ${REJECTION_REASON_MAX_LENGTH} characters`);
      return;
    }
    
    setRejectionError(null);
    setIsRejecting(true);
    
    try {
      await rejectDocument(document.id, rejectionReason, 'current-user-id', document.uploadedBy);
      setShowRejectDialog(false);
      setRejectionReason('');
      onReject(document.id, rejectionReason);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reject document';
      onError?.(errorMessage);
    } finally {
      setIsRejecting(false);
    }
  }, [document.id, document.uploadedBy, rejectionReason, onReject, onError]);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setShowRejectDialog(false);
    setRejectionReason('');
    setRejectionError(null);
  }, []);

  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-lg shadow-sm p-4',
        'hover:shadow-md transition-shadow duration-200',
        className
      )}
      role="article"
      aria-label={`Document: ${document.title}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 
              className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600"
              onClick={handlePreviewClick}
              title="Click to preview document"
            >
              {document.title}
            </h3>
            <WorkflowStateBadge 
              status={document.status as WorkflowStatus} 
              size="sm"
            />
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Uploaded by {document.uploadedBy}</span>
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatDate(document.uploadedAt)}</span>
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{document.fileType.toUpperCase()} • {formatFileSize(document.fileSize)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Preview Text */}
      {document.previewText && (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            {document.previewText.length > PREVIEW_TEXT_LENGTH 
              ? `${document.previewText.substring(0, PREVIEW_TEXT_LENGTH)}...`
              : document.previewText
            }
          </p>
        </div>
      )}

      {/* Rejection Reason Display */}
      {document.rejectionReason && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">Previously rejected</p>
              <p className="text-sm text-red-600 mt-1">{document.rejectionReason}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {document.status === 'PENDING_APPROVAL' && (
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
          {/* Reject Button with Dialog */}
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                disabled={isApproving || isRejecting}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reject Document</DialogTitle>
                <DialogDescription>
                  Please provide a reason for rejecting "{document.title}". This will be sent to the document uploader.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                <Textarea
                  placeholder="Enter rejection reason (minimum 10 characters)"
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    setRejectionError(null);
                  }}
                  className={cn(
                    'min-h-[100px]',
                    rejectionError && 'border-red-500 focus:ring-red-500'
                  )}
                  aria-invalid={!!rejectionError}
                  aria-describedby={rejectionError ? 'rejection-error' : undefined}
                />
                
                {rejectionError && (
                  <p className="mt-2 text-sm text-red-600" id="rejection-error" role="alert">
                    {rejectionError}
                  </p>
                )}
                
                <p className="mt-2 text-xs text-gray-500">
                  {rejectionReason.length}/{REJECTION_REASON_MAX_LENGTH} characters (minimum {REJECTION_REASON_MIN_LENGTH})
                </p>
              </div>
              
              <DialogFooter className="sm:justify-end">
                <Button
                  variant="ghost"
                  onClick={handleDialogClose}
                  disabled={isRejecting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isRejecting || rejectionReason.length < REJECTION_REASON_MIN_LENGTH}
                >
                  {isRejecting ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Rejecting...
                    </>
                  ) : (
                    'Reject Document'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Approve Button */}
          <Button
            variant="default"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={handleApprove}
            disabled={isApproving || isRejecting}
          >
            {isApproving ? (
              <>
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Approving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Approve
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Export Types
// ============================================

export type { DocumentApprovalCardProps };
