// ============================================================================
// UNSOLD OVERLAY COMPONENT
// Apple-style reveal animation when a player goes unsold
// ============================================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoCloseCircle } from 'react-icons/io5';
import { useUnsoldPlayers } from '../../store';
import { extractDriveFileId } from '../../utils/driveImage';

// Pre-generated particles (deterministic, outside component)
const FALLING_PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: (i * 5) % 100,
  size: 3 + (i % 5),
  delay: (i % 10) * 0.1,
  duration: 4 + (i % 3),
}));

interface UnsoldOverlayProps {
  readonly isVisible: boolean;
  readonly onClose: () => void;
}

export function UnsoldOverlay({ isVisible, onClose }: Readonly<UnsoldOverlayProps>) {
  const unsoldPlayers = useUnsoldPlayers();
  const lastUnsoldPlayer = unsoldPlayers.at(-1);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Generate multiple URL formats to try for player image
  const imageUrls = useMemo(() => {
    if (!lastUnsoldPlayer?.imageUrl) return [];
    
    const urls: string[] = [];
    const fileId = extractDriveFileId(lastUnsoldPlayer.imageUrl);
    
    if (fileId) {
      // Try lh3 first (best CORS support)
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}=s800`);
      // Try thumbnail endpoint
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w800`);
      // Try direct export
      urls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
    } else {
      urls.push(lastUnsoldPlayer.imageUrl);
    }
    
    return urls;
  }, [lastUnsoldPlayer?.imageUrl]);

  // Generate fallback - use placeholder instead of avatar letters
  const getFallbackImage = useCallback(() => {
    return '/placeholder_player.png';
  }, []);

  // Reset state when player changes
  useEffect(() => {
    setCurrentUrlIndex(0);
    setImageError(false);
  }, [lastUnsoldPlayer?.id]);

  // Handle image error - try next URL
  const handleImageError = useCallback(() => {
    if (currentUrlIndex < imageUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1);
    } else {
      setImageError(true);
    }
  }, [currentUrlIndex, imageUrls.length]);

  if (!lastUnsoldPlayer) return null;

  const displayImageUrl = imageError || imageUrls.length === 0
    ? getFallbackImage() 
    : imageUrls[currentUrlIndex];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="unsold-overlay-apple"
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
            className="overlay-glow unsold-glow"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          />

          {/* Main content card */}
          <motion.div
            className="overlay-card-apple unsold-card overlay-card-transparent"
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
              className="status-badge unsold-badge"
              initial={{ scale: 0, rotate: 10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 15,
                delay: 0.3 
              }}
            >
              <span className="badge-text">UNSOLD</span>
            </motion.div>

            {/* Player image section - transparent background */}
            <motion.div 
              className="player-image-section unsold-image player-image-transparent"
              initial={{ clipPath: 'inset(100% 0 0 0)' }}
              animate={{ clipPath: 'inset(0% 0 0 0)' }}
              transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1], delay: 0.2 }}
            >
              <img
                src={displayImageUrl}
                alt={lastUnsoldPlayer.name}
                className="player-overlay-image player-image-no-bg grayscale"
                onError={handleImageError}
              />
              <div className="image-gradient-overlay unsold-gradient-transparent" />
              
              {/* X mark overlay */}
              <motion.div 
                className="unsold-x-mark"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.5 }}
              >
                <IoCloseCircle />
              </motion.div>
            </motion.div>

            {/* Player info */}
            <div className="player-info-section">
              <motion.h2 
                className="player-name-overlay unsold-name"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                {lastUnsoldPlayer.name}
              </motion.h2>

              <motion.div 
                className="player-role-overlay"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.4 }}
              >
                {lastUnsoldPlayer.role}
              </motion.div>

              {/* Base price display */}
              <motion.div 
                className="amount-display unsold-amount"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 300, 
                  damping: 20,
                  delay: 0.5 
                }}
              >
                <span className="amount-label">Base Price</span>
                <div className="amount-value strikethrough">
                  <span className="currency">₹</span>
                  <span className="amount-number">{lastUnsoldPlayer.basePrice.toFixed(1)}</span>
                  <span className="amount-unit">L</span>
                </div>
              </motion.div>

              {/* Status info */}
              <motion.div 
                className="status-info-overlay"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.65, duration: 0.4 }}
              >
                <span className="status-label">No bids received</span>
                <span className="status-detail">Available in Round 2</span>
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

          {/* Falling particles */}
          <FallingParticles />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Falling particles for unsold
function FallingParticles() {
  return (
    <div className="falling-particles">
      {FALLING_PARTICLES.map((particle) => (
        <motion.div
          key={particle.id}
          className="falling-particle"
          initial={{ 
            y: '-10vh', 
            x: `${particle.x}vw`, 
            opacity: 0,
          }}
          animate={{ 
            y: '110vh', 
            opacity: [0, 0.4, 0.4, 0],
            rotate: [0, 90, 180]
          }}
          transition={{ 
            duration: particle.duration, 
            delay: particle.delay,
            ease: 'linear'
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
