'use client';

import React, { useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// Types
// ============================================================================

interface UploadedDocument {
  document_id: string;
  name: string;
  status: string;
  uploaded_at: string;
  file_size: number;
  file_hash: string;
}

interface UploadProgress {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number;
  message?: string;
  documentId?: string;
  error?: string;
}

interface DocumentUploadProps {
  onUploadComplete?: (document: UploadedDocument) => void;
  onError?: (error: string) => void;
  maxFileSize?: number; // in bytes, default 50MB
  acceptedTypes?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_TYPES = ['.pdf', '.txt', '.docx'];
const API_ENDPOINT = '/api/documents/upload';

// ============================================================================
// Component
// ============================================================================

export function DocumentUpload({
  onUploadComplete,
  onError,
  maxFileSize = DEFAULT_MAX_SIZE,
  acceptedTypes = ACCEPTED_TYPES,
}: DocumentUploadProps) {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    status: 'idle',
    progress: 0,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // =========================================================================
  // Validation
  // =========================================================================

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file size
      if (file.size > maxFileSize) {
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        return `File size exceeds ${maxSizeMB}MB limit`;
      }

      // Check file type
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedTypes.includes(fileExtension)) {
        return `Invalid file type. Accepted types: ${acceptedTypes.join(', ')}`;
      }

      // Check for empty file
      if (file.size === 0) {
        return 'File is empty';
      }

      return null;
    },
    [maxFileSize, acceptedTypes]
  );

  // =========================================================================
  // File Handling
  // =========================================================================

  const handleFileSelect = useCallback(
    (file: File) => {
      setValidationError(null);
      setSelectedFile(file);

      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setValidationError(validationError);
        return;
      }

      // Clear previous upload state
      setUploadProgress({
        status: 'idle',
        progress: 0,
      });
    },
    [validateFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  // =========================================================================
  // Upload
  // =========================================================================

  const uploadFile = useCallback(async () => {
    if (!selectedFile) {
      return;
    }

    setUploadProgress({
      status: 'uploading',
      progress: 0,
      message: 'Uploading file...',
    });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Get auth token (in production, this would come from AuthContext)
      const authToken = localStorage.getItem('auth_token') || '';

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }

      const result = await response.json();

      if (result.success) {
        setUploadProgress({
          status: 'processing',
          progress: 100,
          message: 'Processing document...',
          documentId: result.data.document_id,
        });

        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete(result.data);
        }

        // Refresh router to update document list
        router.refresh();

        // Auto-trigger processing status check
        // This would typically be handled by the ProcessingStatus component
        console.log(`[DocumentUpload] Upload complete, document ID: ${result.data.document_id}`);
      } else {
        throw new Error(result.error?.message || 'Upload failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      setUploadProgress({
        status: 'error',
        progress: 0,
        error: errorMessage,
      });

      if (onError) {
        onError(errorMessage);
      }
    }
  }, [selectedFile, onUploadComplete, onError, router]);

  // =========================================================================
  // Reset
  // =========================================================================

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
    setUploadProgress({
      status: 'idle',
      progress: 0,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: UploadProgress['status']): string => {
    const colors: Record<UploadProgress['status'], string> = {
      idle: '#6b7280',
      uploading: '#3b82f6',
      processing: '#f59e0b',
      success: '#10b981',
      error: '#ef4444',
    };
    return colors[status];
  };

  const renderDragZone = () => (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-colors duration-200 ease-in-out
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
        ${uploadProgress.status !== 'idle' ? 'pointer-events-none opacity-50' : ''}
      `}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={uploadProgress.status !== 'idle'}
      />

      {/* Upload Icon */}
      <div className="mb-4 flex justify-center">
        <svg
          className={`w-12 h-12 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>

      {/* Text */}
      <div className="text-sm text-gray-600">
        <p className="font-medium mb-1">
          {isDragging ? 'Drop file here' : 'Drag and drop a file here'}
        </p>
        <p className="text-gray-500">
          or <span className="text-blue-500 font-medium">click to browse</span>
        </p>
      </div>

      {/* File types */}
      <div className="mt-4 text-xs text-gray-400">
        Accepted types: {acceptedTypes.join(', ')} • Max size: {formatFileSize(maxFileSize)}
      </div>
    </div>
  );

  const renderSelectedFile = () => {
    if (!selectedFile) return null;

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* File Icon */}
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>

            {/* File Info */}
            <div>
              <p className="font-medium text-gray-900 truncate max-w-xs">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            {uploadProgress.status === 'idle' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReset();
                  }}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Remove
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    uploadFile();
                  }}
                  className="px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Upload
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderProgress = () => {
    if (uploadProgress.status === 'idle') return null;

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        {/* Status Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: getStatusColor(uploadProgress.status) }}
            />
            <span className="font-medium text-gray-900 capitalize">
              {uploadProgress.status === 'uploading' && 'Uploading...'}
              {uploadProgress.status === 'processing' && 'Processing...'}
              {uploadProgress.status === 'success' && 'Complete'}
              {uploadProgress.status === 'error' && 'Failed'}
            </span>
          </div>
          <span className="text-sm text-gray-500">{uploadProgress.progress}%</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${uploadProgress.progress}%`,
              backgroundColor: getStatusColor(uploadProgress.status),
            }}
          />
        </div>

        {/* Message */}
        {uploadProgress.message && (
          <p className="text-sm text-gray-600">{uploadProgress.message}</p>
        )}

        {/* Error */}
        {uploadProgress.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-700">{uploadProgress.error}</p>
            </div>
            {uploadProgress.status === 'error' && (
              <button
                onClick={handleReset}
                className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Success Document Link */}
        {uploadProgress.status === 'success' && uploadProgress.documentId && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-700">Document uploaded successfully!</p>
              <button
                onClick={() => router.push(`/documents/${uploadProgress.documentId}`)}
                className="text-sm text-green-600 hover:text-green-800 font-medium"
              >
                View →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderValidationError = () => {
    if (!validationError) return null;

    return (
      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-red-700">{validationError}</p>
        </div>
        <button
          onClick={() => {
            setValidationError(null);
            handleReset();
          }}
          className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
        >
          Select another file
        </button>
      </div>
    );
  };

  // =========================================================================
  // Main Render
  // =========================================================================

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Component Container */}
      <div className="bg-white rounded-lg">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload clinical documents to make them searchable
          </p>
        </div>

        {/* Drag Zone */}
        {renderDragZone()}

        {/* Selected File */}
        {renderSelectedFile()}

        {/* Validation Error */}
        {renderValidationError()}

        {/* Progress */}
        {renderProgress()}

        {/* Tips */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Tips for best results:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Use PDF files for best text extraction</li>
            <li>• Documents with clear section headers process faster</li>
            <li>• Maximum file size is 50MB</li>
            <li>• Processing typically takes 10-30 seconds per page</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export default DocumentUpload;
