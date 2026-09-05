// ============================================================================
// TEAM SQUAD VIEW COMPONENT
// Redesigned team view with captain display and player roster
// Layout: Left section (player names) | Right section (captain image + name)
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoGridOutline, IoChevronDownOutline } from 'react-icons/io5';
import type { Team, SoldPlayer } from '../../types';
import type { SpecialCategory, TeamOwner } from '../../services/auctionPersistence';
import { PlayerImage } from '../PlayerImage/PlayerImage';
import { TeamLogo } from '../TeamLogo/TeamLogo';
import { extractDriveFileId } from '../../utils/driveImage';
import { useCurrencySuffix } from '../../store';
import { ImageLightbox } from '../ImageLightbox';
import './TeamSquadView.css';

type CaptainSourcePlayer = {
  readonly name: string;
  readonly imageUrl?: string;
  readonly role: string;
};

interface TitleSponsorInfo {
  readonly name: string;
  readonly logoUrl?: string;
}

interface TeamSquadViewProps {
  readonly teamId: string;
  readonly teams: Team[];
  readonly soldPlayers: SoldPlayer[];
  readonly allPlayers: CaptainSourcePlayer[];
  readonly onClose: () => void;
  readonly specialCategories?: SpecialCategory[];
  readonly teamOwners?: Record<string, TeamOwner[]>;
  readonly titleSponsor?: TitleSponsorInfo | null;
  readonly reduceThresholdByIconPlayers?: boolean;
  /** 'iconPlayers' shows icon players, 'owners' shows brand owner images */
  readonly squadViewMode?: 'iconPlayers' | 'owners';
  /** Visual style variant for squad UI */
  readonly squadTheme?: 'default' | 'premium' | 'royal';
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
  onClose,
  specialCategories = [],
  teamOwners = {},
  titleSponsor,
  reduceThresholdByIconPlayers = true,
  squadViewMode = 'iconPlayers',
  squadTheme = 'default',
}: TeamSquadViewProps) {
  const currencySuffix = useCurrencySuffix();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState(teamId);
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const [teamLogoFailed, setTeamLogoFailed] = useState(false);
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const [teamLogoUrlIndex, setTeamLogoUrlIndex] = useState(0);
  const [brandLogoUrlIndex, setBrandLogoUrlIndex] = useState(0);

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
    setTeamLogoUrlIndex(0);
    setBrandLogoUrlIndex(0);
  }, [activeTeamId]);

  const buildImageCandidates = (rawUrl?: string, allowDrive: boolean = true): string[] => {
    if (!rawUrl) return [];

    const trimmed = rawUrl.trim();
    if (!trimmed) return [];

    if (!allowDrive) {
      const lower = trimmed.toLowerCase();
      if (
        lower.includes('drive.google.com')
        || lower.includes('docs.google.com')
        || lower.includes('googleusercontent.com')
      ) {
        return [];
      }

      return [trimmed];
    }

    const fileId = extractDriveFileId(trimmed);
    if (!fileId) return [trimmed];

    return [
      `https://lh3.googleusercontent.com/d/${fileId}=w900`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w900`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      trimmed,
    ];
  };

  const teamLogoCandidates = useMemo(
    () => buildImageCandidates(activeTeam?.logoUrl),
    [activeTeam?.logoUrl],
  );

  const brandLogoCandidates = useMemo(
    () => buildImageCandidates(activeTeam?.brandLogoUrl),
    [activeTeam?.brandLogoUrl],
  );

  // Get team players (sold to this team)
  const teamPlayers = useMemo(() => {
    if (!activeTeam) return [];
    const roleRank: Record<string, number> = {
      // Cricket
      batsman: 0,
      'wicket-keeper': 1,
      'wicket keeper': 1,
      'wicket keeper batsman': 1,
      'all-rounder': 2,
      'batting all_rounder': 2,
      'batting all-rounder': 2,
      'bowling all_rounder': 2,
      'bowling all-rounder': 2,
      bowler: 3,
      // Kabaddi
      raider: 0,
      'left corner': 1,
      'right corner': 1,
      'left cover': 2,
      'right cover': 2,
      defender: 3,
      // Football
      forward: 0,
      striker: 0,
      fwd: 0,
      midfielder: 1,
      midfield: 1,
      mid: 1,
      defense: 2,
      goalkeeper: 3,
      gk: 3,
    };

    const normalizeRole = (role: string) => role.toLowerCase().trim();

    // Normalize name for fuzzy matching (strip dots, extra spaces, lowercase)
    const normalizeName = (name: string) => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

    // Build a name→imageUrl map from allPlayers for freshest image data
    const playerImageMap = new Map<string, string>();
    for (const p of allPlayers) {
      if (p.imageUrl) playerImageMap.set(normalizeName(p.name), p.imageUrl);
    }

    return soldPlayers
      .filter(p => p.teamId === activeTeam.id || p.teamName === activeTeam.name)
      .map(p => {
        // Use freshest image from allPlayers if available (fuzzy name match)
        const freshImage = playerImageMap.get(normalizeName(p.name));
        if (freshImage && freshImage !== p.imageUrl) {
          return { ...p, imageUrl: freshImage };
        }
        return p;
      })
      .slice()
      .sort((left, right) => {
        const leftRank = roleRank[normalizeRole(left.role)] ?? 99;
        const rightRank = roleRank[normalizeRole(right.role)] ?? 99;

        if (leftRank !== rightRank) return leftRank - rightRank;

        return left.name.localeCompare(right.name);
      });
  }, [soldPlayers, activeTeam, allPlayers]);

  // Eagerly preload all player images into browser cache for instant display
  useEffect(() => {
    for (const player of teamPlayers) {
      if (player.imageUrl) {
        const img = new Image();
        img.src = player.imageUrl;
      }
    }
  }, [teamPlayers]);

  const playerPlaceholderImage = '/assets/squadPlaceholder.png';

  const teamLogoForDisplay = teamLogoFailed
    ? ''
    : (teamLogoCandidates[teamLogoUrlIndex] || '');

  const brandLogoForDisplay = brandLogoFailed
    ? ''
    : (brandLogoCandidates[brandLogoUrlIndex] || '');

  // Iconic players that are NOT already in soldPlayers (pre-allocated, separate from auction)
  const iconicSlotsData = useMemo(() => {
    if (!activeTeam) return [];
    const iconicNames = activeTeam.iconicPlayers?.length
      ? activeTeam.iconicPlayers
      : activeTeam.captain ? [activeTeam.captain] : [];

    const normalizeName = (name: string) => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const existingNames = new Set(teamPlayers.map(p => normalizeName(p.name)));

    return iconicNames.map(iconicName => {
      const alreadyInTeam = existingNames.has(normalizeName(iconicName));
      const fromAll = allPlayers.find(p => normalizeName(p.name) === normalizeName(iconicName));
      const fromSold = teamPlayers.find(p => normalizeName(p.name) === normalizeName(iconicName));
      return {
        name: fromAll?.name || fromSold?.name || iconicName,
        imageUrl: fromAll?.imageUrl || fromSold?.imageUrl || '',
        role: fromAll?.role || fromSold?.role || 'Icon Player',
        alreadyInTeam,
      };
    });
  }, [activeTeam, teamPlayers, allPlayers]);

  const displaySlots = useMemo(() => {
    if (!activeTeam) {
      return [] as Array<{ kind: 'player'; player: SoldPlayer } | { kind: 'empty'; key: string }>;
    }

    // Threshold for auction slots only (iconic players shown separately)
    const iconicNotInAuction = reduceThresholdByIconPlayers
      ? iconicSlotsData.filter(p => !p.alreadyInTeam).length
      : 0;
    const effectiveThreshold = Math.max(
      (activeTeam.totalPlayerThreshold || teamPlayers.length) - iconicNotInAuction,
      teamPlayers.length,
    );

    const targetSlots = Math.min(
      Math.max(teamPlayers.length, effectiveThreshold),
      24,
    );

    const slots: Array<{ kind: 'player'; player: SoldPlayer } | { kind: 'empty'; key: string }> = teamPlayers.map(player => ({
      kind: 'player',
      player,
    }));

    // Fill remaining empty slots
    for (let index = slots.length; index < targetSlots; index += 1) {
      slots.push({ kind: 'empty', key: `empty-${activeTeam.id}-${index}` });
    }

    return slots;
  }, [activeTeam, teamPlayers, iconicSlotsData, reduceThresholdByIconPlayers]);

  const captainData = useMemo(() => {
    // Support multiple iconic players
    const iconicNames = activeTeam?.iconicPlayers?.length
      ? activeTeam.iconicPlayers
      : activeTeam?.captain ? [activeTeam.captain] : [];

    if (iconicNames.length === 0) return null;

    const resolve = (captainName: string) => {
      const normCaptain = captainName.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
      const fuzzyMatch = (name: string) => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim() === normCaptain;

      const fromAll = allPlayers.find((player) => fuzzyMatch(player.name || ''));
      const fromSold = teamPlayers.find((player) => fuzzyMatch(player.name || ''));

      const imageUrl = fromAll?.imageUrl || fromSold?.imageUrl || '';
      const name = fromAll?.name || fromSold?.name || captainName;
      const role = fromAll?.role || fromSold?.role || '';
      return { name, imageUrl, role };
    };

    // Return first iconic player data for the main display
    const primary = resolve(iconicNames[0]);
    console.log('[TSV Captain]', activeTeam?.name, '→ captain:', iconicNames[0],
      '| finalUrl:', primary.imageUrl ? primary.imageUrl.slice(0, 60) + '...' : '(empty)');
    return primary;
  }, [activeTeam, allPlayers, teamPlayers]);

  // All iconic players data
  const allIconicData = useMemo(() => {
    const iconicNames = activeTeam?.iconicPlayers?.length
      ? activeTeam.iconicPlayers
      : activeTeam?.captain ? [activeTeam.captain] : [];

    return iconicNames.map(captainName => {
      const normCaptain = captainName.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
      const fuzzyMatch = (name: string) => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim() === normCaptain;
      const fromAll = allPlayers.find((player) => fuzzyMatch(player.name || ''));
      const fromSold = teamPlayers.find((player) => fuzzyMatch(player.name || ''));
      return {
        name: fromAll?.name || fromSold?.name || captainName,
        imageUrl: fromAll?.imageUrl || fromSold?.imageUrl || '',
        role: fromAll?.role || fromSold?.role || '',
      };
    });
  }, [activeTeam, allPlayers, teamPlayers]);

  const iconicCount = reduceThresholdByIconPlayers
    ? (activeTeam?.iconicPlayers?.length || (activeTeam?.captain ? 1 : 0))
    : 0;
  const squadTargetCount = Math.max(
    (activeTeam?.totalPlayerThreshold || teamPlayers.length) - iconicCount,
    teamPlayers.length,
  );
  const remainingSlots = Math.max(squadTargetCount - teamPlayers.length, 0);

  // Derive spent and remaining from sold players for this team. This is the
  // single source of truth — it stays in sync even if team.remainingPurse drifts
  // because of broadcast lag or a mid-auction admin edit.
  const spentBudget = useMemo(
    () => teamPlayers.reduce((sum, p) => sum + (p.soldAmount || 0), 0),
    [teamPlayers],
  );
  const totalBudget = Math.max(activeTeam?.allocatedAmount || 0, spentBudget);
  const remainingBudget = Math.max(0, totalBudget - spentBudget);
  // Highest single-buy for this team (more meaningful than team.highestBid which
  // can lag when not broadcast).
  const highestBuy = useMemo(
    () => teamPlayers.reduce((max, p) => Math.max(max, p.soldAmount || 0), 0),
    [teamPlayers],
  );

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
        className={`team-squad-view team-squad-view--${squadTheme}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{

          //  background: `
          //   radial-gradient(circle at 18% 22%, ${primaryColor}2b 0%, transparent 42%),
          //   radial-gradient(circle at 82% 78%, ${secondaryColor}30 0%, transparent 44%),
          //   radial-gradient(circle at 52% 42%, var(--theme-accent, ${secondaryColor})26 0%, transparent 38%),
          //   linear-gradient(140deg, color-mix(in srgb, ${primaryColor} 32%, #060912) 0%, color-mix(in srgb, ${secondaryColor} 24%, #0b1120) 52%, color-mix(in srgb, var(--theme-accent, ${secondaryColor}) 18%, #111827) 100%)
          // `,
          background: `
            var(--theme-accent)
          `,
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
              onError={() => {
                if (teamLogoUrlIndex < teamLogoCandidates.length - 1) {
                  setTeamLogoUrlIndex((prev) => prev + 1);
                } else {
                  setTeamLogoFailed(true);
                }
              }}
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
                <TeamLogo
                  logoUrl={activeTeam.logoUrl}
                  teamName={activeTeam.name}
                  size="xl"
                  className="tsv-header-team-logo"
                />
              </div>

              <div className="tsv-team-header">
                <h1 className="tsv-team-name">{activeTeam.name}</h1>
                <div className="tsv-team-underline" />
                {/* <h2 className="tsv-squad-label">SQUAD</h2> */}
                <div className="tsv-team-details">
                  <p className="tsv-team-owner">Brand Owner: {activeTeam.ownerCompany || 'Not Available'}</p>
                  {(() => {
                    const owners = teamOwners[activeTeam.id];
                    return owners?.length ? (
                      <p className="tsv-team-owner" style={{ fontSize: '0.85em', opacity: 0.85 }}>
                        {owners.map(o => `${o.name}${o.designation ? ` (${o.designation})` : ''}`).join(' · ')}
                      </p>
                    ) : null;
                  })()}
                    {/* Title Sponsor Badge */}
            {titleSponsor?.logoUrl && (
              <motion.div
                className="tsv-title-sponsor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.45 }}
              >
                <span className="tsv-title-sponsor-label">Title Sponsor</span>
                <img
                  src={titleSponsor.logoUrl}
                  alt={titleSponsor.name}
                  className="tsv-title-sponsor-logo"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </motion.div>
            )}
                  <div className="tsv-team-stats">
                    <span className="tsv-team-stat-chip">Auction Slots: {squadTargetCount}</span>
                    <span className="tsv-team-stat-chip">Filled: {teamPlayers.length}</span>
                    <span className="tsv-team-stat-chip">Remaining: {remainingSlots}</span>
                    {iconicCount > 0 && (
                      <span className="tsv-team-stat-chip tsv-stat-iconic">Icon Players: {iconicCount}</span>
                    )}
                  </div>
                </div>
              </div>
              {iconicSlotsData.length > 0 && (
              <div className="tsv-iconic-section-grid">
                  {iconicSlotsData.map((iconic, idx) => (
                    <motion.div
                      key={`iconic-${iconic.name}-${idx}`}
                      className={`tsv-iconic-slot ${iconic.alreadyInTeam ? 'tsv-iconic-slot--in-auction' : ''}`}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.25, delay: 0.3 + idx * 0.08 }}
                    >
                      <div className="tsv-iconic-slot-img-wrap">
                        <PlayerImage
                          imageUrl={iconic.imageUrl}
                          playerName={iconic.name}
                          size="md"
                          className="tsv-iconic-slot-img"
                          fallbackSrc="/placeholder_player.png"
                        />
                      </div>
                      <div className="tsv-iconic-slot-info">
                        <span className="tsv-iconic-slot-name">{iconic.name}</span>
                        <span className="tsv-iconic-slot-role">{iconic.role}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Auction Players Grid */}
            <motion.div
              className="tsv-players-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              {displaySlots.length > 0 ? (
                <div className="tsv-players-grid">
                  {displaySlots.map((slot, index) => {
                    const isPlayer = slot.kind === 'player';
                    const playerMetaText = isPlayer
                      ? (slot.player.age ? `Age ${slot.player.age}` : 'Age N/A')
                      : 'Open Slot';
                    const slotKey = isPlayer
                      ? `${teamId}-${slot.player.id}-${index}`
                      : slot.key;
                    const slotImage = isPlayer
                      ? (slot.player.imageUrl || playerPlaceholderImage)
                      : playerPlaceholderImage;
                    const slotName = isPlayer ? slot.player.name : `Slot ${index + 1}`;
                    const slotRole = isPlayer ? slot.player.role : 'Open Slot';
                    const slotAmount = isPlayer ? `₹${slot.player.soldAmount}${currencySuffix}` : '—';

                    return (
                    <motion.div
                      key={slotKey}
                      className="tsv-player-item"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.25, delay: Math.min(0.3 + index * 0.015, 0.6) }}
                    >
                      <div className="tsv-player-card">
                        {teamLogoForDisplay && (
                          <img
                            src={teamLogoForDisplay}
                            alt=""
                            className="tsv-player-team-watermark"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <img
                          src={slotImage}
                          alt={slotName}
                          className="tsv-player-image"
                          loading="eager"
                          style={{ cursor: isPlayer && slot.player.imageUrl ? 'pointer' : undefined }}
                          onClick={(e) => {
                            if (isPlayer && slot.player.imageUrl) {
                              e.stopPropagation();
                              setLightboxSrc(slot.player.imageUrl);
                            }
                          }}
                          onError={(e) => { (e.target as HTMLImageElement).src = playerPlaceholderImage; }}
                        />
                        <div className="tsv-player-footer">
                          <span className="tsv-player-role">{slotRole}</span>
                          <span className="tsv-player-name">{slotName}</span>
                          <div className="tsv-player-meta-row">
                            <span className="tsv-player-meta">
                              {playerMetaText}
                            </span>
                            <span className="tsv-player-amount">
                              {slotAmount}
                            </span>
                          </div>
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
                    if (brandLogoUrlIndex < brandLogoCandidates.length - 1) {
                      setBrandLogoUrlIndex((prev) => prev + 1);
                    } else {
                      setBrandLogoFailed(true);
                    }
                  }}
                />
              )}
              <div className="tsv-brand-info">
                <p className="tsv-brand-company">{activeTeam.ownerCompany || 'Owner Company'}</p>
                <p className="tsv-brand-tagline">{activeTeam.brandTagline || 'Brand tagline goes here'}</p>
              </div>

              <motion.div
                className="tsv-team-stats-panel"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <h4 className="tsv-stats-heading">Team Stats
                <div className="tsv-stat-status">
                  {remainingSlots === 0 ? (
                    <span className="tsv-status-badge tsv-status-full">Squad Full</span>
                  ) : remainingSlots <= 3 ? (
                    <span className="tsv-status-badge tsv-status-warning">Nearly Full</span>
                  ) : (
                    <span className="tsv-status-badge tsv-status-open">Open Slots</span>
                  )}
                </div>
                </h4>
                <div className="tsv-stats-grid">
                  <div className="tsv-stat-item">
                    <span className="tsv-stat-value">{teamPlayers.length}</span>
                    <span className="tsv-stat-label">Players Filled</span>
                  </div>
                  <div className="tsv-stat-item">
                    <span className="tsv-stat-value">{remainingSlots}</span>
                    <span className="tsv-stat-label">Players Needed</span>
                  </div>
                  <div className="tsv-stat-item">
                    <span className="tsv-stat-value">₹{highestBuy.toFixed(1)}{currencySuffix}</span>
                    <span className="tsv-stat-label">Highest Bid</span>
                  </div>
                  <div className="tsv-stat-item">
                    <span className="tsv-stat-value">₹{remainingBudget.toFixed(1)}{currencySuffix}</span>
                    <span className="tsv-stat-label">Remaining Budget</span>
                  </div>
                  <div className="tsv-stat-item">
                    <span className="tsv-stat-value">₹{spentBudget.toFixed(1)}{currencySuffix}</span>
                    <span className="tsv-stat-label">Spent</span>
                  </div>
                  <div className="tsv-stat-item">
                    <span className="tsv-stat-value">₹{totalBudget.toFixed(1)}{currencySuffix}</span>
                    <span className="tsv-stat-label">Total Budget</span>
                  </div>
                  {specialCategories.length > 0 && (
                    <div className="tsv-stat-item">
                      <span className="tsv-stat-value">{activeTeam.underAgePlayers || 0}</span>
                      <span className="tsv-stat-label">Under-Age Players</span>
                    </div>
                  )}
                  {specialCategories.map(cat => {
                    const count = teamPlayers.filter(p => {
                      const age = typeof p.age === 'number' ? p.age : null;
                      if (age === null) return false;
                      if (cat.ageMin != null && age < cat.ageMin) return false;
                      if (cat.ageMax != null && age > cat.ageMax) return false;
                      return true;
                    }).length;
                    return (
                      <div key={cat.id} className="tsv-stat-item">
                        <span className="tsv-stat-value" style={{ color: cat.color }}>{count}</span>
                        <span className="tsv-stat-label">{cat.label}</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>

          </div>

          <div className="tsv-right-section">
            <motion.div
              className="tsv-captain-panel"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              {/* Show brand owners if available, otherwise show icon players */}
              {(() => {
                const owners = teamOwners[activeTeam.id];
                if (squadViewMode === 'owners' && owners?.length) {
                  return (
                    <div className="tsv-owners-panel">
                      <span className="tsv-captain-badge">BRAND OWNERS</span>
                      <div className={`tsv-owners-big-grid ${owners.length === 1 ? 'single' : ''}`}>
                        {owners.map((owner, i) => (
                          <div key={owner.id || i} className="tsv-owner-big-card">
                            <div className="tsv-owner-big-photo">
                              {owner.imageUrl ? (
                                <img src={owner.imageUrl} alt={owner.name} className="tsv-owner-big-img" />
                              ) : owner.brandImageUrl ? (
                                <img src={owner.brandImageUrl} alt={owner.name} className="tsv-owner-big-img" />
                              ) : (
                                <span className="tsv-owner-big-initials">{owner.name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <h3 className="tsv-owner-big-name">{owner.name}</h3>
                            {owner.designation && <span className="tsv-owner-big-role">{owner.designation}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                // Fallback: show icon players in right panel
                return (
                  <>
                    <div className="tsv-captain-image-wrapper">
                      <CaptainImage captainData={captainData} teamPlayers={teamPlayers} />
                    </div>
                    <div className="tsv-captain-info">
                      <span className="tsv-captain-badge">{allIconicData.length > 1 ? 'ICON PLAYERS' : 'ICON PLAYER'}</span>
                      {allIconicData.length > 1 ? (
                        <div className="tsv-iconic-list">
                          {allIconicData.map((p, i) => (
                            <div key={i} className="tsv-iconic-player-row">
                              <div className="tsv-iconic-avatar">
                                <PlayerImage
                                  imageUrl={p.imageUrl}
                                  playerName={p.name}
                                  size="sm"
                                  className="tsv-iconic-avatar-img"
                                  fallbackSrc="/placeholder_player.png"
                                />
                              </div>
                              <div className="tsv-iconic-details">
                                <h3 className="tsv-captain-name" style={i > 0 ? { fontSize: '0.85em', opacity: 0.85 } : undefined}>
                                  {p.name}
                                </h3>
                                {p.role && <span className="tsv-iconic-role">{p.role}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <h3 className="tsv-captain-name">
                          {captainData?.name || activeTeam.captain || 'No Icon player'}
                        </h3>
                      )}
                    </div>
                  </>
                );
              })()}
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

        {/* Player image lightbox */}
        <ImageLightbox
          src={lightboxSrc || ''}
          alt="Player"
          isOpen={!!lightboxSrc}
          onClose={() => setLightboxSrc(null)}
        />
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
