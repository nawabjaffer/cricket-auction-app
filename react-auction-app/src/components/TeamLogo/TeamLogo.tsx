// ============================================================================
// TEAM LOGO COMPONENT
// Handles Google Drive URLs with proper fallback.
// Firebase Storage is used as a CDN proxy for instant repeat loads.
// ============================================================================

import React, { useState, useMemo } from 'react';
import { extractDriveFileId } from '../../utils/driveImage';
import {
  getCachedStorageUrl,
  resolveImageAsync,
} from '../../services/firebaseStorageService';

interface TeamLogoProps {
  logoUrl: string | undefined;
  teamName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

export const TeamLogo: React.FC<TeamLogoProps> = ({
  logoUrl,
  teamName,
  size = 'md',
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [storageUrl, setStorageUrl] = useState<string | null>(null);

  // Stable storage path for this team
  const storagePath = useMemo(
    () => `images/teams/${teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    [teamName]
  );

  // Kick off Firebase Storage resolution in the background
  React.useEffect(() => {
    if (!logoUrl) return;
    if (logoUrl.startsWith('data:') || logoUrl.startsWith('blob:')) return;
    if (logoUrl.includes('firebasestorage')) return;
    // Instant check first
    const cached = getCachedStorageUrl(logoUrl);
    if (cached) { setStorageUrl(cached); return; }
    // Background upload / RTDB lookup
    resolveImageAsync(logoUrl, storagePath, (url) => setStorageUrl(url));
  }, [logoUrl, storagePath]);

  const imageUrls = useMemo(() => {
    if (!logoUrl || logoUrl.includes('placeholder_player.png')) return [];
    const trimmed = logoUrl.trim();
    if (!trimmed) return [];

    // Firebase Storage hit — use directly
    if (storageUrl) return [storageUrl];
    if (trimmed.includes('firebasestorage')) return [trimmed];

    // Google Drive — try CDN-friendly thumbnail
    const fileId = extractDriveFileId(trimmed);
    if (fileId) {
      return [
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w128`,
        `https://drive.google.com/uc?export=view&id=${fileId}`,
      ];
    }

    return [trimmed];
  }, [logoUrl, storageUrl]);

  // Generate team initials for fallback
  const teamInitials = useMemo(() => {
    return teamName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [teamName]);

  const handleError = () => {
    if (currentUrlIndex < imageUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1);
    } else {
      setImageError(true);
    }
  };

  const currentUrl = imageError || imageUrls.length === 0
    ? undefined
    : imageUrls[currentUrlIndex];

  const containerClass = `${SIZE_CLASSES[size]} rounded-xl overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center ${className}`;

  // If no image is available, show team initials
  if (!currentUrl) {
    return (
      <div
        className={`${containerClass} bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xs`}
        title={teamName}
      >
        {teamInitials}
      </div>
    );
  }

  return (
    <div className={containerClass} title={teamName}>
      <img
        src={currentUrl}
        alt={`${teamName} logo`}
        className="w-full h-full object-contain p-1"
        onError={handleError}
        loading={currentUrl?.startsWith('data:') || currentUrl?.includes('firebasestorage') ? 'eager' : 'lazy'}
      />
    </div>
  );
};

export default TeamLogo;
