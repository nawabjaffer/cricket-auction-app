// ============================================================================
// SOLD ANIMATION - V3 Live Broadcast
// Premium sold/unsold animation with player details
// ============================================================================

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player, Team } from '../../types';
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
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

export default function SoldAnimation({ 
  type, 
  player, 
  team, 
  amount, 
  stampColor,
  onComplete,
  duration = 3000 
}: SoldAnimationProps) {
  const isSold = type === 'sold';
  const fallbackAvatar = player
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=0D1117&color=FFFFFF&size=256`
    : '';
  const imageSrc = player?.imageUrl?.trim() ? player.imageUrl : fallbackAvatar;

  // Auto-dismiss after duration
  useEffect(() => {
    if (onComplete) {
      const timer = setTimeout(onComplete, duration);
      return () => clearTimeout(timer);
    }
  }, [onComplete, duration]);

  return (
    <motion.div
      className="live-sold-animation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Background blur */}
      <div className="live-sold-animation__backdrop" />

      {/* Main content */}
      <motion.div
        className="live-sold-animation__content"
        initial={{ scale: 0.8, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: -50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {/* Stamp */}
        <motion.div
          className={`live-sold-animation__stamp ${isSold ? 'live-sold-animation__stamp--sold' : 'live-sold-animation__stamp--unsold'}`}
          initial={{ scale: 3, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
          style={{ color: stampColor }}
        >
          {isSold ? 'SOLD!' : 'UNSOLD'}
        </motion.div>

        {/* Player details card */}
        {player && (
          <motion.div
            className="live-sold-animation__card"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="live-sold-animation__player">
              <div className="live-sold-animation__avatar">
                <img
                  src={imageSrc}
                  alt={player.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = fallbackAvatar;
                  }}
                />
              </div>
              <div className="live-sold-animation__info">
                <h3 className="live-sold-animation__name">{player.name}</h3>
                <p className="live-sold-animation__role">{player.role}</p>
              </div>
            </div>

            {isSold && team && amount && (
              <motion.div
                className="live-sold-animation__deal"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="live-sold-animation__team">
                  {team.logoUrl && (
                    <img
                      src={team.logoUrl}
                      alt={team.name}
                      className="live-sold-animation__team-logo"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(team.name)}&background=1a1a2e&color=fff&size=64`;
                      }}
                    />
                  )}
                  <span className="live-sold-animation__team-name">{team.name}</span>
                </div>
                <div className="live-sold-animation__amount">
                  {formatCurrency(amount)}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
