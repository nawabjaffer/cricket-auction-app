// ============================================================================
// DRIVE IMAGE UTILITIES
// Helper functions for handling Google Drive image URLs
// ============================================================================

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
 * Get the best Drive URL for displaying images
 * Uses lh3.googleusercontent.com which has better CORS support
 */
export function getDriveImageUrl(originalUrl: string): string | null {
  const fileId = extractDriveFileId(originalUrl);
  if (!fileId) return null;
  
  // Use lh3.googleusercontent.com - this works on localhost and has CORS support
  // This is the same CDN Google uses for photos
  return `https://lh3.googleusercontent.com/d/${fileId}=w800`;
}

/**
 * Get a proxied image URL for development
 * Uses local Vite proxy to bypass CORS issues
 */
export function getProxiedDriveUrl(fileId: string): string {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isDevelopment) {
    // Use local proxy endpoint on dev server
    return `/api/proxy-drive?id=${fileId}`;
  }
  
  // On production, use direct Drive URL (assumes HTTPS and proper CORS setup)
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/**
 * For a Drive URL that might be blocked (403), try to find an alternative format
 */
export function getAlternativeDriveUrl(originalUrl: string): string | null {
  const fileId = extractDriveFileId(originalUrl);
  if (!fileId) return null;
  
  // Try thumbnail endpoint which often works better
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
}
