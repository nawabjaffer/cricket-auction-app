// ============================================================================
// TEAM LOGO COMPONENT
// Handles Google Drive URLs with proper fallback
// ============================================================================

import React, { useState, useMemo } from 'react';
import { extractDriveFileId } from '../../utils/driveImage';

interface TeamLogoProps {
  logoUrl: string | undefined;
  teamName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

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

  // Generate multiple URL formats to try
  const imageUrls = useMemo(() => {
    if (!logoUrl || logoUrl.includes('placeholder_player.png')) return [];
    
    const urls: string[] = [];
    const fileId = extractDriveFileId(logoUrl);
    
    if (fileId) {
      // Try lh3 first (best CORS support)
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}=s${SIZE_MAP[size] * 2}`);
      // Try thumbnail endpoint
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w${SIZE_MAP[size] * 2}`);
      // Try direct export
      urls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
    } else {
      // Non-Drive URL, use as-is
      urls.push(logoUrl);
    }
    
    return urls;
  }, [logoUrl, size]);

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

  // If no image is available, show team initials
  if (!currentUrl) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs ${className}`}
        title={teamName}
      >
        {teamInitials}
      </div>
    );
  }

  return (
    <img
      src={currentUrl}
      alt={`${teamName} logo`}
      className={`${SIZE_CLASSES[size]} rounded-full object-cover bg-white/10 ${className}`}
      onError={handleError}
      loading="lazy"
    />
  );
};

export default TeamLogo;
