// ============================================================================
// PLAYER IMAGE COMPONENT
// Handles Google Drive URLs with proper fallback for player images
// ============================================================================

import React, { useState, useMemo } from 'react';
import { extractDriveFileId } from '../../utils/driveImage';
import { localImageCacheService } from '../../services/localImageCache';

interface PlayerImageProps {
  imageUrl: string | undefined;
  playerName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  showFallback?: boolean;
  fallbackSrc?: string;
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
  fallbackSrc = '/placeholder_player.png',
}) => {
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState('');

  // Generate multiple URL formats to try
  const imageUrls = useMemo(() => {
    if (!imageUrl) return [];

    const fileId = extractDriveFileId(imageUrl);

    if (fileId) {
      return [
        `https://lh3.googleusercontent.com/d/${fileId}=s${SIZE_MAP[size] * 2}`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w${SIZE_MAP[size] * 2}`,
        `https://drive.google.com/uc?export=view&id=${fileId}`,
      ];
    }

    return [imageUrl];
  }, [imageUrl, size]);

  // Generate fallback - use placeholder instead of avatar letters
  const fallbackUrl = useMemo(() => {
    return fallbackSrc;
  }, [fallbackSrc]);

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
    setResolvedSrc('');
  }, [imageUrl]);

  let currentUrl = imageUrls[currentUrlIndex] || '';
  if (imageError || imageUrls.length === 0) {
    currentUrl = showFallback ? fallbackUrl : '';
  }

  React.useEffect(() => {
    let isActive = true;
    let revoke: (() => void) | undefined;

    const resolveSource = async () => {
      if (!currentUrl) {
        setResolvedSrc('');
        return;
      }

      // Data/blob URLs are already fully resolved — use them directly without async fetch
      if (currentUrl.startsWith('data:') || currentUrl.startsWith('blob:')) {
        setResolvedSrc(currentUrl);
        return;
      }

      const result = await localImageCacheService.resolveImageSrc(currentUrl);
      if (!isActive) {
        result.revoke?.();
        return;
      }

      revoke = result.revoke;
      setResolvedSrc(result.src || currentUrl);
    };

    resolveSource();

    return () => {
      isActive = false;
      revoke?.();
    };
  }, [currentUrl]);

  if (!currentUrl) return null;

  // For data/blob URLs, use them directly without waiting for the async cache effect cycle
  const effectiveSrc = resolvedSrc ||
    (currentUrl.startsWith('data:') || currentUrl.startsWith('blob:') ? currentUrl : '');

  if (!effectiveSrc) return null;

  // For data/blob URLs, always load eagerly since they don't need network fetch
  const isInlineUrl = currentUrl.startsWith('data:') || currentUrl.startsWith('blob:');

  return (
    <img
      src={effectiveSrc}
      alt={playerName}
      className={className}
      onError={handleError}
      loading={isInlineUrl ? 'eager' : 'lazy'}
    />
  );
};

export default PlayerImage;
