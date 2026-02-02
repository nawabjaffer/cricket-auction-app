// ============================================================================
// PLAYER IMAGE COMPONENT
// Handles Google Drive URLs with proper fallback for player images
// ============================================================================

import React, { useState, useMemo } from 'react';
import { extractDriveFileId } from '../../utils/driveImage';

interface PlayerImageProps {
  imageUrl: string | undefined;
  playerName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  showFallback?: boolean;
}

const SIZE_MAP = {
  sm: 48,
  md: 80,
  lg: 120,
  xl: 200,
  full: 400,
};

export const PlayerImage: React.FC<PlayerImageProps> = ({
  imageUrl,
  playerName,
  size = 'md',
  className = '',
  showFallback = true,
}) => {
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Generate multiple URL formats to try
  const imageUrls = useMemo(() => {
    if (!imageUrl) return [];
    
    const urls: string[] = [];
    const fileId = extractDriveFileId(imageUrl);
    
    if (fileId) {
      // Try lh3 first (best CORS support for Google Drive)
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}=s${SIZE_MAP[size] * 2}`);
      // Try thumbnail endpoint
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w${SIZE_MAP[size] * 2}`);
      // Try direct export view
      urls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
    } else {
      // Non-Drive URL, use as-is
      urls.push(imageUrl);
    }
    
    return urls;
  }, [imageUrl, size]);

  // Generate fallback - use placeholder instead of avatar letters
  const fallbackUrl = useMemo(() => {
    return '/placeholder_player.png';
  }, []);

  const handleError = () => {
    if (currentUrlIndex < imageUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1);
    } else {
      setImageError(true);
    }
  };

  // Reset state when imageUrl changes
  React.useEffect(() => {
    setCurrentUrlIndex(0);
    setImageError(false);
  }, [imageUrl]);

  const currentUrl = imageError || imageUrls.length === 0
    ? (showFallback ? fallbackUrl : '')
    : imageUrls[currentUrlIndex];

  if (!currentUrl) return null;

  return (
    <img
      src={currentUrl}
      alt={playerName}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  );
};

export default PlayerImage;
