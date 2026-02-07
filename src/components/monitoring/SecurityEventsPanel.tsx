'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, Lock, Eye, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecurityEventsPanelProps {
  events: {
    authFailures: number;
    jailbreakAttempts: number;
    phiDetected: number;
    injectionBlocked: number;
    crossTenantAttempts: number;
    rateLimitViolations: number;
  };
  status: {
    overall: 'secure' | 'warning' | 'critical';
    auth: 'healthy' | 'warning' | 'critical';
    jailbreak: 'healthy' | 'warning' | 'critical';
    phi: 'healthy' | 'warning' | 'critical';
    injection: 'healthy' | 'warning' | 'critical';
  };
  recentEvents: Array<{
    id: string;
    type: string;
    timestamp: string;
    severity: string;
    description: string;
  }>;
  timeRange: string;
}

export function SecurityEventsPanel({
  events,
  status,
  recentEvents,
  timeRange
}: SecurityEventsPanelProps): JSX.Element {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge variant="secondary">Secure</Badge>;
      case 'warning': return <Badge variant="warning">Warning</Badge>;
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
    }
  };

  const eventTypes = [
    { key: 'authFailures', label: 'Auth Failures', icon: <Lock className="h-4 w-4" />, color: 'text-orange-500' },
    { key: 'jailbreakAttempts', label: 'Jailbreak Attempts', icon: <Search className="h-4 w-4" />, color: 'text-red-500' },
    { key: 'phiDetected', label: 'PHI Detected', icon: <Eye className="h-4 w-4" />, color: 'text-yellow-500' },
    { key: 'injectionBlocked', label: 'Injections Blocked', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-purple-500' },
    { key: 'rateLimitViolations', label: 'Rate Limit Violations', icon: <Shield className="h-4 w-4" />, color: 'text-blue-500' }
  ];

  const totalEvents = Object.values(events).reduce((sum, val) => sum + val, 0);
  const hasCriticalEvents = status.overall === 'critical';

  return (
    <Card className={cn('border-l-4', 
      status.overall === 'secure' ? 'border-green-500' :
      status.overall === 'warning' ? 'border-yellow-500' : 'border-red-500'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security Events
          </CardTitle>
          <div className="flex items-center gap-2">
            {getStatusBadge(status.overall)}
            {totalEvents > 0 && (
              <Badge variant="outline">{totalEvents} events</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Security Status Overview */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b">
          <div className={cn('flex items-center gap-2', getStatusColor(status.overall))}>
            {status.overall === 'secure' ? (
              <Shield className="h-8 w-8" />
            ) : (
              <AlertTriangle className="h-8 w-8" />
            )}
            <div>
              <div className="text-lg font-semibold">
                {status.overall === 'secure' ? 'All Clear' : 'Security Events Detected'}
              </div>
              <div className="text-sm text-muted-foreground">
                {status.overall === 'secure' 
                  ? 'No security events in the last ' + timeRange
                  : 'Review events below'
                }
              </div>
            </div>
          </div>
        </div>

        {/* Event Counts */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {eventTypes.map(({ key, label, icon, color }) => {
            const count = events[key as keyof typeof events];
            const eventStatus = status[key as keyof typeof status];
            
            return (
              <div 
                key={key}
                className={cn(
                  'p-3 rounded-lg border',
                  eventStatus === 'critical' ? 'bg-red-50 border-red-200' :
                  eventStatus === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-gray-50 border-gray-200'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className={cn('flex items-center gap-1.5', color)}>
                    {icon}
                    <span className="text-xs font-medium">{label}</span>
                  </div>
                  {count > 0 && (
                    <Badge variant={eventStatus === 'critical' ? 'destructive' : 'secondary'}>
                      {count}
                    </Badge>
                  )}
                </div>
                <div className={cn('text-lg font-bold', getStatusColor(eventStatus))}>
                  {count === 0 ? 'None' : count}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cross-Tenant (Critical - separate display) */}
        {events.crossTenantAttempts > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Cross-Tenant Attempts</span>
              </div>
              <Badge variant="destructive">{events.crossTenantAttempts}</Badge>
            </div>
            <p className="text-xs text-red-600 mt-1">
              CRITICAL: Unauthorized cross-tenant access attempts detected
            </p>
          </div>
        )}

        {/* Recent Events */}
        {recentEvents.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Recent Events</h4>
            {recentEvents.slice(0, 5).map((event) => (
              <div 
                key={event.id}
                className="flex items-start justify-between p-2 bg-muted rounded text-sm"
              >
                <div className="flex items-start gap-2">
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5',
                    event.severity === 'critical' ? 'bg-red-500' :
                    event.severity === 'high' ? 'bg-orange-500' :
                    event.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                  )} />
                  <div>
                    <div className="font-medium">{event.type}</div>
                    <div className="text-xs text-muted-foreground">{event.description}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Time Range */}
        <div className="text-xs text-muted-foreground mt-4 pt-2 border-t">
          Monitoring period: last {timeRange}
        </div>
      </CardContent>
    </Card>
  );
}
