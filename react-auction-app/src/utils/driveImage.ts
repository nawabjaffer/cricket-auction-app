// ============================================================================
// DRIVE IMAGE UTILITIES
// Helper functions for handling Google Drive image URLs
// ============================================================================

// CORS proxy for development - helps with localhost CORS issues
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

/**
 * Extract file ID from a Google Drive URL
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  
  // Match patterns like /file/d/FILE_ID or ?id=FILE_ID
  const fileMatch = /\/d\/([^/?]+)/.exec(url);
  if (fileMatch?.[1]) return fileMatch[1];
  
  const idMatch = /[?&]id=([^&]+)/.exec(url);
  if (idMatch?.[1]) return idMatch[1];
  
  return null;
}

/**
 * Create multiple image URL variants for a Drive file
 * Returns them in order of preference, including CORS proxy versions for localhost
 */
export function getDriveImageUrlVariants(fileId: string): string[] {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  const variants = [
    // Primary: direct view
    `https://drive.google.com/uc?export=view&id=${fileId}`,
    
    // Alternative: thumbnail endpoint
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
    
    // For development/localhost: use CORS proxy
    ...(isDevelopment ? [
      `${CORS_PROXY}https://drive.google.com/uc?export=view&id=${fileId}`,
      `${CORS_PROXY}https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
    ] : []),
  ];
  
  return variants;
}

/**
 * For a Drive URL that might be blocked (403), try to find an alternative format
 */
export function getAlternativeDriveUrl(originalUrl: string): string | null {
  const fileId = extractDriveFileId(originalUrl);
  if (!fileId) return null;
  
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // Try thumbnail first
  const thumbnail = `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
  
  // For localhost, wrap with CORS proxy
  if (isDevelopment) {
    return `${CORS_PROXY}${thumbnail}`;
  }
  
  return thumbnail;
}

/**
 * Get a CORS proxy-wrapped URL for development
 */
export function getCorsproxiedUrl(url: string): string {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isDevelopment) return url;
  return `${CORS_PROXY}${url}`;
}
