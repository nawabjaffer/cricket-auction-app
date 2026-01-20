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
 * Create multiple image URL variants for a Drive file
 * Returns them in order of preference
 */
export function getDriveImageUrlVariants(fileId: string): string[] {
  return [
    // Primary: direct view
    `https://drive.google.com/uc?export=view&id=${fileId}`,
    
    // Alternative: thumbnail endpoint
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
    
    // Fallback: open viewer (less ideal for img tags but might work)
    `https://drive.google.com/file/d/${fileId}/preview`,
  ];
}

/**
 * For a Drive URL that might be blocked (403), try to find an alternative format
 */
export function getAlternativeDriveUrl(originalUrl: string): string | null {
  const fileId = extractDriveFileId(originalUrl);
  if (!fileId) return null;
  
  // Try the thumbnail endpoint as a fallback
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
}
