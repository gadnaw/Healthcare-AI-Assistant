// MFA Challenge API Route
// Phase 1 Wave 3: MFA Implementation
// Creates MFA challenge for login verification (AAL2)

// ============================================================================
// CHALLENGE FLOW OVERVIEW
// ============================================================================
// 1. User initiates login (already has MFA enrolled)
// 2. Server creates MFA challenge
// 3. Returns challenge ID for verification
// 4. User enters TOTP code
// 5. Verification via /verify endpoint with challenge
// ============================================================================

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/mfa/challenge
 * 
 * Creates an MFA challenge for the authenticated user.
 * Used during login to verify MFA when user already has MFA enrolled.
 * 
 * Request Body:
 * - factorId: Optional. Specific factor to challenge. Uses first verified TOTP if not provided.
 * 
 * Returns:
 * - 200: Challenge created successfully
 * - 400: No verified MFA factors available
 * - 401: User not authenticated
 * - 500: Challenge creation failed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { factorId } = body

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

    // Get verified TOTP factor if not specified
    let targetFactorId = factorId

    if (!targetFactorId) {
      const { data: factors, error: factorsError } = await supabase
        .from('auth.mfa_factors')
        .select('id, status, factor_type, friendly_name')
        .eq('user_id', session.user.id)
        .eq('factor_type', 'totp')
        .eq('status', 'verified')

      if (factorsError || !factors || factors.length === 0) {
        return NextResponse.json(
          { 
            error: 'No verified MFA factors',
            message: 'User does not have any verified TOTP factors',
            hint: 'Enroll MFA first using /api/auth/mfa/enroll'
          },
          { status: 400 }
        )
      }

      // Use the first verified factor
      targetFactorId = factors[0].id
    }

    // Use admin client to create challenge
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

    // Create MFA challenge
    const { data: challenge, error: challengeError } = await supabaseAdmin.auth.mfa.challenge({
      factorId: targetFactorId
    })

    if (challengeError) {
      console.error('MFA challenge error:', challengeError)
      return NextResponse.json(
        { 
          error: 'Failed to create MFA challenge',
          details: challengeError.message 
        },
        { status: 500 }
      )
    }

    // Return challenge details
    // The user will enter the TOTP code from their authenticator app
    return NextResponse.json({
      success: true,
      challengeId: challenge.id,
      factorId: targetFactorId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      instructions: [
        '1. Open your authenticator app',
        '2. Find the 6-digit code for this account',
        '3. Enter the code to complete verification'
      ],
      timeout: '5 minutes',
      note: 'Enter the code from your authenticator app to complete the challenge'
    })

  } catch (error) {
    console.error('MFA challenge error:', error)
    return NextResponse.json(
      { error: 'Internal server error during challenge creation' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/mfa/challenge
 * 
 * Returns available MFA factors for the current user.
 * Useful for UI to show which factors can be used for challenge.
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

    // Get user's MFA factors
    const { data: factors, error: factorsError } = await supabase
      .from('auth.mfa_factors')
      .select('id, status, factor_type, friendly_name, created_at')
      .eq('user_id', session.user.id)
      .eq('factor_type', 'totp')

    if (factorsError) {
      console.error('Error fetching MFA factors:', factorsError)
      return NextResponse.json(
        { error: 'Failed to check MFA status' },
        { status: 500 }
      )
    }

    const verifiedFactors = factors?.filter(f => f.status === 'verified') || []
    const pendingFactors = factors?.filter(f => f.status === 'unverified') || []

    return NextResponse.json({
      userId: session.user.id,
      verifiedFactors: verifiedFactors.map(f => ({
        id: f.id,
        friendlyName: f.friendly_name,
        createdAt: f.created_at
      })),
      pendingFactors: pendingFactors.map(f => ({
        id: f.id,
        friendlyName: f.friendly_name,
        createdAt: f.created_at,
        status: 'pending_verification'
      })),
      hasVerifiedMFA: verifiedFactors.length > 0,
      canCreateChallenge: verifiedFactors.length > 0
    })

  } catch (error) {
    console.error('Error checking MFA factors:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
