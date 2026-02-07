'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileCheck, FileText, Shield, Download, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplianceMetricsProps {
  metrics: {
    auditCompleteness: number;
    auditEvents: number;
    phiAccessEvents: number;
    exportOperations: number;
    averageResponseTime: number;
  };
  status: {
    audit: 'compliant' | 'warning' | 'non-compliant';
    phi: 'compliant' | 'warning' | 'non-compliant';
    export: 'compliant' | 'warning' | 'non-compliant';
  };
  complianceDetails: {
    lastAuditTime: string;
    pendingReviews: number;
    upcomingDeadlines: number;
  };
  timeRange: string;
}

export function ComplianceMetrics({
  metrics,
  status,
  complianceDetails,
  timeRange
}: ComplianceMetricsProps): JSX.Element {
  const getStatusColor = (complianceStatus: string) => {
    switch (complianceStatus) {
      case 'compliant': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'non-compliant': return 'text-red-500';
    }
  };

  const getStatusBadge = (complianceStatus: string) => {
    switch (complianceStatus) {
      case 'compliant': return <Badge variant="secondary">Compliant</Badge>;
      case 'warning': return <Badge variant="warning">Warning</Badge>;
      case 'non-compliant': return <Badge variant="destructive">Non-Compliant</Badge>;
    }
  };

  const getCompletenessColor = (percentage: number) => {
    if (percentage >= 99) return 'text-green-500';
    if (percentage >= 95) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getCompletenessBarColor = (percentage: number) => {
    if (percentage >= 99) return 'bg-green-500';
    if (percentage >= 95) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card className={cn('border-l-4',
      status.audit === 'compliant' && status.phi === 'compliant' && status.export === 'compliant'
        ? 'border-green-500'
        : status.audit === 'non-compliant' || status.phi === 'non-compliant' || status.export === 'non-compliant'
          ? 'border-red-500'
          : 'border-yellow-500'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Compliance Metrics
          </CardTitle>
          <Badge variant="outline">{timeRange}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Audit Completeness - Main Metric */}
        <div className="mb-4 pb-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <span className="font-medium">Audit Completeness</span>
            </div>
            {getStatusBadge(status.audit)}
          </div>
          
          <div className="flex items-center gap-4">
            <div className={cn('text-4xl font-bold', getCompletenessColor(metrics.auditCompleteness))}>
              {metrics.auditCompleteness.toFixed(1)}%
            </div>
            <div className="flex-1">
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', getCompletenessBarColor(metrics.auditCompleteness))}
                  style={{ width: `${metrics.auditCompleteness}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span>Target: 99%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground mt-2">
            {metrics.auditEvents.toLocaleString()} audit events logged
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* PHI Access */}
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                <span className="text-xs font-medium">PHI Access Events</span>
              </div>
              {getStatusBadge(status.phi)}
            </div>
            <div className="text-2xl font-bold text-purple-700">
              {metrics.phiAccessEvents.toLocaleString()}
            </div>
            <div className="text-xs text-purple-600 mt-1">
              HIPAA-compliant logging
            </div>
          </div>

          {/* Export Operations */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-gray-500" />
                <span className="text-xs font-medium">Export Operations</span>
              </div>
              {getStatusBadge(status.export)}
            </div>
            <div className="text-2xl font-bold text-gray-700">
              {metrics.exportOperations.toLocaleString()}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Data exports logged
            </div>
          </div>
        </div>

        {/* Compliance Details */}
        <div className="space-y-2 pt-4 border-t">
          <h4 className="text-xs font-medium text-muted-foreground">Compliance Status</h4>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Last Audit Log</span>
            </div>
            <span className="font-medium">
              {complianceDetails.lastAuditTime 
                ? new Date(complianceDetails.lastAuditTime).toLocaleString()
                : 'Never'
              }
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Pending Reviews</span>
            </div>
            <Badge variant={complianceDetails.pendingReviews > 0 ? 'warning' : 'secondary'}>
              {complianceDetails.pendingReviews}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Upcoming Deadlines</span>
            </div>
            <Badge variant={complianceDetails.upcomingDeadlines > 0 ? 'destructive' : 'secondary'}>
              {complianceDetails.upcomingDeadlines}
            </Badge>
          </div>
        </div>

        {/* Summary */}
        <div className={cn(
          'mt-4 p-3 rounded-lg text-sm',
          status.audit === 'compliant' && status.phi === 'compliant' && status.export === 'compliant'
            ? 'bg-green-50 text-green-700'
            : 'bg-yellow-50 text-yellow-700'
        )}>
          <div className="font-medium">
            {status.audit === 'compliant' && status.phi === 'compliant' && status.export === 'compliant'
              ? 'All compliance metrics within HIPAA requirements'
              : 'Some compliance metrics require attention'
            }
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
