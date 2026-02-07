'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Activity, Zap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LatencyCardProps {
  p50: number;
  p95: number;
  p99: number;
  average: number;
  status: 'healthy' | 'warning' | 'critical';
  thresholds: {
    warning: number;
    critical: number;
  };
  timeRange: string;
}

export function LatencyCard({
  p50,
  p95,
  p99,
  average,
  status,
  thresholds,
  timeRange
}: LatencyCardProps): JSX.Element {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return 'border-green-500';
      case 'warning': return 'border-yellow-500';
      case 'critical': return 'border-red-500';
    }
  };

  const getLatencyColor = (latency: number) => {
    if (latency < thresholds.warning) return 'text-green-500';
    if (latency < thresholds.critical) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLatencyStatus = (latency: number) => {
    if (latency < thresholds.warning) return 'healthy';
    if (latency < thresholds.critical) return 'warning';
    return 'critical';
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const percentiles = [
    { label: 'p50 (Median)', value: p50, icon: <Target className="h-4 w-4" /> },
    { label: 'p95', value: p95, icon: <Activity className="h-4 w-4" /> },
    { label: 'p99', value: p99, icon: <Zap className="h-4 w-4" /> }
  ];

  return (
    <Card className={cn('border-l-4', getStatusColor())}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Response Latency
          </CardTitle>
          <Badge variant={status === 'healthy' ? 'secondary' : status === 'warning' ? 'warning' : 'destructive'}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Average Latency */}
        <div className="mb-4 pb-4 border-b">
          <div className="text-sm text-muted-foreground">Average Response Time</div>
          <div className={cn('text-3xl font-bold', getLatencyColor(average))}>
            {formatLatency(average)}
          </div>
        </div>

        {/* Percentiles */}
        <div className="space-y-3">
          {percentiles.map(({ label, value, icon }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {icon}
                  <span>{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('font-semibold', getLatencyColor(value))}>
                    {formatLatency(value)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {getLatencyStatus(value)}
                  </Badge>
                </div>
              </div>
              {/* Progress bar showing threshold progress */}
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all',
                    getLatencyStatus(value) === 'healthy' ? 'bg-green-500' :
                    getLatencyStatus(value) === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                  )}
                  style={{ width: `${Math.min((value / thresholds.critical) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Thresholds Legend */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>&lt;{thresholds.warning}ms</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>{thresholds.warning}-{thresholds.critical}ms</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>&gt;{thresholds.critical}ms</span>
            </div>
          </div>
          <span>Last {timeRange}</span>
        </div>
      </CardContent>
    </Card>
  );
}
