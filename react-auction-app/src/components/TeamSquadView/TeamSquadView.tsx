// ============================================================================
// TEAM SQUAD VIEW COMPONENT
// Redesigned team view with captain display and player roster
// Layout: Left section (player names) | Right section (captain image + name)
// ============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Team, SoldPlayer, Player } from '../../types';
import { extractDriveFileId } from '../../utils/driveImage';
import './TeamSquadView.css';

interface TeamSquadViewProps {
  readonly teamId: string;
  readonly teams: Team[];
  readonly soldPlayers: SoldPlayer[];
  readonly allPlayers: Player[];
  readonly onClose: () => void;
}

/**
 * TeamSquadView - Full-screen team squad display
 * 
 * Features:
 * - Left section: List of player names from auction
 * - Right section: Captain image and name (large, transparent background)
 * - Both sections horizontally centered with vertical padding
 * - Keyboard navigation support (ESC to close)
 */
export function TeamSquadView({ 
  teamId, 
  teams, 
  soldPlayers, 
  allPlayers, 
  onClose 
}: TeamSquadViewProps) {
  const [captainImageLoaded, setCaptainImageLoaded] = useState(false);
  const [captainImageError, setCaptainImageError] = useState(false);

  // Find the selected team
  const team = useMemo(() => teams.find(t => t.id === teamId), [teams, teamId]);

  // Get team players (sold to this team)
  const teamPlayers = useMemo(() => {
    if (!team) return [];
    return soldPlayers.filter(p => p.teamId === team.id || p.teamName === team.name);
  }, [soldPlayers, team]);

  // Find captain data
  const captainData = useMemo(() => {
    if (!team?.captain) return null;
    
    // Search in all players for captain
    const captain = allPlayers.find(
      p => p.name?.toLowerCase() === team.captain?.toLowerCase()
    );
    
    if (!captain) return null;

    // Transform Drive URL if needed
    let imageUrl = captain.imageUrl;
    if (imageUrl) {
      const fileId = extractDriveFileId(imageUrl);
      if (fileId) {
        imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }

    return {
      name: captain.name,
      imageUrl,
      role: captain.role,
    };
  }, [team, allPlayers]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Generate fallback avatar URL
  const getFallbackAvatar = useCallback((name: string) => {
    const initials = name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=transparent&color=ffffff&size=600&bold=true&format=svg`;
  }, []);

  if (!team) {
    console.warn('[TeamSquadView] Team not found:', teamId);
    return null;
  }

  // Team colors with fallback
  const primaryColor = team.primaryColor || '#3b82f6';
  const secondaryColor = team.secondaryColor || '#06b6d4';

  return (
    <AnimatePresence>
      <motion.div
        className="team-squad-view"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        }}
        onClick={onClose}
      >
        {/* Decorative Background Elements */}
        <div className="tsv-decorative-elements" aria-hidden="true">
          {/* Top Right Geometric Pattern */}
          <svg className="tsv-geo-pattern tsv-geo-top-right" viewBox="0 0 300 300" fill="none" stroke="currentColor">
            <polygon points="150,20 190,45 190,95 150,120 110,95 110,45" />
            <polygon points="210,70 250,95 250,145 210,170 170,145 170,95" />
            <polygon points="240,20 270,70 210,70" />
            <polygon points="150,150 180,200 120,200" />
          </svg>

          {/* Bottom Left Geometric Pattern */}
          <svg className="tsv-geo-pattern tsv-geo-bottom-left" viewBox="0 0 250 250" fill="none" stroke="currentColor">
            <polygon points="125,10 165,35 165,85 125,110 85,85 85,35" />
            <polygon points="185,60 225,85 225,135 185,160 145,135 145,85" />
            <polygon points="200,120 230,170 170,170" />
          </svg>

          {/* Ambient Light Effects */}
          <div className="tsv-ambient-light tsv-ambient-1" />
          <div className="tsv-ambient-light tsv-ambient-2" />
        </div>

        {/* Main Content Container - Centered */}
        <motion.div
          className="tsv-content"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* LEFT SECTION - Player Names */}
          <div className="tsv-left-section">
            {/* Team Header */}
            <motion.div 
              className="tsv-team-header"
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h1 className="tsv-team-name">{team.name}</h1>
              <div className="tsv-team-underline" />
              <h2 className="tsv-squad-label">SQUAD</h2>
            </motion.div>

            {/* Player Names List */}
            <motion.div 
              className="tsv-players-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              {teamPlayers.length > 0 ? (
                <div className="tsv-players-grid">
                  {teamPlayers.map((player, index) => (
                    <motion.div
                      key={player.id}
                      className="tsv-player-item"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.35 + index * 0.05 }}
                    >
                      <span className="tsv-player-name">{player.name}</span>
                      <div className="tsv-player-underline" />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="tsv-empty-state">
                  <span className="tsv-empty-text">No players selected yet</span>
                </div>
              )}
            </motion.div>

            {/* Team Stats Summary */}
            <motion.div 
              className="tsv-team-stats"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <div className="tsv-stat-item">
                <span className="tsv-stat-value">{team.playersBought}</span>
                <span className="tsv-stat-label">Players</span>
              </div>
              <div className="tsv-stat-divider" />
              <div className="tsv-stat-item">
                <span className="tsv-stat-value">₹{team.remainingPurse?.toFixed(1)}L</span>
                <span className="tsv-stat-label">Remaining</span>
              </div>
            </motion.div>
          </div>

          {/* RIGHT SECTION - Captain Image */}
          <div className="tsv-right-section">
            <motion.div
              className="tsv-captain-container"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 100 }}
            >
              {/* Captain Image */}
              <div className="tsv-captain-image-wrapper">
                <CaptainImage
                  captainData={captainData}
                  captainImageError={captainImageError}
                  captainImageLoaded={captainImageLoaded}
                  teamPlayers={teamPlayers}
                  onLoad={() => setCaptainImageLoaded(true)}
                  onError={() => {
                    console.warn('[TeamSquadView] Captain image failed to load');
                    setCaptainImageError(true);
                  }}
                  getFallbackAvatar={getFallbackAvatar}
                />

                {/* Loading Overlay */}
                {captainData?.imageUrl && !captainImageLoaded && !captainImageError && (
                  <div className="tsv-image-loading">
                    <div className="tsv-loading-spinner" />
                  </div>
                )}
              </div>

              {/* Captain Name */}
              {(captainData?.name || teamPlayers[0]?.name) && (
                <motion.div
                  className="tsv-captain-info"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                >
                  <span className="tsv-captain-badge">CAPTAIN</span>
                  <h3 className="tsv-captain-name">
                    {captainData?.name || teamPlayers[0]?.name}
                  </h3>
                </motion.div>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* Close Hint */}
        <motion.div
          className="tsv-close-hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          Press <kbd>ESC</kbd> to close
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helper component to render captain image without nested ternaries
interface CaptainImageProps {
  readonly captainData: { name: string; imageUrl: string | undefined; role: string } | null;
  readonly captainImageError: boolean;
  readonly captainImageLoaded: boolean;
  readonly teamPlayers: SoldPlayer[];
  readonly onLoad: () => void;
  readonly onError: () => void;
  readonly getFallbackAvatar: (name: string) => string;
}

function CaptainImage({
  captainData,
  captainImageError,
  captainImageLoaded,
  teamPlayers,
  onLoad,
  onError,
  getFallbackAvatar,
}: CaptainImageProps) {
  // Case 1: Captain has image URL and no error
  if (captainData?.imageUrl && !captainImageError) {
    return (
      <img
        src={captainData.imageUrl}
        alt={captainData.name || 'Captain'}
        className={`tsv-captain-image ${captainImageLoaded ? 'loaded' : 'loading'}`}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }

  // Case 2: Captain exists but image failed - show avatar
  if (captainData?.name) {
    return (
      <img
        src={getFallbackAvatar(captainData.name)}
        alt={captainData.name}
        className="tsv-captain-image tsv-captain-fallback loaded"
      />
    );
  }

  // Case 3: No captain but have team players - show first player
  if (teamPlayers[0]) {
    return (
      <img
        src={teamPlayers[0].imageUrl || getFallbackAvatar(teamPlayers[0].name)}
        alt={teamPlayers[0].name}
        className="tsv-captain-image loaded"
        onError={(e) => {
          (e.target as HTMLImageElement).src = getFallbackAvatar(teamPlayers[0].name);
        }}
      />
    );
  }

  // Case 4: No captain, no players - show placeholder
  return (
    <div className="tsv-captain-placeholder">
      <span className="tsv-placeholder-icon">👤</span>
    </div>
  );
}

export default TeamSquadView;
