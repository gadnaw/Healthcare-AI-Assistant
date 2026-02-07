'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorRateCardProps {
  errorRate: number;
  totalErrors: number;
  totalRequests: number;
  status: 'healthy' | 'warning' | 'critical';
  topErrors: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  timeRange: string;
}

export function ErrorRateCard({
  errorRate,
  totalErrors,
  totalRequests,
  status,
  topErrors,
  timeRange
}: ErrorRateCardProps): JSX.Element {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return 'border-green-500 bg-green-50';
      case 'warning': return 'border-yellow-500 bg-yellow-50';
      case 'critical': return 'border-red-500 bg-red-50';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getErrorRateColor = () => {
    if (errorRate < 1) return 'text-green-500';
    if (errorRate < 5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getBadgeVariant = () => {
    switch (status) {
      case 'healthy': return 'secondary';
      case 'warning': return 'warning';
      case 'critical': return 'destructive';
    }
  };

  return (
    <Card className={cn('border-l-4', getStatusColor())}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Error Rate
          </CardTitle>
          <Badge variant={getBadgeVariant()}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Error Rate Display */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className={cn('text-4xl font-bold', getErrorRateColor())}>
              {errorRate.toFixed(2)}%
            </div>
            <div className="text-sm text-muted-foreground">
              {totalErrors.toLocaleString()} errors / {totalRequests.toLocaleString()} requests
            </div>
          </div>
          {status === 'critical' && (
            <div className="flex items-center gap-1 text-red-500">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Spike detected</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span>0%</span>
            <span>1% (warning)</span>
            <span>5% (critical)</span>
            <span>100%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', 
                errorRate < 1 ? 'bg-green-500' : 
                errorRate < 5 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${Math.min(errorRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Top Errors */}
        {topErrors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Top Error Types</h4>
            {topErrors.slice(0, 3).map((error) => (
              <div key={error.type} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="truncate max-w-[150px]">{error.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{error.count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({error.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Time Range */}
        <div className="text-xs text-muted-foreground mt-4 pt-2 border-t">
          Data from last {timeRange}
        </div>
      </CardContent>
    </Card>
  );
}
