// ============================================================================
// SOLD OVERLAY COMPONENT
// Apple-style reveal animation when a player is sold
// ============================================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoldPlayers } from '../../store';
import { extractDriveFileId } from '../../utils/driveImage';

// Pre-generated particles (deterministic, outside component)
const CELEBRATION_PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: (i * 3.33) % 100,
  size: 4 + (i % 8),
  delay: (i % 10) * 0.08,
  duration: 3 + (i % 3),
}));

interface SoldOverlayProps {
  readonly isVisible: boolean;
  readonly onClose: () => void;
}

export function SoldOverlay({ isVisible, onClose }: Readonly<SoldOverlayProps>) {
  const soldPlayers = useSoldPlayers();
  const lastSoldPlayer = soldPlayers.at(-1);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Get image URL from last sold player
  const playerImageUrl = lastSoldPlayer?.imageUrl ?? '';

  // Generate multiple URL formats to try for player image
  const imageUrls = useMemo(() => {
    if (!playerImageUrl) return [];
    
    const urls: string[] = [];
    const fileId = extractDriveFileId(playerImageUrl);
    
    if (fileId) {
      // Try lh3 first (best CORS support), then thumbnail, then direct export
      urls.push(
        `https://lh3.googleusercontent.com/d/${fileId}=s800`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
        `https://drive.google.com/uc?export=view&id=${fileId}`
      );
    } else {
      urls.push(playerImageUrl);
    }
    
    return urls;
  }, [playerImageUrl]);

  // Generate fallback - use placeholder instead of avatar letters
  const getFallbackImage = useCallback(() => {
    return '/placeholder_player.png';
  }, []);

  // Reset state when player changes
  useEffect(() => {
    setCurrentUrlIndex(0);
    setImageError(false);
  }, [lastSoldPlayer?.id]);

  // Handle image error - try next URL
  const handleImageError = useCallback(() => {
    if (currentUrlIndex < imageUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1);
    } else {
      setImageError(true);
    }
  }, [currentUrlIndex, imageUrls.length]);

  if (!lastSoldPlayer) return null;

  const displayImageUrl = imageError || imageUrls.length === 0
    ? getFallbackImage() 
    : imageUrls[currentUrlIndex];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="sold-overlay-apple"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        >
          {/* Background blur layers */}
          <motion.div 
            className="overlay-blur-layer"
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          />

          {/* Radial glow effect */}
          <motion.div 
            className="overlay-glow sold-glow"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          />

          {/* Main content card */}
          <motion.div
            className="overlay-card-apple overlay-card-transparent"
            initial={{ y: 100, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            transition={{ 
              duration: 0.6, 
              ease: [0.32, 0.72, 0, 1],
              delay: 0.1 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Status badge */}
            <motion.div 
              className="status-badge sold-badge"
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 15,
                delay: 0.3 
              }}
            >
              <span className="badge-text">SOLD</span>
              <motion.span 
                className="badge-glow"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>

            {/* Player image section - transparent background */}
            <motion.div 
              className="player-image-section player-image-transparent"
              initial={{ clipPath: 'inset(100% 0 0 0)' }}
              animate={{ clipPath: 'inset(0% 0 0 0)' }}
              transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1], delay: 0.2 }}
            >
              <img
                src={displayImageUrl}
                alt={lastSoldPlayer.name}
                className="player-overlay-image player-image-no-bg"
                onError={handleImageError}
              />
              <div className="image-gradient-overlay sold-gradient-transparent" />
            </motion.div>

            {/* Player info */}
            <div className="player-info-section">
              <motion.h2 
                className="player-name-overlay"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                {lastSoldPlayer.name}
              </motion.h2>

              <motion.div 
                className="player-role-overlay"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.4 }}
              >
                {lastSoldPlayer.role}
              </motion.div>

              {/* Amount display */}
              <motion.div 
                className="amount-display sold-amount"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 300, 
                  damping: 20,
                  delay: 0.5 
                }}
              >
                <span className="amount-label">Sold For</span>
                <div className="amount-value">
                  <span className="currency">₹</span>
                  <motion.span 
                    className="amount-number"
                    initial={{ y: 20 }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    {lastSoldPlayer.soldAmount.toFixed(1)}
                  </motion.span>
                  <span className="amount-unit">L</span>
                </div>
              </motion.div>

              {/* Team info */}
              <motion.div 
                className="team-info-overlay"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.65, duration: 0.4 }}
              >
                <span className="team-label">Bought by</span>
                <span className="team-name-overlay">{lastSoldPlayer.teamName}</span>
              </motion.div>
            </div>

            {/* Close hint */}
            <motion.div 
              className="close-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              Press <kbd>N</kbd> for next player
            </motion.div>
          </motion.div>

          {/* Celebration particles */}
          <CelebrationParticles />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Celebration particles for sold
function CelebrationParticles() {
  return (
    <div className="celebration-particles">
      {CELEBRATION_PARTICLES.map((particle) => (
        <motion.div
          key={particle.id}
          className="celebration-particle"
          initial={{ 
            y: '120vh', 
            x: `${particle.x}vw`, 
            opacity: 0,
            scale: 0 
          }}
          animate={{ 
            y: '-20vh', 
            opacity: [0, 1, 1, 0],
            scale: [0, 1, 1, 0.5],
            rotate: [0, 180, 360]
          }}
          transition={{ 
            duration: particle.duration, 
            delay: particle.delay,
            ease: 'easeOut'
          }}
          style={{ 
            width: particle.size, 
            height: particle.size,
          }}
        />
      ))}
    </div>
  );
}
