'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface DocumentDeprecationNotificationProps {
  /**
   * Document title
   */
  documentTitle: string;
  
  /**
   * Reason for deprecation
   */
  reason: string;
  
  /**
   * User who deprecated the document
   */
  deprecatedBy?: string;
  
  /**
   * Effective date of deprecation
   */
  effectiveDate?: Date;
  
  /**
   * Callback when notification is acknowledged/dismissed
   */
  onAcknowledge?: () => void;
  
  /**
   * Callback when user requests more details
   */
  onViewDetails?: () => void;
  
  /**
   * Optional custom class name
   */
  className?: string;
  
  /**
   * Whether the notification is expanded
   */
  isExpanded?: boolean;
}

// ============================================
// Component
// ============================================

export function DocumentDeprecationNotification({
  documentTitle,
  reason,
  deprecatedBy,
  effectiveDate,
  onAcknowledge,
  onViewDetails,
  className,
  isExpanded: initialExpanded = false
}: DocumentDeprecationNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Handle acknowledge button click
  const handleAcknowledge = useCallback(async () => {
    setIsAcknowledging(true);
    
    try {
      // Call the acknowledge API
      await fetch('/api/notifications/acknowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentTitle
        })
      });
      
      // Call the callback
      if (onAcknowledge) {
        onAcknowledge();
      }
    } catch (error) {
      console.error('Failed to acknowledge notification:', error);
      // Still call callback even if API fails
      if (onAcknowledge) {
        onAcknowledge();
      }
    } finally {
      setIsAcknowledging(false);
    }
  }, [documentTitle, onAcknowledge]);

  // Handle expand/collapse
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Format date for display
  const formatDate = (date: Date | undefined): string => {
    if (!date) return 'Immediate';
    
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div
      className={cn(
        'bg-amber-50 border border-amber-200 rounded-lg p-4 transition-all duration-200',
        isExpanded ? 'shadow-md' : 'shadow-sm hover:shadow-sm',
        className
      )}
      role="alert"
      aria-labelledby={`notification-title-${documentTitle}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors',
          isExpanded ? 'bg-amber-100' : 'bg-amber-50'
        )}>
          <svg 
            className="w-5 h-5 text-amber-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24" 
            aria-hidden="true"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 
                id={`notification-title-${documentTitle}`}
                className="text-sm font-semibold text-amber-800"
              >
                Document Deprecated
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                "{documentTitle}"
              </p>
            </div>
            
            {/* Expand/Collapse Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-100 flex-shrink-0"
              aria-expanded={isExpanded}
              aria-controls={`notification-details-${documentTitle}`}
            >
              {isExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </Button>
          </div>

          {/* Preview (always visible) */}
          <p className="text-sm text-amber-600 mt-2 line-clamp-2">
            {reason.length > 100 ? `${reason.substring(0, 100)}...` : reason}
          </p>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-amber-600">
            {effectiveDate && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Effective: {formatDate(effectiveDate)}</span>
              </span>
            )}
            
            {deprecatedBy && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>By: {deprecatedBy}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div 
          id={`notification-details-${documentTitle}`}
          className="mt-4 pt-4 border-t border-amber-200"
        >
          {/* Full Reason */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
              Deprecation Reason
            </h4>
            <p className="text-sm text-amber-700 bg-amber-100 rounded-md p-3">
              {reason}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            {onViewDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewDetails}
                className="border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                View Document
              </Button>
            )}
            
            <Button
              variant="default"
              size="sm"
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {isAcknowledging ? (
                <>
                  <svg 
                    className="w-4 h-4 mr-1.5 animate-spin" 
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
                  Acknowledging...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Acknowledge
                </>
              )}
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

export type { DocumentDeprecationNotificationProps };
