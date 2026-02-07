'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface AuditLogFilters {
  userId?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

interface AuditFiltersProps {
  filters: AuditLogFilters;
  onFilterChange: (filters: AuditLogFilters) => void;
  users?: UserOption[];
  className?: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

// ============================================================================
// Action Types for Filtering
// ============================================================================

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'DOCUMENT_UPLOAD', label: 'Document Upload' },
  { value: 'DOCUMENT_APPROVE', label: 'Document Approval' },
  { value: 'DOCUMENT_REJECT', label: 'Document Rejection' },
  { value: 'DOCUMENT_VIEW', label: 'Document View' },
  { value: 'DOCUMENT_DOWNLOAD', label: 'Document Download' },
  { value: 'USER_INVITE', label: 'User Invite' },
  { value: 'USER_DEACTIVATE', label: 'User Deactivation' },
  { value: 'ROLE_ASSIGN', label: 'Role Assignment' },
  { value: 'EMERGENCY_ACCESS', label: 'Emergency Access' },
  { value: 'FEEDBACK_SUBMIT', label: 'Feedback Submission' },
  { value: 'FEEDBACK_VIEW', label: 'Feedback View' },
  { value: 'AUDIT_EXPORT', label: 'Audit Export' },
  { value: 'SETTINGS_CHANGE', label: 'Settings Change' },
  { value: 'CHAT_MESSAGE', label: 'Chat Message' },
  { value: 'AUTH_LOGIN', label: 'Login' },
  { value: 'AUTH_LOGOUT', label: 'Logout' },
  { value: 'AUTH_FAILED', label: 'Failed Login' },
];

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'document', label: 'Document' },
  { value: 'user', label: 'User' },
  { value: 'message', label: 'Message' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'settings', label: 'Settings' },
  { value: 'audit_log', label: 'Audit Log' },
];

// ============================================================================
// Date Range Presets
// ============================================================================

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
  { value: '90days', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
];

// ============================================================================
// Basic UI Components (inline to avoid missing dependencies)
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'outline' | 'ghost' | 'default' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 focus:ring-gray-500 text-gray-700',
    ghost: 'hover:bg-gray-100 focus:ring-gray-500 text-gray-600',
    destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 py-2',
    lg: 'h-12 px-6 text-base',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700" htmlFor={props.id}>
          {label}
        </label>
      )}
      <select
        className={cn(
          'h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

function Input({ label, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700" htmlFor={props.id}>
          {label}
        </label>
      )}
      <input
        className={cn(
          'h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}

function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-blue-100 text-blue-800 border-blue-200',
    secondary: 'bg-gray-100 text-gray-800 border-gray-200',
    destructive: 'bg-red-100 text-red-800 border-red-200',
    outline: 'bg-white text-gray-700 border-gray-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AuditFilters({
  filters,
  onFilterChange,
  users = [],
  className,
}: AuditFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [datePreset, setDatePreset] = useState('custom');

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.userId) count++;
    if (filters.actionType) count++;
    if (filters.entityType) count++;
    if (filters.entityId) count++;
    if (filters.startDate) count++;
    if (filters.endDate) count++;
    return count;
  }, [filters]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    <K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) => {
      onFilterChange({
        ...filters,
        [key]: value,
        page: 1, // Reset to first page on filter change
      });
    },
    [filters, onFilterChange]
  );

  // Handle date preset selection
  const handleDatePresetChange = useCallback(
    (preset: string) => {
      setDatePreset(preset);
      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date | undefined = now;

      switch (preset) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case '7days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'custom':
          // Keep existing dates
          return;
      }

      if (startDate) {
        onFilterChange({
          ...filters,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          page: 1,
        });
      }
    },
    [filters, onFilterChange]
  );

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    onFilterChange({
      page: 1,
      pageSize: filters.pageSize || 50,
    });
    setDatePreset('custom');
  }, [filters.pageSize, onFilterChange]);

  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-lg',
        className
      )}
      role="region"
      aria-label="Audit Log Filters"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary">{activeFilterCount} active</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-gray-500 hover:text-gray-700"
            >
              Clear all
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls="filter-content"
            className="text-gray-500 hover:text-gray-700"
          >
            {isExpanded ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            )}
          </Button>
        </div>
      </div>

      {/* Filter Content */}
      {isExpanded && (
        <div id="filter-content" className="p-4 space-y-4">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={datePreset === preset.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleDatePresetChange(preset.value)}
                aria-pressed={datePreset === preset.value}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Main Filters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* User Filter */}
            <Select
              id="user-filter"
              label="User"
              value={filters.userId || ''}
              onChange={(e) => handleFilterChange('userId', e.target.value || undefined)}
              disabled={users.length === 0}
            >
              <option value="">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </Select>

            {/* Action Type Filter */}
            <Select
              id="action-type-filter"
              label="Action Type"
              value={filters.actionType || ''}
              onChange={(e) => handleFilterChange('actionType', e.target.value || undefined)}
            >
              {ACTION_TYPES.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </Select>

            {/* Entity Type Filter */}
            <Select
              id="entity-type-filter"
              label="Entity Type"
              value={filters.entityType || ''}
              onChange={(e) => handleFilterChange('entityType', e.target.value || undefined)}
            >
              {ENTITY_TYPES.map((entity) => (
                <option key={entity.value} value={entity.value}>
                  {entity.label}
                </option>
              ))}
            </Select>

            {/* Entity ID Search */}
            <Input
              id="entity-id-search"
              label="Entity ID"
              placeholder="Search by entity ID..."
              value={filters.entityId || ''}
              onChange={(e) => handleFilterChange('entityId', e.target.value || undefined)}
            />

            {/* Start Date */}
            <Input
              id="start-date"
              label="Start Date"
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => {
                setDatePreset('custom');
                handleFilterChange('startDate', e.target.value || undefined);
              }}
            />

            {/* End Date */}
            <Input
              id="end-date"
              label="End Date"
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => {
                setDatePreset('custom');
                handleFilterChange('endDate', e.target.value || undefined);
              }}
            />
          </div>

          {/* Active Filter Badges */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">Active filters:</span>
              {filters.userId && (
                <Badge variant="outline">
                  User: {users.find((u) => u.id === filters.userId)?.name || filters.userId}
                  <button
                    onClick={() => handleFilterChange('userId', undefined)}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    aria-label={`Remove user filter`}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filters.actionType && (
                <Badge variant="outline">
                  Action: {ACTION_TYPES.find((a) => a.value === filters.actionType)?.label}
                  <button
                    onClick={() => handleFilterChange('actionType', undefined)}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    aria-label={`Remove action type filter`}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filters.entityType && (
                <Badge variant="outline">
                  Entity: {ENTITY_TYPES.find((e) => e.value === filters.entityType)?.label}
                  <button
                    onClick={() => handleFilterChange('entityType', undefined)}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    aria-label={`Remove entity type filter`}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filters.entityId && (
                <Badge variant="outline">
                  ID: {filters.entityId}
                  <button
                    onClick={() => handleFilterChange('entityId', undefined)}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    aria-label={`Remove entity ID filter`}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {(filters.startDate || filters.endDate) && (
                <Badge variant="outline">
                  {filters.startDate || '...'} to {filters.endDate || '...'}
                  <button
                    onClick={() => {
                      handleFilterChange('startDate', undefined);
                      handleFilterChange('endDate', undefined);
                    }}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                    aria-label={`Remove date range filter`}
                  >
                    ×
                  </button>
                </Badge>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
