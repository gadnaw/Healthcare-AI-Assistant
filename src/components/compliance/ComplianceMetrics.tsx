'use client'

import { type ComplianceMetrics } from '@/server/actions/compliance/get-compliance-metrics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  FileCheck, 
  Lock, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  Minus
} from 'lucide-react'

/**
 * Props for ComplianceMetrics component
 */
interface ComplianceMetricsProps {
  metrics: ComplianceMetrics
  showTrends?: boolean
}

/**
 * Score badge colors based on value
 */
function getScoreColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 90) {
    return { bg: 'bg-green-100', text: 'text-green-700', label: 'Excellent' }
  }
  if (score >= 70) {
    return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Good' }
  }
  return { bg: 'bg-red-100', text: 'text-red-700', label: 'Needs Attention' }
}

/**
 * Format percentage for display
 */
function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

/**
 * Compliance score card component
 */
function ComplianceScoreCard({ score }: { score: number }) {
  const colors = getScoreColor(score)
  
  return (
    <Card className="border-2 border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
          <Shield className="mr-2 h-4 w-4" />
          Overall Compliance Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline space-x-2">
          <span className={`text-5xl font-bold ${colors.text}`}>{score}</span>
          <span className="text-gray-500">/ 100</span>
        </div>
        <div className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
          {colors.label}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Metric card with progress bar
 */
function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  progress = false, 
  progressValue = 0,
  target = 100,
  warning = false,
  href?: string
}: { 
  title: string
  value: string | number
  icon: React.ElementType
  progress?: boolean
  progressValue?: number
  target?: number
  warning?: boolean
  href?: string
}) {
  const content = (
    <Card className={`transition-all hover:shadow-md ${warning ? 'border-yellow-300 bg-yellow-50/30' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
          <Icon className={`mr-2 h-4 w-4 ${warning ? 'text-yellow-600' : ''}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${warning ? 'text-yellow-700' : 'text-gray-900'}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {progress && (
          <div className="mt-3">
            <Progress value={progressValue} max={100} className="h-2" />
            <p className="mt-1 text-xs text-gray-500">
              {formatPercentage(progressValue)} of {target}% target
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
  
  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    )
  }
  
  return content
}

/**
 * Trend indicator component
 */
function TrendIndicator({ 
  current, 
  previous 
}: { 
  current: number
  previous: number 
}) {
  const diff = current - previous
  const isUp = diff > 0
  const isNeutral = Math.abs(diff) < 0.5
  
  if (isNeutral) {
    return (
      <span className="inline-flex items-center text-sm text-gray-500">
        <Minus className="mr-1 h-4 w-4" />
        No change
      </span>
    )
  }
  
  return (
    <span className={`inline-flex items-center text-sm ${isUp ? 'text-green-600' : 'text-red-600'}`}>
      {isUp ? <TrendingUp className="mr-1 h-4 w-4" /> : <TrendingDown className="mr-1 h-4 w-4" />}
      {formatPercentage(Math.abs(diff))}
    </span>
  )
}

/**
 * Simple trends chart (bar-based visualization)
 */
function SimpleTrendsChart({ trends }: { trends: ComplianceMetrics['trends'] }) {
  const maxCompliance = Math.max(...trends.map(t => t.complianceScore))
  const minCompliance = Math.min(...trends.map(t => t.complianceScore))
  const range = maxCompliance - minCompliance || 1
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-gray-500">
          Compliance Score Trend (7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end space-x-2">
          {trends.map((day, index) => {
            const height = ((day.complianceScore - minCompliance) / range) * 100
            const isToday = index === trends.length - 1
            
            return (
              <div 
                key={day.date} 
                className="flex-1 flex flex-col items-center space-y-1"
              >
                <div 
                  className={`w-full rounded-t transition-all ${isToday ? 'bg-blue-500' : 'bg-gray-300'}`}
                  style={{ height: `${Math.max(height, 5)}%` }}
                />
                <span className="text-xs text-gray-500">
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Recent violations list
 */
function ViolationsList({ count }: { count: number }) {
  if (count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
            <FileCheck className="mr-2 h-4 w-4" />
            Recent Policy Violations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No recent violations in the past 7 days</p>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-gray-500 flex items-center">
          <AlertTriangle className="mr-2 h-4 w-4 text-red-500" />
          Recent Policy Violations ({count} this week)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-100">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700">PHI Detected</span>
            </div>
            <Badge variant="destructive">Security</Badge>
          </div>
          <div className="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-100">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-700">Injection Blocked</span>
            </div>
            <Badge variant="warning">Security</Badge>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          View full audit log for detailed violation information
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * ComplianceMetrics component displays compliance status and audit metrics
 * 
 * @param metrics - Compliance metrics data from getComplianceMetricsAction
 * @param showTrends - Whether to show compliance trends chart (default: true)
 * 
 * @example
 * <ComplianceMetrics metrics={complianceData} showTrends={true} />
 */
export function ComplianceMetrics({ metrics, showTrends = true }: ComplianceMetricsProps) {
  const scoreColors = getScoreColor(metrics.complianceScore)
  
  // Calculate previous day's values for trend comparison
  const previousDay = metrics.trends[metrics.trends.length - 2]
  const currentDay = metrics.trends[metrics.trends.length - 1]
  
  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Compliance & Security</h2>
        <Badge variant="outline" className="text-sm">
          HIPAA Compliance Metrics
        </Badge>
      </div>
      
      {/* Main metrics grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Compliance Score */}
        <ComplianceScoreCard score={metrics.complianceScore} />
        
        {/* Audit Coverage */}
        <MetricCard
          title="Audit Coverage"
          value={formatPercentage(metrics.auditCoverage)}
          icon={FileCheck}
          progress={true}
          progressValue={metrics.auditCoverage}
          target={95}
        />
        
        {/* MFA Adoption */}
        <MetricCard
          title="MFA Adoption"
          value={formatPercentage(metrics.mfaAdoptionRate)}
          icon={Lock}
          progress={true}
          progressValue={metrics.mfaAdoptionRate}
          target={100}
          warning={metrics.mfaAdoptionRate < 100}
        />
        
        {/* Pending Justifications */}
        <MetricCard
          title="Pending Justifications"
          value={metrics.pendingJustifications}
          icon={Clock}
          warning={metrics.pendingJustifications > 0}
        />
      </div>
      
      {/* Secondary metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Documents Pending Approval */}
        <MetricCard
          title="Documents Pending"
          value={metrics.documentApprovalPending}
          icon={FileCheck}
          href="/admin/documents?status=pending"
        />
        
        {/* Deprecation Warnings */}
        <MetricCard
          title="Deprecation Warnings"
          value={metrics.deprecationWarnings}
          icon={AlertTriangle}
          warning={metrics.deprecationWarnings > 0}
        />
        
        {/* Policy Violations */}
        <MetricCard
          title="Policy Violations (7d)"
          value={metrics.policyViolationCount}
          icon={AlertTriangle}
          warning={metrics.policyViolationCount > 0}
        />
      </div>
      
      {/* Trends and violations */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Compliance Trends */}
        {showTrends && (
          <SimpleTrendsChart trends={metrics.trends} />
        )}
        
        {/* Recent Violations */}
        <ViolationsList count={metrics.policyViolationCount} />
      </div>
      
      {/* Overall trend */}
      {previousDay && currentDay && (
        <div className="flex items-center justify-center space-x-4 rounded-lg bg-gray-50 p-4">
          <span className="text-sm text-gray-500">Weekly Trend:</span>
          <TrendIndicator 
            current={currentDay.complianceScore} 
            previous={previousDay.complianceScore} 
          />
        </div>
      )}
    </div>
  )
}
