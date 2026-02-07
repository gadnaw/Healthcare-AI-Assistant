// MFA Challenge Component
// Phase 1 Wave 3: MFA Implementation
// React component for MFA challenge during login flow

'use client'

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

interface MFAChallengeProps {
  onChallengeComplete?: () => void
  onChallengeFail?: (error: string) => void
  onCancel?: () => void
}

interface ChallengeResponse {
  success?: boolean
  error?: string
  challengeId?: string
  factorId?: string
  expiresAt?: string
  message?: string
}

interface VerifyResponse {
  success?: boolean
  error?: string
  message?: string
}

export default function MFAChallenge({ 
  onChallengeComplete, 
  onChallengeFail,
  onCancel 
}: MFAChallengeProps) {
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Auto-focus the input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Initiate MFA challenge on mount
  useEffect(() => {
    initiateChallenge()
  }, [])

  const initiateChallenge = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data: ChallengeResponse = await response.json()

      if (data.error) {
        setError(data.error)
        onChallengeFail?.(data.error)
        return
      }

      setChallengeId(data.challengeId!)
      setFactorId(data.factorId!)

      // Start countdown if expiry provided
      if (data.expiresAt) {
        const expires = new Date(data.expiresAt).getTime()
        const interval = setInterval(() => {
          const remaining = Math.max(0, Math.ceil((expires - Date.now()) / 1000))
          setCountdown(remaining)
          
          if () {
            clearremaining <= 0Interval(interval)
            setCountdown(null)
            setError('Challenge expired. Please try again.')
          }
        }, 1000)
      }
    } catch (err) {
      const errorMessage = 'Failed to initiate MFA challenge'
      setError(errorMessage)
      onChallengeFail?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleCodeChange = (value: string) => {
    // Only allow digits and max 6 characters
    const filtered = value.replace(/\D/g, '').slice(0, 6)
    setVerificationCode(filtered)

    // Auto-submit when 6 digits entered
    if (filtered.length === 6) {
      verifyCode(filtered)
    }
  }

  const verifyCode = async (code?: string) => {
    const codeToVerify = code || verificationCode
    
    if (!codeToVerify || codeToVerify.length !== 6) {
      setError('Please enter a valid 6-digit code')
      return
    }

    if (!challengeId || !factorId) {
      setError('Challenge not initialized')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Note: For the challenge flow, we verify the TOTP code
      // This might use a different endpoint depending on the flow
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorId: factorId,
          code: codeToVerify,
          challengeId: challengeId
        })
      })
      const data: VerifyResponse = await response.json()

      if (data.error) {
        setError(data.error)
        onChallengeFail?.(data.error)
        return
      }

      // Success! MFA challenge completed
      onChallengeComplete?.()
    } catch (err) {
      const errorMessage = 'Failed to verify MFA code'
      setError(errorMessage)
      onChallengeFail?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    verifyCode()
  }

  const handleResend = async () => {
    setVerificationCode('')
    setError(null)
    await initiateChallenge()
  }

  // Loading state
  if (loading && !challengeId) {
    return (
      <div className="mfa-challenge">
        <div className="mfa-challenge__content">
          <div className="mfa-challenge__loading">
            <div className="mfa-challenge__spinner"></div>
            <p>Preparing authentication challenge...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mfa-challenge">
      <div className="mfa-challenge__content">
        <h3>Two-Factor Authentication</h3>
        <p className="mfa-challenge__description">
          Enter the 6-digit code from your authenticator app to complete login.
        </p>

        <form onSubmit={handleSubmit} className="mfa-challenge__form">
          <div className="mfa-challenge__input-section">
            <label htmlFor="mfa-challenge-code" className="mfa-challenge__label">
              Authentication Code
            </label>
            <input
              ref={inputRef}
              id="mfa-challenge-code"
              type="text"
              value={verificationCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="mfa-challenge__input"
              disabled={loading || countdown === 0}
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </div>

          {error && (
            <div className="mfa-challenge__error">
              {error}
            </div>
          )}

          {countdown !== null && countdown > 0 && (
            <div className="mfa-challenge__countdown">
              Code expires in: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
            </div>
          )}

          <div className="mfa-challenge__actions">
            <button
              type="submit"
              disabled={verificationCode.length !== 6 || loading}
              className="mfa-challenge__button mfa-challenge__button--primary"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="mfa-challenge__button mfa-challenge__button--secondary"
            >
              Resend Code
            </button>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="mfa-challenge__button mfa-challenge__button--link"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mfa-challenge__help">
          <p>
            Don&apos;t have access to your authenticator app? 
            Use one of your backup codes instead.
          </p>
        </div>
      </div>
    </div>
  )
}

// Export CSS class names for styling (typically in CSS module or global CSS)
// .mfa-challenge
// .mfa-challenge__content
// .mfa-challenge__loading
// .mfa-challenge__spinner
// .mfa-challenge__description
// .mfa-challenge__form
// .mfa-challenge__input-section
// .mfa-challenge__label
// .mfa-challenge__input
// .mfa-challenge__error
// .mfa-challenge__countdown
// .mfa-challenge__actions
// .mfa-challenge__button
// .mfa-challenge__button--primary
// .mfa-challenge__button--secondary
// .mfa-challenge__button--link
// .mfa-challenge__help
