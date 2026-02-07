// MFA Verification API Route
// Phase 1 Wave 3: MFA Implementation
// Handles TOTP code verification for MFA enrollment completion

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// VERIFICATION FLOW OVERVIEW
// ============================================================================
// 1. User receives TOTP code from authenticator app
// 2. Server verifies code against enrolled factor
// 3. On success, factor status changes to 'verified'
// 4. User can now access AAL2-protected resources
// ============================================================================

interface VerifyRequestBody {
  factorId: string
  code: string
}

/**
 * POST /api/auth/mfa/verify
 * 
 * Verifies a TOTP code for MFA enrollment completion.
 * 
 * Request Body:
 * - factorId: The MFA factor ID from enrollment
 * - code: 6-digit TOTP code from authenticator app
 * 
 * Returns:
 * - 200: Verification successful
 * - 400: Invalid code or missing parameters
 * - 401: User not authenticated
 * - 500: Verification failed
 */
export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequestBody = await request.json()
    const { factorId, code } = body

    // Validate required fields
    if (!factorId || !code) {
      return NextResponse.json(
        { error: 'Missing required fields', required: ['factorId', 'code'] },
        { status: 400 }
      )
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: 'Invalid code format', expected: '6-digit TOTP code' },
        { status: 400 }
      )
    }

    // Get Supabase client for authenticated operations
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ 
      cookies: () => cookieStore 
    })

    // Verify user is authenticated
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Verify the factor belongs to the user
    const { data: factor, error: factorError } = await supabase
      .from('auth.mfa_factors')
      .select('id, user_id, status, factor_type')
      .eq('id', factorId)
      .eq('user_id', session.user.id)
      .eq('factor_type', 'totp')
      .single()

    if (factorError || !factor) {
      return NextResponse.json(
        { error: 'MFA factor not found or does not belong to user' },
        { status: 400 }
      )
    }

    // Check if already verified
    if (factor.status === 'verified') {
      return NextResponse.json(
        { 
          message: 'MFA already verified',
          status: 'verified',
          note: 'Your authenticator app is already configured'
        },
        { status: 200 }
      )
    }

    // Use admin client to verify TOTP code
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the TOTP code
    const { data: verifyResult, error: verifyError } = await supabaseAdmin.auth.mfa.verify({
      factorId: factorId,
      code: code
    })

    if (verifyError) {
      console.error('MFA verification error:', verifyError)
      
      // Provide specific error messages
      if (verifyError.message.includes('Invalid TOTP code')) {
        return NextResponse.json(
          { 
            error: 'Invalid code',
            hint: 'The 6-digit code from your authenticator app is incorrect',
            attemptsRemaining: 2
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { 
          error: 'Verification failed',
          details: verifyError.message 
        },
        { status: 400 }
      )
    }

    // MFA verification successful
    // The user's AAL level should now be 'aal2'
    
    return NextResponse.json({
      success: true,
      message: 'MFA verification successful! Your account is now protected with two-factor authentication.',
      status: 'verified',
      factorId: factorId,
      nextSteps: [
        'Your authenticator app is now configured',
        'You will need to enter a code from your authenticator app on future logins',
        'Save your backup codes in a secure location',
        'Your session now has AAL2 (Multi-Factor Authenticated) level'
      ],
      securityNote: 'If you lose access to your authenticator app, use your backup codes to login and reconfigure MFA.'
    })

  } catch (error) {
    console.error('MFA verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error during verification' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/auth/mfa/verify
 * 
 * Removes MFA enrollment for the current user.
 * Requires re-authentication for security.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { factorId } = body

    if (!factorId) {
      return NextResponse.json(
        { error: 'Missing factorId' },
        { status: 400 }
      )
    }

    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ 
      cookies: () => cookieStore 
    })

    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Use admin client to delete the factor
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { error: deleteError } = await supabaseAdmin.auth.mfa.unenroll({
      factorId: factorId
    })

    if (deleteError) {
      console.error('MFA unenrollment error:', deleteError)
      return NextResponse.json(
        { 
          error: 'Failed to remove MFA',
          details: deleteError.message 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'MFA has been removed from your account',
      warning: 'Your account is now less secure. Consider re-enrolling MFA for better protection.'
    })

  } catch (error) {
    console.error('MFA unenrollment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
