// ============================================================================
// PLAYER OVERLAY - V3 Live Broadcast
// Renders player details overlay for /live view
// Role-based stats with configurable display
// ============================================================================

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '../../types';
import { extractDriveFileId } from '../../utils/driveImage';
import { getCachedStorageUrl, resolveImageAsync } from '../../services/firebaseStorageService';
import { getRoleBadgeColor, getRoleCategory } from '../../utils/roleFormatter';
import { getRoleBasedStats } from '../../utils/playerStats';

interface PlayerOverlayProps {
  player: Player;
  maxStats?: number;
}

const PLACEHOLDER_IMAGE = '/placeholder_player.png';
const MAX_RETRY_ATTEMPTS = 8;
const MAX_IMAGE_URL_LENGTH = 2048;

function sanitizeImageUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_URL_LENGTH) return '';

  const lowered = trimmed.toLowerCase();
  // Data/blob/file URLs can be very memory-heavy or unstable in live rotation.
  if (lowered.startsWith('data:') || lowered.startsWith('blob:') || lowered.startsWith('file:')) {
    return '';
  }

  return trimmed;
}

/**
 * Split a raw role string into { coreRole, details }.
 * "WK-Batsman · Right-Hand Bat" → { coreRole: "WK-Batsman", details: "Right-Hand Bat" }
 * "Bowler · Right-Arm Fast"     → { coreRole: "Bowler", details: "Right-Arm Fast" }
 * "All-Rounder · Right-Hand Bat · Right-Arm Fast" → { coreRole: "All-Rounder", details: "Right-Hand Bat · Right-Arm Fast" }
 */
function splitRoleDisplay(rawRole: string | undefined | null): { coreRole: string; details: string } {
  if (!rawRole || typeof rawRole !== 'string') return { coreRole: 'Player', details: '' };

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
  const attemptCountRef = useRef(0);
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [usePlaceholder, setUsePlaceholder] = useState(false);
  const [resolvedStorageUrl, setResolvedStorageUrl] = useState('');

  const safePlayer = useMemo(() => {
    const safeId = player?.id ? String(player.id) : 'unknown-player';
    const safeName = typeof player?.name === 'string' && player.name.trim() ? player.name.trim() : 'Unknown Player';
    const safeImageUrl = sanitizeImageUrl(player?.imageUrl);
    const safeRole = typeof player?.role === 'string' ? player.role : 'Player';
    const safeBasePrice = Number.isFinite(Number(player?.basePrice)) ? Number(player.basePrice) : 0;

    return {
      ...player,
      id: safeId,
      name: safeName,
      imageUrl: safeImageUrl,
      role: safeRole,
      basePrice: safeBasePrice,
    };
  }, [player]);

  const imageUrls = useMemo(() => {
    if (!safePlayer.imageUrl?.trim()) return [];
    const urls: string[] = [];
    const fileId = extractDriveFileId(safePlayer.imageUrl);
    if (fileId) {
      urls.push(`https://lh3.googleusercontent.com/d/${fileId}=s512`);
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w512`);
      urls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
    } else {
      urls.push(safePlayer.imageUrl);
    }
    return urls;
  }, [safePlayer.imageUrl]);

  useEffect(() => {
    attemptCountRef.current = 0;
    setCurrentUrlIndex(0);
    setUsePlaceholder(false);
  }, [safePlayer.id]);

  useEffect(() => {
    if (!safePlayer.imageUrl) {
      setResolvedStorageUrl('');
      return;
    }

    const cached = getCachedStorageUrl(safePlayer.imageUrl);
    if (cached) {
      setResolvedStorageUrl(cached);
      return;
    }

    const fileId = extractDriveFileId(safePlayer.imageUrl);
    if (fileId) setResolvedStorageUrl(`https://lh3.googleusercontent.com/d/${fileId}=s512`);
    else setResolvedStorageUrl(safePlayer.imageUrl);

    const storagePath = `images/players/${safePlayer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    resolveImageAsync(safePlayer.imageUrl, storagePath, (url) => setResolvedStorageUrl(url));
  }, [safePlayer.imageUrl, safePlayer.name]);

  const handleImageError = useCallback(() => {
    if (usePlaceholder) return;

    const nextAttempt = attemptCountRef.current + 1;
    attemptCountRef.current = nextAttempt;

    if (imageUrls.length === 0 || nextAttempt >= MAX_RETRY_ATTEMPTS) {
      setUsePlaceholder(true);
      return;
    }

    setCurrentUrlIndex((prevIndex) => {
      if (prevIndex < imageUrls.length - 1) return prevIndex + 1;
      return 0;
    });

    // Avoid unbounded memory growth on long sessions.
    if (attemptCountRef.current > MAX_RETRY_ATTEMPTS * 2) {
      attemptCountRef.current = MAX_RETRY_ATTEMPTS;
    }
  }, [imageUrls.length, usePlaceholder]);

  const currentImageSrc = useMemo(() => {
    if (usePlaceholder || imageUrls.length === 0) return PLACEHOLDER_IMAGE;
    if (resolvedStorageUrl) return resolvedStorageUrl;
    return imageUrls[currentUrlIndex];
  }, [usePlaceholder, imageUrls, currentUrlIndex, resolvedStorageUrl]);

  // Role-based stats
  const roleStats = useMemo(() => getRoleBasedStats(safePlayer, maxStats), [safePlayer, maxStats]);
  const { coreRole, details: roleDetails } = useMemo(() => splitRoleDisplay(safePlayer.role), [safePlayer.role]);
  const roleCat = useMemo(() => getRoleCategory(safePlayer.role), [safePlayer.role]);
  // For bowlers, show bowling style inline with role; for others, show hand on separate line
  const isBowlerRole = roleCat === 'Bowler';
  const displayRole = isBowlerRole && roleDetails ? `${coreRole} · ${roleDetails}` : coreRole;
  const displayDetails = isBowlerRole ? '' : roleDetails;

  return (
    <motion.div
      key={safePlayer.id}
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
            alt={safePlayer.name}
            onError={handleImageError}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          />
        </div>
        <h2 className="live-page__player-name">{safePlayer.name}</h2>
        <p className="live-page__player-role" style={{ color: getRoleBadgeColor(safePlayer.role) }}>
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
          <div className="live-page__player-stat-value">₹{safePlayer.basePrice}L</div>
          <div className="live-page__player-stat-label">Base Price</div>
        </div>
      </div>
    </motion.div>
  );
}
