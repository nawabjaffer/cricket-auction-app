// ============================================================================
// SOLD ANIMATION - V4 Cinematic Live Broadcast
// Full-screen cinematic sold/unsold overlay with staged reveals & particles
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player, Team } from '../../types';
import { formatRoleDisplay } from '../../utils/roleFormatter';
import { extractDriveFileId } from '../../utils/driveImage';
import { getCachedStorageUrl, resolveImageAsync } from '../../services/firebaseStorageService';
import './SoldAnimation.css';

interface SoldAnimationProps {
  type: 'sold' | 'unsold';
  player: Player | null;
  team?: Team | null;
  amount?: number;
  stampColor?: string;
  onComplete?: () => void;
  duration?: number;
}

const formatCurrency = (amount: number): string => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  if (safeAmount >= 10000000) return `₹${(safeAmount / 10000000).toFixed(2)} Cr`;
  if (safeAmount >= 100000) return `₹${(safeAmount / 100000).toFixed(2)} L`;
  return `₹${safeAmount.toLocaleString('en-IN')}`;
};

function getPlayerImageSrc(imageUrl: string | undefined): string {
  const raw = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!raw) return '';
  const fileId = extractDriveFileId(raw);
  if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=s512`;
  return raw;
}

/** Generate deterministic confetti-like particles */
function buildParticles(count: number, isSold: boolean) {
  const colors = isSold
    ? ['#E4BE75', '#ffd700', '#ff9500', '#fff5cc', '#ffe066']
    : ['#ef4444', '#f87171', '#dc2626', '#ff6b6b', '#991b1b'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 240 - 120,
    y: -(Math.random() * 350 + 80),
    rotate: Math.random() * 720 - 360,
    scale: Math.random() * 0.6 + 0.4,
    color: colors[i % colors.length],
    delay: Math.random() * 0.3,
  }));
}

export default function SoldAnimation({
  type,
  player,
  team,
  amount,
  stampColor,
  onComplete,
  duration = 3500,
}: SoldAnimationProps) {
  const isSold = type === 'sold';
  const safePlayerName = typeof player?.name === 'string' && player.name.trim() ? player.name.trim() : 'Unknown Player';
  const safeTeamName = typeof team?.name === 'string' && team.name.trim() ? team.name.trim() : '';
  const safePlayerRole = typeof player?.role === 'string' ? player.role : 'Player';

  const rawImageSrc = useMemo(() => getPlayerImageSrc(player?.imageUrl), [player?.imageUrl]);
  const [imageSrc, setImageSrc] = useState(() => {
    if (!player?.imageUrl) return '';
    return getCachedStorageUrl(player.imageUrl) || rawImageSrc;
  });
  useEffect(() => {
    if (!player?.imageUrl) { setImageSrc(''); return; }
    const cached = getCachedStorageUrl(player.imageUrl);
    if (cached) { setImageSrc(cached); return; }
    setImageSrc(rawImageSrc);
    const storagePath = `images/players/${safePlayerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    resolveImageAsync(player.imageUrl, storagePath, (url) => setImageSrc(url));
  }, [player?.imageUrl, rawImageSrc, safePlayerName]);
  const fallbackAvatar = useMemo(
    () =>
      player
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(safePlayerName)}&background=0D1117&color=FFFFFF&size=256`
        : '',
    [player, safePlayerName],
  );

  const particles = useMemo(() => buildParticles(isSold ? 28 : 14, isSold), [isSold]);

  // Auto-dismiss
  useEffect(() => {
    if (!onComplete) return;
    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  return (
    <motion.div
      className="sold-anim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Backdrop */}
      <div className={`sold-anim__backdrop ${isSold ? 'sold-anim__backdrop--sold' : 'sold-anim__backdrop--unsold'}`} />

      {/* Particle burst */}
      <div className="sold-anim__particles" aria-hidden>
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="sold-anim__particle"
            style={{ background: p.color }}
            initial={{ opacity: 0, y: 0, x: 0, scale: 0, rotate: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: p.y,
              x: p.x,
              scale: p.scale,
              rotate: p.rotate,
            }}
            transition={{ duration: 1.4, delay: 0.15 + p.delay, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* Center stage */}
      <div className="sold-anim__stage">
        {/* Ring pulse */}
        <motion.div
          className={`sold-anim__ring ${isSold ? 'sold-anim__ring--sold' : 'sold-anim__ring--unsold'}`}
          initial={{ scale: 0, opacity: 0.7 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.05, ease: 'easeOut' }}
        />

        {/* Stamp */}
        <motion.div
          className={`sold-anim__stamp ${isSold ? 'sold-anim__stamp--sold' : 'sold-anim__stamp--unsold'}`}
          initial={{ scale: 5, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 10, stiffness: 160, delay: 0.05 }}
          style={stampColor ? { color: stampColor } : undefined}
        >
          {isSold ? 'SOLD!' : 'UNSOLD'}
        </motion.div>

        {/* Player card */}
        <AnimatePresence>
          {player && (
            <motion.div
              className={`sold-anim__card ${isSold ? 'sold-anim__card--sold' : 'sold-anim__card--unsold'}`}
              initial={{ y: 60, opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 22, stiffness: 260, delay: 0.35 }}
            >
              <div className="sold-anim__player-row">
                <motion.div
                  className="sold-anim__avatar"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 16, stiffness: 200, delay: 0.45 }}
                >
                  <img
                    src={imageSrc || fallbackAvatar}
                    alt={safePlayerName}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (img.dataset.fb === '1') return;
                      img.dataset.fb = '1';
                      img.src = fallbackAvatar;
                    }}
                  />
                </motion.div>

                <div className="sold-anim__player-info">
                  <motion.h3
                    className="sold-anim__name"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                  >
                    {safePlayerName}
                  </motion.h3>
                  <motion.p
                    className="sold-anim__role"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.55, duration: 0.3 }}
                  >
                    {formatRoleDisplay(safePlayerRole)}
                  </motion.p>
                </div>
              </div>

              {/* Sold deal row */}
              {isSold && team && amount ? (
                <motion.div
                  className="sold-anim__deal"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65, duration: 0.35 }}
                >
                  <div className="sold-anim__team">
                    {team.logoUrl && (
                      <img
                        src={team.logoUrl}
                        alt={safeTeamName}
                        className="sold-anim__team-logo"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (img.dataset.fb === '1') return;
                          img.dataset.fb = '1';
                          img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeTeamName)}&background=1a1a2e&color=fff&size=64`;
                        }}
                      />
                    )}
                    <span className="sold-anim__team-name">{safeTeamName}</span>
                  </div>

                  <motion.div
                    className="sold-anim__amount"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 14, stiffness: 220, delay: 0.8 }}
                  >
                    {formatCurrency(amount)}
                  </motion.div>
                </motion.div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
