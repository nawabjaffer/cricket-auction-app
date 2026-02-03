// ============================================================================
// PLAYER OVERLAY - V3 Live Broadcast
// Renders player details overlay for /live view
// ============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '../../types';
import { extractDriveFileId } from '../../utils/driveImage';

interface PlayerOverlayProps {
  player: Player;
}

const formatCurrency = (amount: number): string => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

const PLACEHOLDER_IMAGE = '/placeholder_player.png';
const MAX_RETRY_ATTEMPTS = 20;

export default function PlayerOverlay({ player }: PlayerOverlayProps) {
  const [attemptCount, setAttemptCount] = useState(0);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [usePlaceholder, setUsePlaceholder] = useState(false);

  // Generate multiple URL formats to try for Google Drive images
  const imageUrls = useMemo(() => {
    if (!player.imageUrl?.trim()) return [];
    
    const urls: string[] = [];
    const fileId = extractDriveFileId(player.imageUrl);
    
    if (fileId) {
      // Try multiple Google Drive URL formats
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}=s512`);
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w512`);
      urls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}`);
    } else {
      // Non-Drive URL, use as-is
      urls.push(player.imageUrl);
    }
    
    return urls;
  }, [player.imageUrl]);

  // Reset state when player changes
  useEffect(() => {
    setAttemptCount(0);
    setCurrentUrlIndex(0);
    setUsePlaceholder(false);
  }, [player.id]);

  const handleImageError = useCallback(() => {
    const newAttempt = attemptCount + 1;
    setAttemptCount(newAttempt);

    // If we've exhausted all URL variants
    if (currentUrlIndex < imageUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1);
    } else if (newAttempt >= MAX_RETRY_ATTEMPTS || imageUrls.length === 0) {
      // After max attempts or no URLs, use placeholder
      console.log(`[PlayerOverlay] Using placeholder after ${newAttempt} attempts for: ${player.name}`);
      setUsePlaceholder(true);
    } else {
      // Cycle back through URLs (sometimes network issues resolve)
      setCurrentUrlIndex(0);
    }
  }, [attemptCount, currentUrlIndex, imageUrls.length, player.name]);

  // Determine current image source
  const currentImageSrc = useMemo(() => {
    if (usePlaceholder || imageUrls.length === 0) {
      return PLACEHOLDER_IMAGE;
    }
    return imageUrls[currentUrlIndex];
  }, [usePlaceholder, imageUrls, currentUrlIndex]);

  return (
    <motion.div
      key={player.id}
      className="live-page__player-overlay"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      style={{ x: '-50%' }}
    >
      <div className="live-page__player-center">
        <div className="live-page__player-image live-page__player-image--center">
          <img
            src={currentImageSrc}
            alt={player.name}
            onError={handleImageError}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
            }}
          />
        </div>
        <h2 className="live-page__player-name">{player.name}</h2>
        <p className="live-page__player-role">{player.role}</p>
      </div>

      <div className="live-page__player-stats-bar">
        {player.matches && (
          <div className="live-page__player-stat-card">
            <div className="live-page__player-stat-value">{player.matches}</div>
            <div className="live-page__player-stat-label">Matches</div>
          </div>
        )}
        {player.runs && (
          <div className="live-page__player-stat-card">
            <div className="live-page__player-stat-value">{player.runs}</div>
            <div className="live-page__player-stat-label">Runs</div>
          </div>
        )}
        {player.wickets && (
          <div className="live-page__player-stat-card">
            <div className="live-page__player-stat-value">{player.wickets}</div>
            <div className="live-page__player-stat-label">Wickets</div>
          </div>
        )}
        <div className="live-page__player-stat-card live-page__player-stat-card--price">
          <div className="live-page__player-stat-value">{formatCurrency(player.basePrice)}</div>
          <div className="live-page__player-stat-label">Base Price</div>
        </div>
      </div>
    </motion.div>
  );
}
