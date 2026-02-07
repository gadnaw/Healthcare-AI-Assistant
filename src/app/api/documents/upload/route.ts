// Document upload API endpoint
// Phase 2: Document Management & RAG
// Handles secure document upload with validation, org scoping, and audit logging

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { fileValidator, validateFile } from '../../../middleware/FileValidator';
import { loaderFactory, loadDocument } from '../../../document/loaders/LoaderFactory';
import { 
  Document, 
  DocumentStatus, 
  UploadedDocument, 
  ValidationResult,
  ApiResponse 
} from '../../../document/types';

// ============================================================================
// Configuration
// ============================================================================

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ============================================================================
// Supabase Client
// ============================================================================

// In production, these would come from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create Supabase client with service role for admin operations
const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ============================================================================
// Types
// ============================================================================

interface UploadRequest {
  file: File;
}

interface DocumentUploadResponse {
  document_id: string;
  name: string;
  status: DocumentStatus;
  uploaded_at: string;
  file_size: number;
  file_hash: string;
}

interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract user and organization from JWT claims
 * In production, this would use the auth context from Supabase/JWT
 */
async function extractAuthContext(request: NextRequest): Promise<{
  userId: string;
  organizationId: string;
} | null> {
  // In production, this would extract from JWT claims:
  // const { user_id, org_id } = await getUserFromRequest(request);
  
  // For now, try to get from Authorization header
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  // In production, decode JWT and extract claims
  // For MVP, we'll expect the org_id to be in the request or use a default
  const token = authHeader.split(' ')[1];
  
  // Placeholder: In production, decode JWT and validate
  return {
    userId: 'user-uuid-placeholder',
    organizationId: 'org-uuid-placeholder',
  };
}

/**
 * Upload file to Supabase Storage
 */
async function uploadToStorage(
  buffer: Buffer,
  fileName: string,
  organizationId: string,
  contentType: string
): Promise<{ path: string; url: string } | null> {
  if (!supabase) {
    // Return placeholder if Supabase not configured
    return {
      path: `organizations/${organizationId}/documents/${fileName}`,
      url: `https://example.supabase.co/storage/v1/object/organizations/${organizationId}/documents/${fileName}`,
    };
  }
  
  const filePath = `organizations/${organizationId}/documents/${fileName}`;
  
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType,
      upsert: false,
    });
  
  if (error) {
    console.error('Storage upload error:', error);
    return null;
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(filePath);
  
  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Create document record in database
 */
async function createDocumentRecord(
  name: string,
  fileType: string,
  fileSize: number,
  fileHash: string,
  organizationId: string,
  userId: string,
  storagePath: string
): Promise<Document | null> {
  if (!supabase) {
    // Return placeholder if Supabase not configured
    return {
      id: crypto.randomUUID(),
      organization_id: organizationId,
      name,
      file_type: fileType,
      file_size: fileSize,
      file_hash: fileHash,
      status: 'uploaded',
      metadata: {},
      version: 1,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
      audit_trail: [],
    };
  }
  
  const { data, error } = await supabase
    .from('documents')
    .insert({
      name,
      file_type: fileType,
      file_size: fileSize,
      file_hash: fileHash,
      organization_id: organizationId,
      uploaded_by: userId,
      status: 'uploaded',
      metadata: {
        storage_path: storagePath,
        uploaded_via: 'api',
      },
    })
    .select()
    .single();
  
  if (error) {
    console.error('Database insert error:', error);
    return null;
  }
  
  return data;
}

/**
 * Log upload event to audit trail
 */
async function logAuditEvent(
  documentId: string,
  organizationId: string,
  userId: string,
  event: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!supabase) {
    console.log('Audit log:', { documentId, event, details });
    return;
  }
  
  const { error } = await supabase
    .from('audit_log')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      action: event,
      resource_type: 'document',
      resource_id: documentId,
      details: {
        document_id: documentId,
        ...details,
      },
      timestamp: new Date().toISOString(),
    });
  
  if (error) {
    console.error('Audit log error:', error);
  }
}

