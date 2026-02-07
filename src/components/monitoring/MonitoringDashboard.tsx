'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionGate } from '@/components/rbac/PermissionGate';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Activity, Shield, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface MonitoringMetrics {
  timestamp: string;
  timeRange: {
    start: string;
    end: string;
    minutes: number;
  };
  organization: {
    id: string;
  };
  queryMetrics: {
    errorRate: {
      value: number | null;
      status: string;
    };
    latency: {
      p50: number | null;
      p95: number | null;
      p99: number | null;
      status: string;
    };
  };
  securityMetrics?: {
    jailbreakAttempts: number;
    phiDetected: number;
    injectionBlocked: number;
    status: string;
  };
  complianceMetrics?: {
    auditCompleteness: number;
    phiAccessEvents: number;
    exportOperations: number;
    status: string;
  };
}

interface AlertStatus {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  recent: Array<{
    id: string;
    name: string;
    severity: string;
    message: string;
    timestamp: string;
  }>;
}

// ============================================================================
// Monitoring Dashboard Component
// ============================================================================

export default function MonitoringDashboard(): JSX.Element {
  const { hasPermission, hasRole } = usePermissions();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null);
  const [timeRange, setTimeRange] = useState('3600');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  // Check permissions - require admin or audit view
  const canView = hasPermission('AUDIT_VIEW') || hasRole('ADMIN');

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        timeRange: timeRange,
        includeSecurity: 'true',
        includeCompliance: 'true'
      });

      const response = await fetch(`/api/monitoring/metrics?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  // Fetch alert status
  const fetchAlertStatus = async () => {
    try {
      const response = await fetch('/api/monitoring/alerts');
      
      if (response.ok) {
        const data = await response.json();
        setAlertStatus(data);
      }
    } catch {
      // Silently fail for alert status
      console.warn('Failed to fetch alert status');
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!canView) return;

    fetchMetrics();
    fetchAlertStatus();

    let intervalId: NodeJS.Timeout | null = null;

    if (autoRefresh) {
      intervalId = setInterval(() => {
        fetchMetrics();
        fetchAlertStatus();
      }, refreshInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [canView, autoRefresh, refreshInterval, fetchMetrics]);

  // Handle manual refresh
  const handleRefresh = () => {
    setIsLoading(true);
    fetchMetrics();
    fetchAlertStatus();
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'degraded': return 'text-yellow-500';
      case 'unhealthy': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  // Get severity badge color
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'error': return 'bg-orange-100 text-orange-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'info': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!canView) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view the monitoring dashboard.
            Please contact an administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Real-time system health, security, and compliance metrics
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Time Range Selector */}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <Clock className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="300">Last 5 minutes</SelectItem>
              <SelectItem value="900">Last 15 minutes</SelectItem>
              <SelectItem value="3600">Last hour</SelectItem>
              <SelectItem value="14400">Last 4 hours</SelectItem>
              <SelectItem value="86400">Last 24 hours</SelectItem>
            </SelectContent>
          </Select>

          {/* Auto Refresh Toggle */}
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', autoRefresh && 'animate-spin')} />
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>

          {/* Refresh Interval */}
          {autoRefresh && (
            <Select value={refreshInterval.toString()} onValueChange={(v) => setRefreshInterval(parseInt(v, 10))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10000">10 seconds</SelectItem>
                <SelectItem value="30000">30 seconds</SelectItem>
                <SelectItem value="60000">1 minute</SelectItem>
                <SelectItem value="300000">5 minutes</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Manual Refresh */}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Fetching Metrics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && !metrics && (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading metrics...</span>
        </div>
      )}

      {/* Metrics Display */}
      {metrics && !isLoading && (
        <div className="space-y-6">
          {/* Query Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Error Rate Card */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-500" />
                  <h3 className="font-medium">Error Rate</h3>
                </div>
                <Badge variant={metrics.queryMetrics.errorRate.status === 'healthy' ? 'secondary' : 'destructive'}>
                  {metrics.queryMetrics.errorRate.status}
                </Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold">
                  {metrics.queryMetrics.errorRate.value !== null 
                    ? `${metrics.queryMetrics.errorRate.value.toFixed(2)}%` 
                    : '--'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {metrics.queryMetrics.errorRate.value !== null 
                    ? (metrics.queryMetrics.errorRate.value > 1 ? 'Above target' : 'Within target')
                    : 'Unable to retrieve'}
                </p>
              </div>
            </Card>

            {/* Latency p50 */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <h3 className="font-medium">Latency p50</h3>
                </div>
                <Badge variant={metrics.queryMetrics.latency.status === 'healthy' ? 'secondary' : 'destructive'}>
                  {metrics.queryMetrics.latency.status}
                </Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold">
                  {metrics.queryMetrics.latency.p50 !== null 
                    ? `${metrics.queryMetrics.latency.p50}ms` 
                    : '--'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Median response time</p>
              </div>
            </Card>

            {/* Latency p95 */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-500" />
                  <h3 className="font-medium">Latency p95</h3>
                </div>
                <Badge variant={
                  metrics.queryMetrics.latency.p95 !== null && metrics.queryMetrics.latency.p95 > 3000 
                    ? 'destructive' 
                    : 'secondary'
                }>
                  {metrics.queryMetrics.latency.p95 !== null 
                    ? (metrics.queryMetrics.latency.p95 > 3000 ? 'Warning' : 'OK')
                    : '--'}
                </Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold">
                  {metrics.queryMetrics.latency.p95 !== null 
                    ? `${metrics.queryMetrics.latency.p95}ms` 
                    : '--'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">95th percentile</p>
              </div>
            </Card>

            {/* Latency p99 */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-red-500" />
                  <h3 className="font-medium">Latency p99</h3>
                </div>
                <Badge variant={
                  metrics.queryMetrics.latency.p99 !== null && metrics.queryMetrics.latency.p99 > 5000 
                    ? 'destructive' 
                    : 'secondary'
                }>
                  {metrics.queryMetrics.latency.p99 !== null 
                    ? (metrics.queryMetrics.latency.p99 > 5000 ? 'Critical' : 'OK')
                    : '--'}
                </Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold">
                  {metrics.queryMetrics.latency.p99 !== null 
                    ? `${metrics.queryMetrics.latency.p99}ms` 
                    : '--'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">99th percentile</p>
              </div>
            </Card>
          </div>

          {/* Security Metrics Row */}
          {metrics.securityMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Jailbreak Attempts */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-red-500" />
                    <h3 className="font-medium">Jailbreak Attempts</h3>
                  </div>
                  <Badge variant={metrics.securityMetrics.jailbreakAttempts > 0 ? 'destructive' : 'secondary'}>
                    {metrics.securityMetrics.jailbreakAttempts > 0 ? 'Active' : 'None'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold">
                    {metrics.securityMetrics.jailbreakAttempts}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Detected in last {metrics.timeRange.minutes} minutes
                  </p>
                </div>
              </Card>

              {/* PHI Detected */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-orange-500" />
                    <h3 className="font-medium">PHI Detected</h3>
                  </div>
                  <Badge variant={metrics.securityMetrics.phiDetected > 0 ? 'warning' : 'secondary'}>
                    {metrics.securityMetrics.phiDetected > 0 ? 'Detected' : 'Clean'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold">
                    {metrics.securityMetrics.phiDetected}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    PHI inputs blocked/sanitized
                  </p>
                </div>
              </Card>

              {/* Injection Blocked */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-purple-500" />
                    <h3 className="font-medium">Injections Blocked</h3>
                  </div>
                  <Badge variant={metrics.securityMetrics.injectionBlocked > 0 ? 'destructive' : 'secondary'}>
                    {metrics.securityMetrics.injectionBlocked > 0 ? 'Blocked' : 'None'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold">
                    {metrics.securityMetrics.injectionBlocked}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Injection attempts blocked
                  </p>
                </div>
              </Card>
            </div>
          )}

          {/* Compliance Metrics Row */}
          {metrics.complianceMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Audit Completeness */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-green-500" />
                    <h3 className="font-medium">Audit Completeness</h3>
                  </div>
                  <Badge variant={
                    metrics.complianceMetrics.auditCompleteness >= 99 
                      ? 'secondary' 
                      : 'destructive'
                  }>
                    {metrics.complianceMetrics.auditCompleteness >= 99 ? 'Compliant' : 'Warning'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold">
                    {metrics.complianceMetrics.auditCompleteness.toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Operations with complete audit trail
                  </p>
                </div>
              </Card>

              {/* PHI Access Events */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-blue-500" />
                    <h3 className="font-medium">PHI Access Events</h3>
                  </div>
                  <Badge variant="secondary">
                    {metrics.complianceMetrics.phiAccessEvents > 0 ? 'Logged' : 'None'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold">
                    {metrics.complianceMetrics.phiAccessEvents}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    PHI access logged
                  </p>
                </div>
              </Card>

              {/* Export Operations */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-gray-500" />
                    <h3 className="font-medium">Export Operations</h3>
                  </div>
                  <Badge variant="secondary">
                    {metrics.complianceMetrics.exportOperations > 0 ? 'Recorded' : 'None'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold">
                    {metrics.complianceMetrics.exportOperations}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Data exports logged
                  </p>
                </div>
              </Card>
            </div>
          )}

          {/* Alert Status */}
          {alertStatus && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-lg">Alert Status</h3>
                <Badge variant="outline">
                  {alertStatus.total} active alerts
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm">Critical: {alertStatus.bySeverity.critical || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-sm">Error: {alertStatus.bySeverity.error || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-sm">Warning: {alertStatus.bySeverity.warning || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm">Info: {alertStatus.bySeverity.info || 0}</span>
                </div>
              </div>

              {alertStatus.recent.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Recent Alerts</h4>
                  {alertStatus.recent.slice(0, 5).map((alert) => (
                    <div 
                      key={alert.id}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                        <span className="text-sm">{alert.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Last Updated */}
          <div className="text-sm text-muted-foreground text-center">
            Last updated: {metrics.timestamp 
              ? new Date(metrics.timestamp).toLocaleString() 
              : 'Never'}
          </div>
        </div>
      )}
    </div>
  );
}
