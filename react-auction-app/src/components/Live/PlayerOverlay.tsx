// ============================================================================
// PLAYER OVERLAY - V3 Live Broadcast
// Renders player details overlay for /live view
// Role-based stats with configurable display
// ============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '../../types';
import { extractDriveFileId } from '../../utils/driveImage';
import { getRoleBadgeColor, getRoleCategory } from '../../utils/roleFormatter';
import { getRoleBasedStats } from '../../utils/playerStats';

interface PlayerOverlayProps {
  player: Player;
  maxStats?: number;
}

const PLACEHOLDER_IMAGE = '/placeholder_player.png';
const MAX_RETRY_ATTEMPTS = 20;

/**
 * Split a raw role string into { coreRole, details }.
 * "WK-Batsman · Right-Hand Bat" → { coreRole: "WK-Batsman", details: "Right-Hand Bat" }
 * "Bowler · Right-Arm Fast"     → { coreRole: "Bowler", details: "Right-Arm Fast" }
 * "All-Rounder · Right-Hand Bat · Right-Arm Fast" → { coreRole: "All-Rounder", details: "Right-Hand Bat · Right-Arm Fast" }
 */
function splitRoleDisplay(rawRole: string): { coreRole: string; details: string } {
  if (!rawRole) return { coreRole: 'Player', details: '' };

  const input = rawRole.trim();

  // Extract hand abbreviation
  const handMap: Record<string, string> = { RHB: 'Right-Hand Bat', LHB: 'Left-Hand Bat' };
  let hand: string | null = null;
  const handMatch = /\(?(RHB|LHB)\)?/i.exec(input);
  if (handMatch) hand = handMap[handMatch[1].toUpperCase()] || null;

  let cleaned = input.replace(/\(?(RHB|LHB)\)?/gi, '').trim();
  cleaned = cleaned
    .replace(/All[\s-]*Rounder/gi, 'All-Rounder')
    .replace(/WK[\s-]*Batsman/gi, 'WK-Batsman')
    .replace(/Wicket[\s-]*Keep(?:er)?[\s-]*(?:Batsman)?/gi, 'WK-Batsman')
    .replace(/\s+/g, ' ')
    .trim();

  // Detect bowling style
  const bowlingPatterns: [RegExp, string][] = [
    [/right[\s-]*arm\s+fast/i, 'Right-Arm Fast'],
    [/left[\s-]*arm\s+fast/i, 'Left-Arm Fast'],
    [/right[\s-]*arm\s+medium/i, 'Right-Arm Medium'],
    [/left[\s-]*arm\s+medium/i, 'Left-Arm Medium'],
    [/right[\s-]*arm\s+(?:off[\s-]*)?spin/i, 'Right-Arm Spin'],
    [/left[\s-]*arm\s+(?:off[\s-]*)?spin/i, 'Left-Arm Spin'],
    [/right[\s-]*arm\s+leg[\s-]*spin/i, 'Right-Arm Leg-Spin'],
    [/left[\s-]*arm\s+leg[\s-]*spin/i, 'Left-Arm Leg-Spin'],
  ];

  let bowlingStyle: string | null = null;
  for (const [pattern, label] of bowlingPatterns) {
    if (pattern.test(cleaned)) { bowlingStyle = label; break; }
  }

  // Remove bowling tokens to get core role
  let coreRole = cleaned;
  for (const [pattern] of bowlingPatterns) coreRole = coreRole.replace(pattern, '').trim();
  coreRole = coreRole.replace(/Bowler/gi, '').replace(/[-·,]+$/, '').trim();

  if (!coreRole || coreRole.toLowerCase() === 'player') {
    if (bowlingStyle) coreRole = 'Bowler';
    else {
      const cat = getRoleCategory(input);
      coreRole = cat === 'Uncategorized' ? 'Player' : cat;
    }
  }

  // Build detail parts
  const detailParts: string[] = [];
  if (hand) detailParts.push(hand);
  if (bowlingStyle) detailParts.push(bowlingStyle);

  return { coreRole, details: detailParts.join(' · ') };
}

export default function PlayerOverlay({ player, maxStats = 6 }: PlayerOverlayProps) {
  const [attemptCount, setAttemptCount] = useState(0);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [usePlaceholder, setUsePlaceholder] = useState(false);

  const imageUrls = useMemo(() => {
    if (!player.imageUrl?.trim()) return [];
    const urls: string[] = [];
    const fileId = extractDriveFileId(player.imageUrl);
    if (fileId) {
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}=s512`);
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w512`);
      urls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}`);
    } else {
      urls.push(player.imageUrl);
    }
    return urls;
  }, [player.imageUrl]);

  useEffect(() => {
    setAttemptCount(0);
    setCurrentUrlIndex(0);
    setUsePlaceholder(false);
  }, [player.id]);

  const handleImageError = useCallback(() => {
    const newAttempt = attemptCount + 1;
    setAttemptCount(newAttempt);
    if (currentUrlIndex < imageUrls.length - 1) {
      setCurrentUrlIndex(prev => prev + 1);
    } else if (newAttempt >= MAX_RETRY_ATTEMPTS || imageUrls.length === 0) {
      setUsePlaceholder(true);
    } else {
      setCurrentUrlIndex(0);
    }
  }, [attemptCount, currentUrlIndex, imageUrls.length]);

  const currentImageSrc = useMemo(() => {
    if (usePlaceholder || imageUrls.length === 0) return PLACEHOLDER_IMAGE;
    return imageUrls[currentUrlIndex];
  }, [usePlaceholder, imageUrls, currentUrlIndex]);

  // Role-based stats
  const roleStats = useMemo(() => getRoleBasedStats(player, maxStats), [player, maxStats]);
  const { coreRole, details: roleDetails } = useMemo(() => splitRoleDisplay(player.role), [player.role]);
  const roleCat = useMemo(() => getRoleCategory(player.role), [player.role]);
  // For bowlers, show bowling style inline with role; for others, show hand on separate line
  const isBowlerRole = roleCat === 'Bowler';
  const displayRole = isBowlerRole && roleDetails ? `${coreRole} · ${roleDetails}` : coreRole;
  const displayDetails = isBowlerRole ? '' : roleDetails;

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
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          />
        </div>
        <h2 className="live-page__player-name">{player.name}</h2>
        <p className="live-page__player-role" style={{ color: getRoleBadgeColor(player.role) }}>
          {displayRole}
        </p>
        {displayDetails && (
          <p className="live-page__player-role-details">
            {displayDetails}
          </p>
        )}
      </div>

      <div className="live-page__player-stats-bar">
        {roleStats.map((stat) => (
          <div key={stat.label} className={`live-page__player-stat-card live-page__player-stat-card--${stat.category}`}>
            <div className="live-page__player-stat-value">{stat.value || '--'}</div>
            <div className="live-page__player-stat-label">{stat.label}</div>
          </div>
        ))}
        <div className="live-page__player-stat-card live-page__player-stat-card--price">
          <div className="live-page__player-stat-value">₹{player.basePrice}L</div>
          <div className="live-page__player-stat-label">Base Price</div>
        </div>
      </div>
    </motion.div>
  );
}
