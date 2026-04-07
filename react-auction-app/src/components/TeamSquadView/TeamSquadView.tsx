// ============================================================================
// TEAM SQUAD VIEW COMPONENT
// Redesigned team view with captain display and player roster
// Layout: Left section (player names) | Right section (captain image + name)
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoGridOutline, IoChevronDownOutline } from 'react-icons/io5';
import type { Team, SoldPlayer } from '../../types';
import { PlayerImage } from '../PlayerImage/PlayerImage';
import './TeamSquadView.css';

type CaptainSourcePlayer = {
  readonly name: string;
  readonly imageUrl?: string;
  readonly role: string;
};

interface TeamSquadViewProps {
  readonly teamId: string;
  readonly teams: Team[];
  readonly soldPlayers: SoldPlayer[];
  readonly allPlayers: CaptainSourcePlayer[];
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
  const [activeTeamId, setActiveTeamId] = useState(teamId);
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const [teamLogoFailed, setTeamLogoFailed] = useState(false);
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);

  // Keep the selected team in sync with the opener, but allow in-screen switching
  useEffect(() => {
    setActiveTeamId(teamId);
  }, [teamId]);

  // Find the active team
  const activeTeam = useMemo(
    () => teams.find(t => t.id === activeTeamId),
    [teams, activeTeamId],
  );

  // Reset menu state when team changes
  useEffect(() => {
    setIsTeamMenuOpen(false);
    setTeamLogoFailed(false);
    setBrandLogoFailed(false);
  }, [activeTeamId]);

  // Get team players (sold to this team)
  const teamPlayers = useMemo(() => {
    if (!activeTeam) return [];
    const roleRank: Record<string, number> = {
      batsman: 0,
      'wicket-keeper': 1,
      'wicket keeper': 1,
      'wicket keeper batsman': 1,
      'all-rounder': 2,
      bowler: 3,
    };

    const normalizeRole = (role: string) => role.toLowerCase().trim();

    return soldPlayers
      .filter(p => p.teamId === activeTeam.id || p.teamName === activeTeam.name)
      .slice()
      .sort((left, right) => {
        const leftRank = roleRank[normalizeRole(left.role)] ?? 99;
        const rightRank = roleRank[normalizeRole(right.role)] ?? 99;

        if (leftRank !== rightRank) return leftRank - rightRank;

        return left.name.localeCompare(right.name);
      });
  }, [soldPlayers, activeTeam]);

  const playerPlaceholderImage = '/assets/squadPlaceholder.png';

  const teamLogoForDisplay = !teamLogoFailed && activeTeam?.logoUrl ? activeTeam.logoUrl : '';
  const brandLogoForDisplay = !brandLogoFailed && activeTeam?.brandLogoUrl ? activeTeam.brandLogoUrl : '';

  const displaySlots = useMemo(() => {
    if (!activeTeam) {
      return [] as Array<{ kind: 'player'; player: SoldPlayer } | { kind: 'empty'; key: string }>;
    }

    const targetSlots = Math.min(
      Math.max(teamPlayers.length, activeTeam.totalPlayerThreshold || teamPlayers.length),
      24,
    );

    const slots: Array<{ kind: 'player'; player: SoldPlayer } | { kind: 'empty'; key: string }> = teamPlayers.map(player => ({
      kind: 'player',
      player,
    }));

    for (let index = teamPlayers.length; index < targetSlots; index += 1) {
      slots.push({ kind: 'empty', key: `empty-${activeTeam.id}-${index}` });
    }

    return slots;
  }, [activeTeam, teamPlayers]);

  const captainData = useMemo(() => {
    if (!activeTeam?.captain) return null;

    const captain = allPlayers.find(
      (player) => player.name?.toLowerCase() === activeTeam.captain?.toLowerCase()
    );

    if (!captain) return null;

    return {
      name: captain.name,
      imageUrl: captain.imageUrl,
      role: captain.role,
    };
  }, [activeTeam, allPlayers]);

  const squadTargetCount = activeTeam?.totalPlayerThreshold || teamPlayers.length;
  const remainingSlots = Math.max(squadTargetCount - teamPlayers.length, 0);

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

  if (!activeTeam) {
    console.warn('[TeamSquadView] Team not found:', teamId);
    return null;
  }

  // Team colors with fallback
  const primaryColor = activeTeam.primaryColor || '#3b82f6';
  const secondaryColor = activeTeam.secondaryColor || '#06b6d4';

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

        {teamLogoForDisplay && (
          <div className="tsv-team-logo-bg" aria-hidden="true">
            <img
              src={teamLogoForDisplay}
              alt=""
              className="tsv-team-logo-bg-image"
            />
          </div>
        )}

        {/* Main Content Container - Centered */}
        <motion.div
          className="tsv-content"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tsv-left-section">
            <motion.div
              className="tsv-header-bar"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="tsv-header-logo-shell">
                {teamLogoForDisplay ? (
                  <img
                    src={teamLogoForDisplay}
                    alt={`${activeTeam.name} logo`}
                    className="tsv-header-team-logo"
                    loading="lazy"
                    onError={() => {
                      console.warn(`[TeamSquadView] Team logo failed to load for ${activeTeam.name}`);
                      setTeamLogoFailed(true);
                    }}
                  />
                ) : (
                  <div className="tsv-logo-placeholder">
                    <span className="tsv-logo-text">{activeTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>

              <div className="tsv-team-header">
                <h1 className="tsv-team-name">{activeTeam.name}</h1>
                <div className="tsv-team-underline" />
                <h2 className="tsv-squad-label">SQUAD</h2>
                <div className="tsv-team-details">
                  <p className="tsv-team-owner">Brand Owner: {activeTeam.ownerCompany || 'Not Available'}</p>
                  <div className="tsv-team-stats">
                    <span className="tsv-team-stat-chip">Total Slots: {squadTargetCount}</span>
                    <span className="tsv-team-stat-chip">Filled: {teamPlayers.length}</span>
                    <span className="tsv-team-stat-chip">Remaining: {remainingSlots}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Players Grid */}
            <motion.div
              className="tsv-players-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              {displaySlots.length > 0 ? (
                <div className="tsv-players-grid">
                  {displaySlots.map((slot, index) => {
                    let playerMetaText = 'Team Strength';
                    if (slot.kind === 'player') {
                      playerMetaText = slot.player.age ? `Age ${slot.player.age}` : 'Age N/A';
                    }

                    return (
                    <motion.div
                      key={slot.kind === 'player' ? `${teamId}-${slot.player.id}-${index}` : slot.key}
                      className="tsv-player-item"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.35 + index * 0.03 }}
                    >
                      <div className="tsv-player-card">
                        {teamLogoForDisplay && (
                          <img
                            src={teamLogoForDisplay}
                            alt=""
                            className="tsv-player-team-watermark"
                          />
                        )}
                        <PlayerImage
                          imageUrl={slot.kind === 'player' ? slot.player.imageUrl : playerPlaceholderImage}
                          playerName={slot.kind === 'player' ? slot.player.name : 'Placeholder player'}
                          size="full"
                          className="tsv-player-image"
                          fallbackSrc={playerPlaceholderImage}
                        />
                        <div className="tsv-player-overlay" />
                        <div className="tsv-player-footer">
                          <span className="tsv-player-role">{slot.kind === 'player' ? slot.player.role : 'Open Slot'}</span>
                          <span className="tsv-player-name">{slot.kind === 'player' ? slot.player.name : `Slot ${index + 1}`}</span>
                          <span className="tsv-player-meta">
                            {playerMetaText}
                            <span className="tsv-player-meta-divider" />
                            {slot.kind === 'player' ? `₹${slot.player.soldAmount.toFixed(2)}L` : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="tsv-empty-state">
                  <span className="tsv-empty-text">No players selected yet</span>
                </div>
              )}
            </motion.div>

            <motion.div
              className="tsv-brand-section"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              {brandLogoForDisplay && (
                <img
                  src={brandLogoForDisplay}
                  alt="Brand logo"
                  className="tsv-brand-logo"
                  loading="lazy"
                  onError={() => {
                    setBrandLogoFailed(true);
                  }}
                />
              )}
              <div className="tsv-brand-info">
                <p className="tsv-brand-company">{activeTeam.ownerCompany || 'Owner Company'}</p>
                <p className="tsv-brand-tagline">{activeTeam.brandTagline || 'Brand tagline goes here'}</p>
              </div>
            </motion.div>

          </div>

          <div className="tsv-right-section">
            <motion.div
              className="tsv-captain-panel"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 100 }}
            >
              <div className="tsv-captain-image-wrapper">
                <CaptainImage
                  captainData={captainData}
                  teamPlayers={teamPlayers}
                />
              </div>

              {captainData?.name && (
                <div className="tsv-captain-info">
                  <span className="tsv-captain-badge">CAPTAIN</span>
                  <h3 className="tsv-captain-name">{captainData.name}</h3>
                </div>
              )}

            </motion.div>
          </div>
        </motion.div>

        <motion.div
          className="tsv-team-fab"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="tsv-team-fab-button"
            aria-label="Switch team"
            aria-expanded={isTeamMenuOpen}
            onClick={() => setIsTeamMenuOpen(prev => !prev)}
          >
            <IoGridOutline className="tsv-team-fab-icon" />
            <IoChevronDownOutline className={`tsv-team-fab-caret ${isTeamMenuOpen ? 'open' : ''}`} />
          </button>

          <AnimatePresence>
            {isTeamMenuOpen && (
              <motion.div
                className="tsv-team-fab-menu"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.16 }}
              >
                {teams.map((teamOption) => {
                  const isActive = teamOption.id === activeTeam.id;

                  return (
                    <button
                      key={teamOption.id}
                      type="button"
                      className={`tsv-team-fab-option ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveTeamId(teamOption.id)}
                    >
                      <span className="tsv-team-fab-option-name">{teamOption.name}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
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


export default TeamSquadView;

interface CaptainImageProps {
  readonly captainData: { name: string; imageUrl: string | undefined; role: string } | null;
  readonly teamPlayers: SoldPlayer[];
}

function CaptainImage({
  captainData,
  teamPlayers,
}: CaptainImageProps) {
  if (captainData?.name) {
    return (
      <PlayerImage
        imageUrl={captainData.imageUrl}
        playerName={captainData.name}
        size="full"
        className="tsv-captain-image loaded"
        fallbackSrc="/placeholder_player.png"
      />
    );
  }

  if (teamPlayers[0]) {
    return (
      <PlayerImage
        imageUrl={teamPlayers[0].imageUrl}
        playerName={teamPlayers[0].name}
        size="full"
        className="tsv-captain-image loaded"
        fallbackSrc="/placeholder_player.png"
      />
    );
  }

  return (
    <div className="tsv-captain-placeholder">
      <span className="tsv-placeholder-icon">👤</span>
    </div>
  );
}
