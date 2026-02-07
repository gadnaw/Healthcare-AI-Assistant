// Document loader factory for selecting appropriate loader based on file type
// Phase 2: Document Management & RAG

import { RawDocument, LoaderResult } from '../types';
import { PdfLoader } from './PdfLoader';
import { DocxLoader } from './DocxLoader';
import { TxtLoader } from './TxtLoader';

// ============================================================================
// Loader Factory
// ============================================================================

export interface Loader {
  load(filePath: string | Buffer, fileName: string): Promise<LoaderResult>;
  canLoad(fileName: string, mimeType: string): boolean;
}

/**
 * Factory class for selecting and managing document loaders
 */
export class LoaderFactory {
  private loaders: Map<string, Loader>;
  
  constructor() {
    this.loaders = new Map();
    
    // Register all available loaders
    this.registerLoader('pdf', new PdfLoader());
    this.registerLoader('docx', new DocxLoader());
    this.registerLoader('txt', new TxtLoader());
  }
  
  /**
   * Register a loader for a specific file type
   */
  registerLoader(fileType: string, loader: Loader): void {
    this.loaders.set(fileType.toLowerCase(), loader);
  }
  
  /**
   * Get the appropriate loader for a file based on extension
   */
  getLoaderForExtension(extension: string): Loader | null {
    const normalizedExt = extension.toLowerCase().replace(/^\./, '');
    return this.loaders.get(normalizedExt) || null;
  }
  
  /**
   * Get the appropriate loader for a file based on filename and MIME type
   */
  getLoaderForFile(fileName: string, mimeType: string): Loader | null {
    const extension = this.getFileExtension(fileName);
    
    // First try by extension
    const loaderByExt = this.getLoaderForExtension(extension);
    if (loaderByExt && loaderByExt.canLoad(fileName, mimeType)) {
      return loaderByExt;
    }
    
    // Try by MIME type
    for (const [, loader] of this.loaders) {
      if (loader.canLoad(fileName, mimeType)) {
        return loader;
      }
    }
    
    return null;
  }
  
  /**
   * Check if a file type is supported
   */
  isSupported(fileName: string, mimeType: string): boolean {
    return this.getLoaderForFile(fileName, mimeType) !== null;
  }
  
  /**
   * Get list of supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.loaders.keys());
  }
  
  /**
   * Get list of supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    const mimeTypes = new Set<string>();
    for (const [, loader] of this.loaders) {
      // This would need to be implemented in each loader
      // For now, we'll add the common ones
      if (loader instanceof PdfLoader) {
        mimeTypes.add('application/pdf');
      } else if (loader instanceof DocxLoader) {
        mimeTypes.add('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else if (loader instanceof TxtLoader) {
        mimeTypes.add('text/plain');
      }
    }
    return Array.from(mimeTypes);
  }
  
  /**
   * Extract file extension from filename
   */
  private getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const loaderFactory = new LoaderFactory();

// ============================================================================
// Convenience functions
// ============================================================================

/**
 * Get the appropriate loader for a file
 */
export function getLoaderForFile(
  fileName: string,
  mimeType: string
): Loader | null {
  return loaderFactory.getLoaderForFile(fileName, mimeType);
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(
  fileName: string,
  mimeType: string
): boolean {
  return loaderFactory.isSupported(fileName, mimeType);
}

/**
 * Load a document using the appropriate loader
 */
export async function loadDocument(
  filePath: string | Buffer,
  fileName: string,
  mimeType: string
): Promise<LoaderResult> {
  const loader = getLoaderForFile(fileName, mimeType);
  
  if (!loader) {
    return {
      success: false,
      error: `No loader found for file type: ${fileName} (${mimeType}). Supported types: ${loaderFactory.getSupportedExtensions().join(', ')}`,
    };
  }
  
  return loader.load(filePath, fileName);
}
