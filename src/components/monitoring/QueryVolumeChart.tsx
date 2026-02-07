'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueryVolumeChartProps {
  data: {
    timestamp: string;
    volume: number;
  }[];
  currentVolume: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  averageVolume: number;
  maxVolume: number;
  timeRange: string;
}

export function QueryVolumeChart({
  data,
  currentVolume,
  trend,
  trendPercentage,
  averageVolume,
  maxVolume,
  timeRange
}: QueryVolumeChartProps): JSX.Element {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  // Calculate chart height percentage
  const chartHeight = (volume: number) => {
    return maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Query Volume
          </CardTitle>
          <Badge variant="outline">{timeRange}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Current Volume Display */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-3xl font-bold">{currentVolume.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Current volume</div>
          </div>
          <div className={cn('flex items-center gap-2', getTrendColor())}>
            {getTrendIcon()}
            <span className="text-sm font-medium">
              {trendPercentage > 0 ? '+' : ''}{trendPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Simple Bar Chart */}
        <div className="space-y-1">
          <div className="flex items-end justify-between h-32 gap-1">
            {data.slice(-20).map((point, index) => (
              <div
                key={index}
                className="flex-1 bg-blue-500 rounded-t"
                style={{ height: `${chartHeight(point.volume)}%` }}
                title={`${point.timestamp}: ${point.volume}`}
              />
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-lg font-semibold">{averageVolume.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Average</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{maxVolume.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Peak</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{data.length}</div>
            <div className="text-xs text-muted-foreground">Data points</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
