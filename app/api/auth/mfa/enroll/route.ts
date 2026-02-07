// MFA Enrollment API Route
// Phase 1 Wave 3: MFA Implementation
// Handles TOTP MFA enrollment for HIPAA-compliant authentication

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// ENROLLMENT FLOW OVERVIEW
// ============================================================================
// 1. User initiates MFA enrollment via this endpoint
// 2. Server creates MFA factor in Supabase Auth
// 3. Returns QR code data URL and secret for authenticator app
// 4. User scans QR code and enters TOTP code
// 5. Verification completes via /verify endpoint
// ============================================================================

/**
 * POST /api/auth/mfa/enroll
 * 
 * Creates a new MFA enrollment for the authenticated user.
 * Returns factorId, QR code, and secret for authenticator app setup.
 * 
 * Request Body: None (uses authenticated session)
 * 
 * Returns:
 * - 200: Enrollment created successfully
 * - 401: User not authenticated
 * - 500: Enrollment failed
 */
export async function POST(request: NextRequest) {
  try {
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

    // Check if user already has MFA enrolled
    const { data: existingFactors, error: factorsError } = await supabase
      .from('auth.mfa_factors')
      .select('id, status, factor_type')
      .eq('user_id', session.user.id)
      .eq('factor_type', 'totp')
      .eq('status', 'verified')
      .single()

    if (existingFactors) {
      return NextResponse.json(
        { 
          error: 'MFA already enrolled',
          factorId: existingFactors.id,
          message: 'User already has TOTP MFA configured'
        },
        { status: 400 }
      )
    }

    // Check for pending enrollment
    const { data: pendingFactors } = await supabase
      .from('auth.mfa_factors')
      .select('id, status')
      .eq('user_id', session.user.id)
      .eq('factor_type', 'totp')
      .eq('status', 'unverified')
      .single()

    if (pendingFactors) {
      // Return existing pending enrollment
      return NextResponse.json({
        message: 'Pending MFA enrollment exists',
        factorId: pendingFactors.id,
        status: 'pending_verification',
        hint: 'Complete verification with existing enrollment or delete and retry'
      })
    }

    // Create MFA enrollment using Supabase Auth
    // Note: This uses the admin API for server-side enrollment
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

    // Enroll user in MFA
    const { data: enrollment, error: enrollError } = await supabaseAdmin.auth.mfa.enroll({
      userId: session.user.id,
      factorType: 'totp',
      friendlyName: `Healthcare AI Assistant - ${session.user.email || 'User'}`
    })

    if (enrollError) {
      console.error('MFA enrollment error:', enrollError)
      return NextResponse.json(
        { 
          error: 'Failed to create MFA enrollment',
          details: enrollError.message 
        },
        { status: 500 }
      )
    }

    // Return enrollment details
    // totp QR code and secret are returned for authenticator app setup
    return NextResponse.json({
      success: true,
      message: 'MFA enrollment initiated. Scan QR code with authenticator app.',
      factorId: enrollment.id,
      status: enrollment.status,
      qrCode: enrollment.totp.qr_code,
      secret: enrollment.totp.secret,
      provisioningUri: enrollment.totp.provisioning_uri,
      instructions: [
        '1. Open your authenticator app (Google Authenticator, Authy, etc.)',
        '2. Scan the QR code or manually enter the secret',
        '3. Enter the 6-digit code from your authenticator app',
        '4. Click Verify to complete enrollment'
      ],
      securityNote: 'Store your backup codes in a secure location. They can be used for account recovery.'
    })

  } catch (error) {
    console.error('MFA enrollment error:', error)
    return NextResponse.json(
      { error: 'Internal server error during MFA enrollment' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/mfa/enroll
 * 
 * Returns enrollment status for the current user.
 * Useful for checking if MFA is already enrolled.
 */
export async function GET(request: NextRequest) {
  try {
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

    // Check MFA status
    const { data: factors, error: factorsError } = await supabase
      .from('auth.mfa_factors')
      .select('id, status, factor_type, created_at, updated_at')
      .eq('user_id', session.user.id)
      .eq('factor_type', 'totp')

    if (factorsError) {
      console.error('Error fetching MFA factors:', factorsError)
      return NextResponse.json(
        { error: 'Failed to check MFA status' },
        { status: 500 }
      )
    }

    const verifiedFactor = factors?.find(f => f.status === 'verified')
    const pendingFactor = factors?.find(f => f.status === 'unverified')

    return NextResponse.json({
      enrolled: !!verifiedFactor,
      factorId: verifiedFactor?.id || pendingFactor?.id || null,
      status: verifiedFactor ? 'verified' : (pendingFactor ? 'pending_verification' : 'not_enrolled'),
      enrolledAt: verifiedFactor?.updated_at || null,
      canEnroll: !verifiedFactor
    })

  } catch (error) {
    console.error('Error checking MFA status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
