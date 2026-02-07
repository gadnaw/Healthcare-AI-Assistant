'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export type WorkflowStatus = 
  | 'PENDING_APPROVAL' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'DEPRECATED'
  | 'DRAFT'
  | 'ARCHIVED';

interface WorkflowStateBadgeProps {
  /**
   * The status to display
   */
  status: WorkflowStatus;
  
  /**
   * Optional custom class name
   */
  className?: string;
  
  /**
   * Whether to show a smaller variant
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Whether to show the status icon
   */
  showIcon?: boolean;
}

// ============================================
// Status Configuration
// ============================================

const STATUS_CONFIG: Record<WorkflowStatus, {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: string;
  iconColor: string;
}> = {
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    iconColor: 'text-yellow-500'
  },
  APPROVED: {
    label: 'Approved',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    icon: 'M5 13l4 4L19 7',
    iconColor: 'text-green-500'
  },
  REJECTED: {
    label: 'Rejected',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    icon: 'M6 18L18 6M6 6l12 12',
    iconColor: 'text-red-500'
  },
  DEPRECATED: {
    label: 'Deprecated',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    iconColor: 'text-gray-500'
  },
  DRAFT: {
    label: 'Draft',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    iconColor: 'text-blue-500'
  },
  ARCHIVED: {
    label: 'Archived',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    borderColor: 'border-gray-300',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    iconColor: 'text-gray-400'
  }
};

// ============================================
// Size Configuration
// ============================================

const SIZE_CONFIG = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    icon: 'w-3 h-3'
  },
  md: {
    badge: 'px-3 py-1 text-sm',
    icon: 'w-4 h-4'
  },
  lg: {
    badge: 'px-4 py-1.5 text-base',
    icon: 'w-5 h-5'
  }
};

// ============================================
// Component
// ============================================

export function WorkflowStateBadge({
  status,
  className,
  size = 'md',
  showIcon = true
}: WorkflowStateBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  
  if (!config) {
    console.warn(`Unknown workflow status: ${status}`);
    return null;
  }
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        config.bgColor,
        config.textColor,
        config.borderColor,
        sizeConfig.badge,
        className
      )}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      {showIcon && (
        <svg
          className={cn(sizeConfig.icon, config.iconColor)}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={config.icon}
          />
        </svg>
      )}
      <span>{config.label}</span>
    </span>
  );
}

// ============================================
// Export Helper Functions
// ============================================

/**
 * Get status color for custom implementations
 */
export function getStatusConfig(status: WorkflowStatus) {
  return STATUS_CONFIG[status];
}

/**
 * Check if status represents a terminal state
 */
export function isTerminalStatus(status: WorkflowStatus): boolean {
  return ['APPROVED', 'REJECTED', 'DEPRECATED', 'ARCHIVED'].includes(status);
}

/**
 * Check if status is actionable (can be approved/rejected)
 */
export function isActionableStatus(status: WorkflowStatus): boolean {
  return status === 'PENDING_APPROVAL';
}
