'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuditLogViewer } from '@/components/compliance/AuditLogViewer'
import { EmergencyAccessReview } from '@/components/compliance/EmergencyAccessReview'
import { SystemHealthDashboard } from '@/components/compliance/SystemHealthDashboard'
import { ComplianceMetrics } from '@/components/compliance/ComplianceMetrics'
import { PermissionGate } from '@/components/rbac/PermissionGate'
import { useSystemHealth } from '@/hooks/useSystemHealth'

export default function CompliancePage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Compliance Dashboard</h1>
      
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="emergency">Emergency Access</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <ComplianceOverview />
        </TabsContent>
        
        <TabsContent value="audit">
          <PermissionGate permission="AUDIT_VIEW">
            <AuditLogViewer />
          </PermissionGate>
        </TabsContent>
        
        <TabsContent value="emergency">
          <PermissionGate permission="USER_MANAGE">
            <EmergencyAccessReview />
          </PermissionGate>
        </TabsContent>
        
        <TabsContent value="health">
          <SystemHealthDashboard showCompliance={true} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ComplianceOverview() {
  const { compliance, health, loading, error } = useSystemHealth()
  
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-8">
          <p className="text-red-600">Error loading compliance overview: {error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Compliance Score</CardTitle>
            <CardDescription>Overall HIPAA compliance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {compliance?.complianceScore ?? 0}%
            </div>
            <div className="mt-2">
              <ComplianceScoreBadge score={compliance?.complianceScore ?? 0} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current system health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusIndicator status={health?.status} />
              <span className="text-lg font-medium capitalize">
                {health?.status ?? 'unknown'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Last checked: {health?.lastChecked ? new Date(health.lastChecked).toLocaleTimeString() : 'Never'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Pending Reviews</CardTitle>
            <CardDescription>Awaiting action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Emergency Justifications</span>
                <span className="font-medium">{compliance?.pendingJustifications ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Document Approvals</span>
                <span className="font-medium">{compliance?.documentApprovalPending ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Policy Violations</span>
                <span className="font-medium">{compliance?.policyViolations ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Compliance Metrics */}
      {compliance && <ComplianceMetrics metrics={compliance} />}
      
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common compliance tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <QuickActionButton
              href="/admin/users"
              label="User Management"
              description="Invite and manage users"
            />
            <QuickActionButton
              href="/admin/settings"
              label="Organization Settings"
              description="Configure policies"
            />
            <QuickActionButton
              href="/admin/compliance?tab=audit"
              label="Audit Logs"
              description="View activity logs"
            />
            <QuickActionButton
              href="/admin/compliance?tab=health"
              label="System Health"
              description="Monitor status"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ComplianceScoreBadge({ score }: { score: number }) {
  let color = 'bg-red-500'
  let label = 'Critical'
  
  if (score >= 95) {
    color = 'bg-green-500'
    label = 'Excellent'
  } else if (score >= 85) {
    color = 'bg-blue-500'
    label = 'Good'
  } else if (score >= 70) {
    color = 'bg-yellow-500'
    label = 'Needs Attention'
  } else if (score >= 50) {
    color = 'bg-orange-500'
    label = 'At Risk'
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

function StatusIndicator({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    unhealthy: 'bg-red-500',
    unknown: 'bg-gray-500'
  }

  return (
    <div className={`w-3 h-3 rounded-full ${colors[status ?? 'unknown']}`} />
  )
}

function QuickActionButton({ 
  href, 
  label, 
  description 
}: { 
  href: string
  label: string
  description: string 
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-gray-50 transition-colors"
    >
      <span className="font-medium">{label}</span>
      <span className="text-sm text-gray-500">{description}</span>
    </a>
  )
}
