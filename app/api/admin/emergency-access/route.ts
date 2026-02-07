import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/admin/emergency-access - List emergency access grants
export async function GET(request: NextRequest) {
    try {
        const supabase = createClient();
        
        // Verify authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }
        
        // Get organization_id from user metadata or organization_members
        const { data: orgMember, error: orgError } = await supabase
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user.id)
            .single();
        
        if (orgError || !orgMember) {
            return NextResponse.json(
                { error: 'Organization membership not found' },
                { status: 403 }
            );
        }
        
        // Check if user is admin or owner
        if (!['admin', 'owner'].includes(orgMember.role)) {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }
        
        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'all';
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');
        
        // Build query based on status filter
        let query = supabase
            .from('emergency_access_grants')
            .select(`
                id,
                granted_to_email,
                access_level,
                reason,
                granted_by,
                expires_at,
                used_at,
                revoked_at,
                revocation_reason,
                post_access_justification,
                status,
                created_at,
                reviewed_by,
                reviewed_at,
                review_notes
            `)
            .eq('organization_id', orgMember.organization_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (status !== 'all') {
            query = query.eq('status', status);
        }
        
        const { data: grants, error: grantsError } = await query;
        
        if (grantsError) {
            console.error('Error fetching emergency grants:', grantsError);
            return NextResponse.json(
                { error: 'Failed to fetch emergency access grants' },
                { status: 500 }
            );
        }
        
        return NextResponse.json({
            success: true,
            data: grants || [],
            count: grants?.length || 0
        });
        
    } catch (error) {
        console.error('Emergency access GET error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// POST /api/admin/emergency-access - Create emergency access grant
export async function POST(request: NextRequest) {
    try {
        const supabase = createClient();
        
        // Verify authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }
        
        // Get organization_id from user metadata or organization_members
        const { data: orgMember, error: orgError } = await supabase
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user.id)
            .single();
        
        if (orgError || !orgMember) {
            return NextResponse.json(
                { error: 'Organization membership not found' },
                { status: 403 }
            );
        }
        
        // Check if user is admin or owner
        if (!['admin', 'owner'].includes(orgMember.role)) {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }
        
        // Parse request body
        const body = await request.json();
        const { granted_to_email, access_level, reason } = body;
        
        // Validate required fields
        if (!granted_to_email || !granted_to_email.includes('@')) {
            return NextResponse.json(
                { error: 'Valid email address required' },
                { status: 400 }
            );
        }
        
        if (!reason || reason.length < 20) {
            return NextResponse.json(
                { error: 'Reason must be at least 20 characters' },
                { status: 400 }
            );
        }
        
        if (access_level && !['read_only', 'full_access'].includes(access_level)) {
            return NextResponse.json(
                { error: 'Invalid access level. Must be "read_only" or "full_access"' },
                { status: 400 }
            );
        }
        
        // Call the database function to create the grant
        const { data: grant, error: createError } = await supabase
            .rpc('create_emergency_access_grant', {
                p_granted_to_email: granted_to_email,
                p_access_level: access_level || 'read_only',
                p_reason: reason,
                p_organization_id: orgMember.organization_id,
                p_granted_by: user.id
            });
        
        if (createError) {
            console.error('Error creating emergency grant:', createError);
            return NextResponse.json(
                { error: 'Failed to create emergency access grant' },
                { status: 500 }
            );
        }
        
        // Get the created grant details
        const { data: grantDetails, error: fetchError } = await supabase
            .from('emergency_access_grants')
            .select('*')
            .eq('id', grant)
            .single();
        
        if (fetchError) {
            console.error('Error fetching created grant:', fetchError);
            return NextResponse.json(
                { error: 'Emergency access grant created but failed to fetch details' },
                { status: 500 }
            );
        }
        
        return NextResponse.json({
            success: true,
            data: grantDetails,
            message: 'Emergency access grant created. It requires approval before activation.'
        }, { status: 201 });
        
    } catch (error) {
        console.error('Emergency access POST error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}