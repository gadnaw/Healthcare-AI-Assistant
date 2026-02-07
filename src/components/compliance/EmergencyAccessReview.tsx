'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, CheckCircle, XCircle, ArrowUpCircle, Clock, User, FileText, Calendar } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { usePermissions } from '@/hooks/usePermissions'
import { reviewJustification } from '@/server/actions/compliance/review-justification'

interface EmergencyAccessReviewProps {
  showPendingOnly?: boolean
}

interface JustificationWithGrant {
  id: string
  justification: string
  status: string
  submittedAt: Date
  reviewedAt?: Date | null
  reviewedBy?: string | null
  reviewNotes?: string | null
  grant: {
    id: string
    reason: string
    grantedAt: Date
    expiresAt: Date
    user: {
      id: string
      name: string | null
      email: string
    }
  }
}

// Mock data for demonstration - in production, this would come from the server
const mockJustifications: JustificationWithGrant[] = [
  {
    id: '1',
    justification: 'Patient presenting with acute chest pain in ED, needed immediate access to cardiology records for treatment decisions. This was a life-threatening situation requiring immediate intervention.',
    status: 'PENDING',
    submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    grant: {
      id: 'g1',
      reason: 'Emergency cardiology consult for acute chest pain',
      grantedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      user: {
        id: 'u1',
        name: 'Dr. Sarah Johnson',
        email: 'sarah.johnson@hospital.org'
      }
    }
  },
  {
    id: '2',
    justification: 'Required access to complete medication reconciliation for patient admission. The patient was unable to provide complete medication history due to acute condition.',
    status: 'PENDING',
    submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    grant: {
      id: 'g2',
      reason: 'Medication reconciliation for new admission',
      grantedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      user: {
        id: 'u2',
        name: 'Dr. Michael Chen',
        email: 'michael.chen@hospital.org'
      }
    }
  }
]

export function EmergencyAccessReview({ showPendingOnly = true }: EmergencyAccessReviewProps) {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const [selectedJustification, setSelectedJustification] = useState<JustificationWithGrant | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [isReviewing, setIsReviewing] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Check permissions
  const canReview = hasPermission('USER_MANAGE')

  if (!canReview) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
          <p>You do not have permission to review emergency access justifications.</p>
        </CardContent>
      </Card>
    )
  }

  const handleReview = async (decision: 'APPROVE' | 'REJECT' | 'ESCALATE') => {
    if (!selectedJustification) return

    setIsReviewing(true)
    try {
      await reviewJustification(selectedJustification.id, decision, reviewNotes)
      toast({
        title: 'Review submitted',
        description: `Justification has been ${decision.toLowerCase()}`,
        variant: 'default'
      })
      setIsDialogOpen(false)
      setSelectedJustification(null)
      setReviewNotes('')
    } catch (error) {
      toast({
        title: 'Review failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsReviewing(false)
    }
  }

  const openReviewDialog = (justification: JustificationWithGrant) => {
    setSelectedJustification(justification)
    setReviewNotes('')
    setIsDialogOpen(true)
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      PENDING: 'secondary',
      APPROVED: 'default',
      REJECTED: 'destructive',
      ESCALATED: 'outline'
    }
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>
  }

  const justifications = showPendingOnly
    ? mockJustifications.filter(j => j.status === 'PENDING')
    : mockJustifications

  const escalated = mockJustifications.filter(j => j.status === 'ESCALATED')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Emergency Access Justification Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending">
                Pending Review ({mockJustifications.filter(j => j.status === 'PENDING').length})
              </TabsTrigger>
              <TabsTrigger value="escalated">
                Escalated ({escalated.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {justifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>No pending justifications to review</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {justifications.map((justification) => (
                    <div
                      key={justification.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => openReviewDialog(justification)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{justification.grant.user.name}</span>
                          <span className="text-muted-foreground">({justification.grant.user.email})</span>
                        </div>
                        {getStatusBadge(justification.status)}
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>Accessed: {justification.grant.grantedAt.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Submitted: {justification.submittedAt.toLocaleString()}</span>
                        </div>
                        <div className="pt-2">
                          <p className="font-medium">Reason for access:</p>
                          <p className="text-muted-foreground">{justification.grant.reason}</p>
                        </div>
                        <div className="pt-2">
                          <p className="font-medium">Justification:</p>
                          <p className="text-muted-foreground line-clamp-2">{justification.justification}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="escalated" className="mt-4">
              {escalated.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowUpCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <p>No escalated justifications</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {escalated.map((justification) => (
                    <div
                      key={justification.id}
                      className="p-4 border border-amber-200 bg-amber-50 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{justification.grant.user.name}</span>
                        </div>
                        {getStatusBadge(justification.status)}
                      </div>
                      <p className="text-sm mt-2">{justification.justification}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Justification</DialogTitle>
            <DialogDescription>
              Review the emergency access justification and make a decision
            </DialogDescription>
          </DialogHeader>

          {selectedJustification && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span className="font-medium">{selectedJustification.grant.user.name}</span>
                  </div>
                  {getStatusBadge(selectedJustification.status)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Access Requested</p>
                    <p>{selectedJustification.grant.grantedAt.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Submitted</p>
                    <p>{selectedJustification.submittedAt.toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground">Reason for Access</p>
                  <p className="mt-1">{selectedJustification.grant.reason}</p>
                </div>

                <div>
                  <p className="text-muted-foreground">Justification</p>
                  <p className="mt-1 p-2 bg-white rounded border">
                    {selectedJustification.justification}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="reviewNotes" className="text-sm font-medium">
                  Review Notes <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="reviewNotes"
                  placeholder="Add notes about your review decision..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => handleReview('ESCALATE')}
              disabled={isReviewing}
            >
              <ArrowUpCircle className="h-4 w-4 mr-1" />
              Escalate
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReview('REJECT')}
              disabled={isReviewing}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              variant="default"
              onClick={() => handleReview('APPROVE')}
              disabled={isReviewing}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
