'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getFeedbackDashboardAction, FeedbackDashboardData, FeedbackStats, DailyTrend, RecentFeedback } from '@/server/actions/feedback/get-feedback-dashboard';
import { PermissionGate } from '@/components/rbac/PermissionGate';
import { Permission } from '@/lib/rbac/permissions';
import { cn } from '@/lib/utils';

// ============================================================================
// Basic UI Components (inline to avoid missing dependencies)
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'outline' | 'ghost' | 'default';
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
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 focus:ring-gray-500',
    ghost: 'hover:bg-gray-100 focus:ring-gray-500',
  };

  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 py-2',
    lg: 'h-12 px-6 text-lg',
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

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-gray-200', className)}>
      {children}
    </div>
  );
}

function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4', className)}>
      {children}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

// ============================================================================
// Types
// ============================================================================

interface FeedbackDashboardProps {
  /**
   * Initial date range start
   */
  startDate?: string;

  /**
   * Initial date range end
   */
  endDate?: string;

  /**
   * Custom class name for styling
   */
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function FeedbackDashboard({
  startDate,
  endDate,
  className,
}: FeedbackDashboardProps) {
  const [dashboardData, setDashboardData] = useState<FeedbackDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    start: startDate || getDefaultStartDate(),
    end: endDate || new Date().toISOString().split('T')[0],
  });
  const [filterHelpful, setFilterHelpful] = useState<boolean | undefined>(undefined);

  // Get default start date (30 days ago)
  function getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  }

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getFeedbackDashboardAction({
        startDate: dateRange.start,
        endDate: dateRange.end,
        helpful: filterHelpful,
      });

      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback data');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, filterHelpful]);

  // Load data on mount and when filters change
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle date range change
  const handleDateRangeChange = useCallback((field: 'start' | 'end', value: string) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Handle filter change
  const handleFilterChange = useCallback((value: string) => {
    setFilterHelpful(value === 'all' ? undefined : value === 'helpful' ? true : false);
  }, []);

  // Handle export
  const handleExport = useCallback(() => {
    if (!dashboardData) return;

    const csvContent = generateCSV(dashboardData);
    downloadCSV(csvContent, `feedback-export-${dateRange.start}-${dateRange.end}.csv`);
  }, [dashboardData, dateRange]);

  // Generate CSV from dashboard data
  function generateCSV(data: FeedbackDashboardData): string {
    const headers = ['Date', 'Total Feedback', 'Helpful', 'Unhelpful'];
    const rows = data.trends.map((trend) => [
      trend.date,
      trend.total.toString(),
      trend.helpful.toString(),
      trend.unhelpful.toString(),
    ]);

    const commentHeaders = ['Date', 'Message ID', 'Helpful', 'Comment'];
    const commentRows = data.recentComments.map((comment) => [
      new Date(comment.createdAt).toISOString().split('T')[0],
      comment.messageId,
      comment.helpful ? 'Yes' : 'No',
      comment.comment || '',
    ]);

    return [
      '# Feedback Statistics',
      `Generated: ${new Date().toISOString()}`,
      `Date Range: ${dateRange.start} to ${dateRange.end}`,
      '',
      '# Summary Statistics',
      `Total Feedback: ${data.stats.total}`,
      `Helpful: ${data.stats.helpfulCount}`,
      `Unhelpful: ${data.stats.unhelpfulCount}`,
      `Average Helpfulness: ${(data.stats.averageHelpfulness * 100).toFixed(1)}%`,
      '',
      '# Daily Trends',
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      '',
      '# Recent Comments',
      commentHeaders.join(','),
      ...commentRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
  }

  // Download CSV file
  function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Calculate response rate (placeholder - would need total messages from chat API)
  const responseRate = dashboardData ? Math.min(100, (dashboardData.stats.total / 100) * 100) : 0;

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <div className="flex flex-col items-center gap-3">
          <svg
            className="w-8 h-8 animate-spin text-blue-600"
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
          <span className="text-gray-600">Loading feedback data...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('p-4 bg-red-50 border border-red-200 rounded-lg', className)}>
        <div className="flex items-center gap-2 text-red-700">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-medium">Error loading feedback data</span>
        </div>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={loadDashboardData}
          className="mt-3"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <PermissionGate
      permission={Permission.FEEDBACK_VIEW}
      fallback={
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-700">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="font-medium">Access Denied</span>
          </div>
          <p className="mt-2 text-sm text-yellow-600">
            You do not have permission to view the feedback dashboard.
          </p>
        </div>
      }
    >
      <div className={cn('space-y-6', className)}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Feedback Dashboard</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!dashboardData}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="startDate" className="text-sm font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={dateRange.start}
                  onChange={(e) => handleDateRangeChange('start', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="endDate" className="text-sm font-medium text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={dateRange.end}
                  onChange={(e) => handleDateRangeChange('end', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="filter" className="text-sm font-medium text-gray-700">
                  Filter by Rating
                </label>
                <Select
                  id="filter"
                  value={filterHelpful === undefined ? 'all' : filterHelpful ? 'helpful' : 'unhelpful'}
                  onChange={(e) => handleFilterChange(e.target.value)}
                >
                  <option value="all">All Feedback</option>
                  <option value="helpful">Helpful Only</option>
                  <option value="unhelpful">Not Helpful Only</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        {dashboardData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500">Total Feedback</span>
                  <span className="text-3xl font-bold text-gray-900">{dashboardData.stats.total}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500">Helpful</span>
                  <span className="text-3xl font-bold text-green-600">{dashboardData.stats.helpfulCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500">Not Helpful</span>
                  <span className="text-3xl font-bold text-red-600">{dashboardData.stats.unhelpfulCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500">Response Rate</span>
                  <span className="text-3xl font-bold text-blue-600">{responseRate.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Trend Chart */}
        {dashboardData && dashboardData.trends.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Feedback Trends</h3>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-end gap-1">
                {dashboardData.trends.map((trend, index) => (
                  <div
                    key={trend.date}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${trend.date}: ${trend.total} total (${trend.helpful} helpful, ${trend.unhelpful} not helpful)`}
                  >
                    <div className="w-full flex gap-0.5" style={{ height: '200px' }}>
                      <div
                        className="flex-1 bg-green-500 rounded-t"
                        style={{
                          height: `${(trend.helpful / Math.max(trend.total, 1)) * 200}px`,
                          minHeight: trend.helpful > 0 ? '4px' : '0',
                        }}
                      />
                      <div
                        className="flex-1 bg-red-500 rounded-t"
                        style={{
                          height: `${(trend.unhelpful / Math.max(trend.total, 1)) * 200}px`,
                          minHeight: trend.unhelpful > 0 ? '4px' : '0',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 truncate w-full text-center">
                      {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span className="text-sm text-gray-600">Helpful</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span className="text-sm text-gray-600">Not Helpful</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Comments */}
        {dashboardData && dashboardData.recentComments.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Recent Comments</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardData.recentComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-xs font-medium',
                              comment.helpful
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            )}
                          >
                            {comment.helpful ? 'Helpful' : 'Not Helpful'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(comment.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {comment.comment && (
                          <p className="text-sm text-gray-700">{comment.comment}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Message ID: {comment.messageId}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {dashboardData && dashboardData.stats.total === 0 && (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg
                  className="w-12 h-12 text-gray-300 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No feedback data</h3>
                <p className="text-sm text-gray-500">
                  No feedback was submitted during the selected date range.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PermissionGate>
  );
}
