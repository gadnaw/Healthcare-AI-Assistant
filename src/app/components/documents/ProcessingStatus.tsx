'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

interface ProcessingStatus {
  document_id: string;
  status: 'uploaded' | 'validating' | 'processing' | 'chunking' | 'embedding' | 'storing' | 'ready' | 'error' | 'deleting';
  progress: number;
  current_step: string;
  metadata: {
    total_chunks: number;
    processed_chunks: number;
    failed_chunks: number;
  };
  error?: {
    message: string;
    step?: string;
    timestamp?: string;
    retryable?: boolean;
  };
  estimated_completion?: string;
}

interface ProcessingStatusProps {
  documentId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  pollInterval?: number; // in milliseconds, default 2000
  maxRetries?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds
const MAX_RETRIES = 3;
const TIMEOUT_MS = 300000; // 5 minutes timeout

// ============================================================================
// Component
// ============================================================================

export function ProcessingStatus({
  documentId,
  onComplete,
  onError,
  pollInterval = DEFAULT_POLL_INTERVAL,
  maxRetries = MAX_RETRIES,
}: ProcessingStatusProps) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const [startTime] = useState(Date.now());
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // =========================================================================
  // Status Fetching
  // =========================================================================

  const fetchStatus = useCallback(async () => {
    try {
      // Get auth token
      const authToken = localStorage.getItem('auth_token') || '';

      const response = await fetch(`/api/documents/${documentId}/status`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch status');
      }

      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        setError(null);
        setRetryCount(0);
      } else {
        throw new Error(result.error?.message || 'Failed to fetch status');
      }
    } catch (err) {
      if (retryCount < maxRetries) {
        setRetryCount((r) => r + 1);
        // Retry after delay
        retryTimeoutRef.current = setTimeout(fetchStatus, pollInterval);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch status';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [documentId, pollInterval, maxRetries, retryCount, onError]);

  // =========================================================================
  // Polling Effect
  // =========================================================================

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Set up polling
    const poll = () => {
      if (status?.status === 'ready' || status?.status === 'error') {
        setIsPolling(false);
        return;
      }

      // Check timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        setIsPolling(false);
        setError('Processing timed out after 5 minutes');
        return;
      }

      pollTimeoutRef.current = setTimeout(async () => {
        await fetchStatus();
        poll();
      }, pollInterval);
    };

    if (isPolling && status?.status !== 'ready' && status?.status !== 'error') {
      poll();
    }

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [isPolling, status, pollInterval, startTime, fetchStatus]);

  // =========================================================================
  // Retry Handler
  // =========================================================================

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRetryCount(0);
    setIsPolling(true);
    fetchStatus();
  }, [fetchStatus]);

  // =========================================================================
  // Completion Handler
  // =========================================================================

  useEffect(() => {
    if (status?.status === 'ready' && onComplete) {
      onComplete();
    }
  }, [status?.status, onComplete]);

  // =========================================================================
  // Render Helpers
