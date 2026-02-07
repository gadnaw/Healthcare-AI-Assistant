// MFA Setup Component
// Phase 1 Wave 3: MFA Implementation
// React component for TOTP MFA enrollment flow

'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

interface MFASetupProps {
  onEnrollmentComplete?: () => void
  onError?: (error: string) => void
}

interface EnrollmentResponse {
  success?: boolean
  error?: string
  factorId?: string
  qrCode?: string
  secret?: string
  provisioningUri?: string
  status?: string
  message?: string
}

interface VerificationResponse {
  success?: boolean
  error?: string
  status?: string
  message?: string
}

export default function MFASetup({ onEnrollmentComplete, onError }: MFASetupProps) {
  const [step, setStep] = useState<'check' | 'enroll' | 'verify' | 'success'>('check')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrollmentData, setEnrollmentData] = useState<{
    factorId: string
    qrCode: string
    secret: string
    provisioningUri: string
  } | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [mfaStatus, setMfaStatus] = useState<{
    enrolled: boolean
    status: string | null
  }>({ enrolled: false, status: null })

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Check current MFA status on mount
  useEffect(() => {
    checkMFAStatus()
  }, [])

  const checkMFAStatus = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/mfa/enroll', {
        method: 'GET'
      })
      const data = await response.json()

      if (data.error) {
        setError(data.error)
        onError?.(data.error)
        return
      }

      setMfaStatus({
        enrolled: data.enrolled,
        status: data.status
      })

      if (data.enrolled) {
        setStep('success')
      } else if (data.status === 'pending_verification') {
        setStep('verify')
        setEnrollmentData({
          factorId: data.factorId,
          qrCode: '',
          secret: '',
          provisioningUri: ''
        })
      }
    } catch (err) {
      const errorMessage = 'Failed to check MFA status'
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const initiateEnrollment = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/mfa/enroll', {
        method: 'POST'
      })
      const data: EnrollmentResponse = await response.json()

      if (data.error) {
        // Check if already enrolled
        if (data.factorId && data.status === 'verified') {
          setMfaStatus({ enrolled: true, status: 'verified' })
          setStep('success')
          return
        }
        
        setError(data.error)
        onError?.(data.error)
        return
      }

      // Store enrollment data and move to verification step
      setEnrollmentData({
        factorId: data.factorId!,
        qrCode: data.qrCode!,
        secret: data.secret!,
        provisioningUri: data.provisioningUri!
      })
      setStep('verify')
    } catch (err) {
      const errorMessage = 'Failed to initiate MFA enrollment'
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async () => {
    if (!enrollmentData || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorId: enrollmentData.factorId,
          code: verificationCode
        })
      })
      const data: VerificationResponse = await response.json()

      if (data.error) {
        setError(data.error)
        onError?.(data.error)
        return
      }

      // Success! MFA is now enrolled
      setMfaStatus({ enrolled: true, status: 'verified' })
      setStep('success')
      onEnrollmentComplete?.()
    } catch (err) {
      const errorMessage = 'Failed to verify MFA code'
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleCodeChange = (value: string) => {
    // Only allow digits and max 6 characters
    const filtered = value.replace(/\D/g, '').slice(0, 6)
    setVerificationCode(filtered)
  }

  // Render check status step
  if (step === 'check') {
    return (
      <div className="mfa-setup">
        <div className="mfa-setup__content">
          {loading ? (
            <div className="mfa-setup__loading">
              <div className="mfa-setup__spinner"></div>
              <p>Checking MFA status...</p>
            </div>
          ) : (
            <button 
              className="mfa-setup__button"
              onClick={initiateEnrollment}
              disabled={loading}
            >
              {mfaStatus.status === 'pending_verification' 
                ? 'Complete MFA Setup' 
                : 'Enable Two-Factor Authentication'
              }
            </button>
          )}
        </div>
      </div>
    )
  }

  // Render QR code and verification step
  if (step === 'verify' && enrollmentData) {
    return (
      <div className="mfa-setup">
        <div className="mfa-setup__content">
          <h3>Set Up Two-Factor Authentication</h3>
          
          <div className="mfa-setup__instructions">
            <ol>
              <li>Download an authenticator app (Google Authenticator, Authy, 1Password, etc.)</li>
              <li>Scan the QR code below with your app</li>
              <li>Enter the 6-digit code from your authenticator app</li>
            </ol>
          </div>

          <div className="mfa-setup__qr-section">
            {enrollmentData.qrCode && (
              <img 
                src={enrollmentData.qrCode} 
                alt="MFA QR Code" 
                className="mfa-setup__qr-code"
              />
            )}
            
            <div className="mfa-setup__manual-entry">
              <p>Can&apos;t scan the QR code?</p>
              <code className="mfa-setup__secret">{enrollmentData.secret}</code>
              <p className="mfa-setup__secret-hint">Enter this code manually in your authenticator app</p>
            </div>
          </div>

          <div className="mfa-setup__verification">
            <label htmlFor="mfa-code">Enter 6-digit code:</label>
            <input
              id="mfa-code"
              type="text"
              value={verificationCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="mfa-setup__input"
              disabled={loading}
            />
          </div>

          {error && <div className="mfa-setup__error">{error}</div>}

          <div className="mfa-setup__actions">
            <button
              onClick={verifyCode}
              disabled={verificationCode.length !== 6 || loading}
              className="mfa-setup__button mfa-setup__button--primary"
            >
              {loading ? 'Verifying...' : 'Verify & Enable'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render success step
  if (step === 'success') {
    return (
      <div className="mfa-setup">
        <div className="mfa-setup__content mfa-setup__success">
          <div className="mfa-setup__success-icon">✓</div>
          <h3>Two-Factor Authentication Enabled!</h3>
          <p>Your account is now protected with an extra layer of security.</p>
          
          <div className="mfa-setup__next-steps">
            <h4>Next Steps:</h4>
            <ul>
              <li>Save your backup codes in a secure location</li>
              <li>You&apos;ll need to enter a code from your authenticator app on future logins</li>
              <li>Your session now has AAL2 (Multi-Factor Authenticated) level</li>
            </ul>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="mfa-setup__button"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return null
}

// Export CSS class names for styling (typically in CSS module or global CSS)
// .mfa-setup
// .mfa-setup__content
// .mfa-setup__loading
// .mfa-setup__spinner
// .mfa-setup__button
// .mfa-setup__button--primary
// .mfa-setup__qr-section
// .mfa-setup__qr-code
// .mfa-setup__manual-entry
// .mfa-setup__secret
// .mfa-setup__secret-hint
// .mfa-setup__verification
// .mfa-setup__input
// .mfa-setup__error
// .mfa-setup__actions
// .mfa-setup__success
// .mfa-setup__success-icon
// .mfa-setup__next-steps