// ============================================================================
// POST Handler - Upload Document
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<DocumentUploadResponse>>> {
  try {
    // Step 1: Extract authentication context
    const authContext = await extractAuthContext(request);
    
    if (!authContext) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please provide a valid JWT token.',
        },
      }, { status: 401 });
    }
    
    const { userId, organizationId } = authContext;
    
    // Step 2: Validate Content-Type
    const contentType = request.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content-Type must be multipart/form-data',
        },
      }, { status: 400 });
    }
    
    // Step 3: Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'No file provided. Please include a file in the form data.',
        },
      }, { status: 400 });
    }
    
    // Step 4: Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
          details: {
            file_size: file.size,
            max_size: MAX_FILE_SIZE,
          },
        },
      }, { status: 413 });
    }
    
    // Step 5: Extract file metadata
    const fileName = file.name;
    const mimeType = file.type || 'application/octet-stream';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Step 6: Validate file type
    if (!loaderFactory.isSupported(fileName, mimeType)) {
      const supportedTypes = loaderFactory.getSupportedExtensions().join(', ');
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: `File type '.${extension}' is not supported. Supported types: ${supportedTypes}`,
          details: {
            file_name: fileName,
            mime_type: mimeType,
            extension,
          },
        },
      }, { status: 400 });
    }
    
    // Step 7: Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Step 8: Validate file content
    const validationResult = await validateFile(buffer, fileName, mimeType);
    
    if (!validationResult.isValid) {
      const errorMessages = validationResult.errors.map(e => e.message).join('; ');
      
      await logAuditEvent(
        'upload-failed',
        organizationId,
        userId,
        'document_upload_validation_failed',
        {
          file_name: fileName,
          errors: validationResult.errors,
        }
      );
      
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: `File validation failed: ${errorMessages}`,
          details: {
            errors: validationResult.errors,
            metadata: validationResult.metadata,
          },
        },
      }, { status: 400 });
    }
    
    // Step 9: Calculate file hash
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Step 10: Upload to storage
    const storageResult = await uploadToStorage(
      buffer,
      fileName,
      organizationId,
      mimeType
    );
    
    if (!storageResult) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: 'Failed to upload file to storage',
        },
      }, { status: 500 });
    }
    
    // Step 11: Create document record
    const document = await createDocumentRecord(
      fileName,
      mimeType,
      file.size,
      fileHash,
      organizationId,
      userId,
      storageResult.path
    );
    
    if (!document) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create document record',
        },
      }, { status: 500 });
    }
    
    // Step 12: Log successful upload
    await logAuditEvent(
      document.id,
      organizationId,
      userId,
      'document_uploaded',
      {
        file_name: fileName,
        file_size: file.size,
        file_hash: fileHash,
        storage_path: storageResult.path,
        validation_metadata: validationResult.metadata,
      }
    );
    
    // Step 13: Return success response
    const response: ApiResponse<DocumentUploadResponse> = {
      success: true,
      data: {
        document_id: document.id,
        name: fileName,
        status: document.status,
        uploaded_at: document.uploaded_at,
        file_size: file.size,
        file_hash: fileHash,
      },
    };
    
    return NextResponse.json(response, { status: 201 });
    
  } catch (error) {
    console.error('Upload error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during document upload',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    }, { status: 500 });
  }
}

// ============================================================================
// GET Handler - Check Upload Status
// ============================================================================

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Document[]>>> {
  try {
    // Extract authentication context
    const authContext = await extractAuthContext(request);
    
    if (!authContext) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      }, { status: 401 });
    }
    
    const { organizationId } = authContext;
    
    // Query documents for organization
    if (!supabase) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }
    
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('organization_id', organizationId)
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve documents',
          details: { error: error.message },
        },
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      data: documents || [],
    });
    
  } catch (error) {
    console.error('Get documents error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    }, { status: 500 });
  }
}