// =========================================================================

  const getStatusColor = (status: ProcessingStatus['status']): string => {
    const colors: Record<ProcessingStatus['status'], string> = {
      uploaded: '#3b82f6',      // blue
      validating: '#3b82f6',     // blue
      processing: '#f59e0b',    // yellow
      chunking: '#f59e0b',      // yellow
      embedding: '#f59e0b',    // yellow
      storing: '#f59e0b',       // yellow
      ready: '#10b981',         // green
      error: '#ef4444',         // red
      deleting: '#6b7280',      // gray
    };
    return colors[status];
  };

  const getStatusIcon = (status: ProcessingStatus['status']): React.ReactNode => {
    const icons: Record<ProcessingStatus['status'], React.ReactNode> = {
      uploaded: (
        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      validating: (
        <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
      processing: (
        <svg className="w-6 h-6 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
      chunking: (
        <svg className="w-6 h-6 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
      embedding: (
        <svg className="w-6 h-6 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
      storing: (
        <svg className="w-6 h-6 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
      ready: (
        <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      error: (
        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      deleting: (
        <svg className="w-6 h-6 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
    };

    return icons[status];
  };

  const getStatusMessage = (status: ProcessingStatus['status']): string => {
    const messages: Record<ProcessingStatus['status'], string> = {
      uploaded: 'Your document has been uploaded and is waiting to be processed',
      validating: 'Validating file security and format...',
      processing: 'Your document is being processed...',
      chunking: 'Splitting document into manageable chunks...',
      embedding: 'Generating semantic embeddings for search...',
      storing: 'Storing embeddings in vector database...',
      ready: 'Document is ready for search!',
      error: 'An error occurred during processing',
      deleting: 'Document is being deleted...',
    };
    return messages[status];
  };

  const formatTimeRemaining = (estimatedCompletion?: string): string => {
    if (!estimatedCompletion) return '';
    
    const now = Date.now();
    const eta = new Date(estimatedCompletion).getTime();
    const seconds = Math.max(0, Math.ceil((eta - now) / 1000));
    
    if (seconds < 60) {
      return `~${seconds} seconds remaining`;
    } else if (seconds < 3600) {
      const minutes = Math.ceil(seconds / 60);
      return `~${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
    }
    
    return '';
  };

  // =========================================================================
  // Render States
  // =========================================================================

  const renderLoading = () => (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
        <svg className="w-8 h-8 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Loading status...</h3>
      <p className="text-gray-500">Retrieving document processing information</p>
    </div>
  );

  const renderError = () => (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load status</h3>
      <p className="text-gray-500 mb-4">{error}</p>
      <button
        onClick={handleRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );

  const renderSuccess = () => (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Processing Complete!</h3>
      <p className="text-gray-500 mb-4">Your document is now ready for search</p>
    </div>
  );

  // =========================================================================
  // Main Render
  // =========================================================================

  if (isLoading) {
    return renderLoading();
  }

  if (error && !status) {
    return renderError();
  }

  if (!status) {
    return null;
  }

  // Success state
  if (status.status === 'ready') {
    return renderSuccess();
  }

  // Main status display
  return (
    <div className="w-full max-w-md mx-auto">
      {/* Status Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          {/* Icon */}
          <div className="flex-shrink-0">
            {getStatusIcon(status.status)}
          </div>

          {/* Title */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 capitalize">
              {status.status === 'deleting' ? 'Deleting Document' : 'Processing Document'}
            </h3>
            <p className="text-sm text-gray-500">
              {getStatusMessage(status.status)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm font-medium text-gray-900">{status.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${status.progress}%`,
                backgroundColor: getStatusColor(status.status),
              }}
            />
          </div>
        </div>

        {/* Current Step */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: getStatusColor(status.status) }}
            />
            <span className="text-sm font-medium text-gray-900">{status.current_step}</span>
          </div>

          {/* Chunk Progress */}
          {status.metadata.total_chunks > 0 && (
            <div className="text-xs text-gray-500 mt-2">
              {status.status === 'ready' ? (
                <span>
                  {status.metadata.total_chunks} chunks processed successfully
                </span>
              ) : (
                <span>
                  {status.metadata.processed_chunks} of {status.metadata.total_chunks} chunks processed
                  {status.metadata.failed_chunks > 0 && (
                    <span className="text-red-500 ml-2">
                      ({status.metadata.failed_chunks} failed)
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Estimated Time */}
          {status.estimated_completion && status.status !== 'ready' && (
            <div className="text-xs text-gray-500 mt-2">
              {formatTimeRemaining(status.estimated_completion)}
            </div>
          )}
        </div>

        {/* Error Display */}
        {status.status === 'error' && status.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-red-800">Processing Error</h4>
                <p className="text-sm text-red-600 mt-1">{status.error.message}</p>
                {status.error.step && (
                  <p className="text-xs text-red-500 mt-1">Failed at: {status.error.step}</p>
                )}
                {status.error.retryable && (
                  <button
                    onClick={handleRetry}
                    className="mt-3 text-sm text-red-700 hover:text-red-900 font-medium"
                  >
                    Try Again →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Processing Animation */}
        {['processing', 'chunking', 'embedding', 'storing', 'validating', 'uploaded'].includes(status.status) && (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}

        {/* Status Footer */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Document ID: {status.document_id.slice(0, 8)}...</span>
            {isPolling && (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                Live updates
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export default ProcessingStatus;
