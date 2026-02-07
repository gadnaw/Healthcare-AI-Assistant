'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Clock, FileText, User, Stethoscope } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { completeJustification } from '@/server/actions/compliance/complete-justification'
import type { EmergencyAccessGrant } from '@prisma/client'

interface JustificationFormProps {
  grant: EmergencyAccessGrant
  onComplete?: (justification: any) => void
}

export function JustificationForm({ grant, onComplete }: JustificationFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [patientContext, setPatientContext] = useState('')
  const [clinicalJustification, setClinicalJustification] = useState('')
  const [informationAccessed, setInformationAccessed] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (clinicalJustification.length < 50) {
      toast({
        title: 'Justification too brief',
        description: 'Please provide a clinical justification of at least 50 characters',
        variant: 'destructive'
      })
      return
    }

    if (!patientContext.trim() || !informationAccessed.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      })
      return
    }

    setIsSubmitting(true)
    try {
      const justification = await completeJustification(grant.id, clinicalJustification)

      // Store additional details in metadata if needed
      toast({
        title: 'Justification submitted',
        description: 'Your justification has been submitted for compliance review',
        variant: 'default'
      })

      if (onComplete) {
        onComplete(justification)
      }

      router.refresh()
    } catch (error) {
      toast({
        title: 'Submission failed',
        description: error instanceof Error ? error.message : 'Failed to submit justification',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const accessDuration = grant.expiresAt && grant.grantedAt
    ? Math.round((grant.expiresAt.getTime() - grant.grantedAt.getTime()) / 1000 / 60)
    : null

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="bg-amber-50 border-b">
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          Emergency Access Justification Required
        </CardTitle>
        <CardDescription className="text-amber-700">
          You must complete this justification to close the emergency access record
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        {accessDuration && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 text-blue-800">
              <Clock className="h-4 w-4" />
              <span className="font-medium">Emergency Access Summary</span>
            </div>
            <div className="mt-2 text-sm text-blue-700">
              <p>Access Duration: {accessDuration} minutes</p>
              <p>Granted: {grant.grantedAt.toLocaleString()}</p>
              <p>Expired: {grant.expiresAt.toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="mb-6 p-3 bg-amber-50 rounded-md text-sm text-amber-800">
          <AlertTriangle className="inline h-4 w-4 mr-1" />
          Incomplete or unclear justifications may be escalated for additional review
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="patientContext" className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4" />
              Patient Context <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="patientContext"
              placeholder="Patient ID, name, or other identifying information accessed..."
              value={patientContext}
              onChange={(e) => setPatientContext(e.target.value)}
              rows={2}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="clinicalJustification" className="flex items-center gap-2 text-sm font-medium">
              <Stethoscope className="h-4 w-4" />
              Clinical Justification <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="clinicalJustification"
              placeholder="Explain the clinical necessity for emergency access (minimum 50 characters)..."
              value={clinicalJustification}
              onChange={(e) => setClinicalJustification(e.target.value)}
              minLength={50}
              maxLength={2000}
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              {clinicalJustification.length}/2000 characters (minimum 50)
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="informationAccessed" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Information Accessed <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="informationAccessed"
              placeholder="List the specific records or information accessed..."
              value={informationAccessed}
              onChange={(e) => setInformationAccessed(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="additionalNotes" className="text-sm font-medium">
              Additional Notes <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="additionalNotes"
              placeholder="Any additional context or notes..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Justification'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
