// ============================================================================
// PLAYER IMAGE COMPONENT
// Handles Google Drive URLs with proper fallback for player images.
// Firebase Storage is used as a CDN proxy: images are uploaded once and served
// from a fast CDN URL on every subsequent load with zero delay.
// ============================================================================

import React, { useState, useMemo } from 'react';
import { extractDriveFileId } from '../../utils/driveImage';
import { localImageCacheService } from '../../services/localImageCache';
import {
  getCachedStorageUrl,
  resolveImageAsync,
} from '../../services/firebaseStorageService';

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

  // Derive a stable storage path from the player name
  const storagePath = useMemo(
    () => `images/players/${playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    [playerName]
  );

  // Generate multiple URL formats to try.
  // If Firebase Storage already has this image, skip Drive URL juggling entirely.
  const imageUrls = useMemo(() => {
    if (!imageUrl) return [];

    // 1. Firebase Storage cache hit — fastest path, zero network
    const storageUrl = getCachedStorageUrl(imageUrl);
    if (storageUrl) return [storageUrl];

    // 2. Already a Storage URL
    if (imageUrl.includes('firebasestorage')) return [imageUrl];

    // 3. Google Drive — try CDN-friendly variants
    const fileId = extractDriveFileId(imageUrl);
    if (fileId) {
      return [
        `https://lh3.googleusercontent.com/d/${fileId}=s${SIZE_MAP[size] * 2}`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w${SIZE_MAP[size] * 2}`,
        `https://drive.google.com/uc?export=view&id=${fileId}`,
      ];
    }

    return [imageUrl];
  }, [imageUrl, size, storagePath]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Kick off Firebase Storage upload/resolution in the background.
  // When the CDN URL is ready it triggers a re-render via setResolvedSrc.
  React.useEffect(() => {
    if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) return;
    if (imageUrl.includes('firebasestorage')) return;
    resolveImageAsync(imageUrl, storagePath, (storageUrl) => {
      setResolvedSrc(storageUrl);
    });
  }, [imageUrl, storagePath]);

  let currentUrl = imageUrls[currentUrlIndex] || '';
  if (imageError || imageUrls.length === 0) {
    currentUrl = showFallback ? fallbackUrl : '';
  }
  // If Firebase Storage has delivered a CDN URL, use it unconditionally
  const effectiveUrl = (resolvedSrc && !imageError) ? resolvedSrc : currentUrl;

  React.useEffect(() => {
    let isActive = true;
    let revoke: (() => void) | undefined;

    const resolveSource = async () => {
      if (!effectiveUrl) {
        setResolvedSrc('');
        return;
      }

      // Data/blob URLs are already fully resolved — use them directly without async fetch
      if (effectiveUrl.startsWith('data:') || effectiveUrl.startsWith('blob:')) {
        setResolvedSrc(effectiveUrl);
        return;
      }

      // Firebase Storage URLs are CDN-backed — use directly, no extra fetch needed
      if (effectiveUrl.includes('firebasestorage')) {
        setResolvedSrc(effectiveUrl);
        return;
      }

      const result = await localImageCacheService.resolveImageSrc(effectiveUrl);
      if (!isActive) {
        result.revoke?.();
        return;
      }

      revoke = result.revoke;
      setResolvedSrc(result.src || effectiveUrl);
    };

    resolveSource();

    return () => {
      isActive = false;
      revoke?.();
    };
  }, [effectiveUrl]);

  if (!effectiveUrl) return null;

  // For data/blob/storage URLs, use them directly without waiting for the async cache effect cycle
  const displaySrc = resolvedSrc ||
    (effectiveUrl.startsWith('data:') || effectiveUrl.startsWith('blob:') || effectiveUrl.includes('firebasestorage')
      ? effectiveUrl
      : '');

  if (!displaySrc) return null;

  // For data/blob URLs, always load eagerly since they don't need network fetch
  const isInlineUrl = effectiveUrl.startsWith('data:') || effectiveUrl.startsWith('blob:');
  const isStorageUrl = effectiveUrl.includes('firebasestorage');

  return (
    <img
      src={displaySrc}
      alt={playerName}
      className={className}
      onError={handleError}
      loading={isInlineUrl || isStorageUrl ? 'eager' : 'lazy'}
    />
  );
};

export default PlayerImage;
