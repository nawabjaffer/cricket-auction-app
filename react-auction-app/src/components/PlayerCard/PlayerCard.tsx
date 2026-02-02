// ============================================================================
// PLAYER CARD COMPONENT
// Displays player information with stats and image
// ============================================================================

import { motion } from 'framer-motion';
import { GiCricketBat, GiBaseballGlove } from 'react-icons/gi';
import { IoBaseball, IoStar } from 'react-icons/io5';
import type { Player } from '../../types';
import { activeConfig } from '../../config';

interface PlayerCardProps {
  player: Player;
  isSelected?: boolean;
  showBidInfo?: boolean;
  currentBid?: number;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function PlayerCard({ 
  player, 
  isSelected = false, 
  showBidInfo = false,
  currentBid,
  onClick,
  size = 'large',
}: PlayerCardProps) {
  const getRoleIcon = (role: Player['role']) => {
    switch (role) {
      case 'Batsman': return <GiCricketBat className="inline-block" />;
      case 'Bowler': return <IoBaseball className="inline-block" />;
      case 'All-Rounder': return <IoStar className="inline-block" />;
      case 'Wicket-Keeper': return <GiBaseballGlove className="inline-block" />;
      default: return <GiCricketBat className="inline-block" />;
    }
  };

  const getRoleBadgeColor = (role: Player['role']) => {
    switch (role) {
      case 'Batsman': return 'bg-blue-500';
      case 'Bowler': return 'bg-red-500';
      case 'All-Rounder': return 'bg-purple-500';
      case 'Wicket-Keeper': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const isUnderAge = player.age !== null && player.age < activeConfig.auction.rules.underAgeLimit;

  const sizeClasses = {
    small: 'w-48 h-64',
    medium: 'w-64 h-80',
    large: 'w-80 h-[28rem]',
  };

  const imageSizeClasses = {
    small: 'h-32',
    medium: 'h-40',
    large: 'h-52',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        bg-[var(--theme-surface)] 
        rounded-2xl 
        shadow-2xl 
        overflow-hidden
        ${isSelected ? 'ring-4 ring-[var(--theme-accent)]' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        transition-all duration-300
      `}
    >
      {/* Player Image Section */}
      <div className={`relative ${imageSizeClasses[size]} bg-gradient-to-b from-[var(--theme-gradient-start)] to-[var(--theme-gradient-end)]`}>
        <img
          src={player.imageUrl || '/assets/man.jpg'}
          alt={player.name}
          className="w-full h-full object-cover object-top"
          loading="lazy"
          onError={(e) => {
            console.error('[PlayerCard] Image failed, using placeholder for', player.name);
            (e.target as HTMLImageElement).src = '/assets/man.jpg';
          }}
        />
        
        {/* Player ID Badge */}
        <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono">
          #{player.id}
        </div>

        {/* Under-age Badge */}
        {isUnderAge && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
            U-{activeConfig.auction.rules.underAgeLimit}
          </div>
        )}

        {/* Role Badge */}
        <div className={`absolute bottom-2 left-2 ${getRoleBadgeColor(player.role)} text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1`}>
          <span>{getRoleIcon(player.role)}</span>
          <span>{player.role}</span>
        </div>
      </div>

      {/* Player Info Section */}
      <div className="p-4 space-y-3">
        {/* Name */}
        <h3 className="text-xl font-bold text-[var(--theme-text-primary)] truncate">
          {player.name}
        </h3>

        {/* Age */}
        {player.age && (
          <div className="text-sm text-[var(--theme-text-secondary)]">
            Age: <span className="font-semibold">{player.age} years</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <StatItem label="Matches" value={player.matches} />
          <StatItem label="Runs" value={player.runs} />
          <StatItem label="Wickets" value={player.wickets} />
          <StatItem 
            label="Best" 
            value={player.role === 'Bowler' ? player.bowlingBestFigures : player.battingBestFigures} 
          />
        </div>

        {/* Base Price / Current Bid */}
        <div className="pt-2 border-t border-[var(--theme-secondary)]/20">
          {showBidInfo && currentBid ? (
            <div className="text-center">
              <div className="text-xs text-[var(--theme-text-secondary)]">Current Bid</div>
              <div className="text-2xl font-bold text-[var(--theme-bid)]">
                ₹{currentBid.toFixed(2)}L
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-xs text-[var(--theme-text-secondary)]">Base Price</div>
              <div className="text-xl font-bold text-[var(--theme-accent)]">
                ₹{player.basePrice.toFixed(2)}L
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Stat item sub-component
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--theme-background)]/50 rounded px-2 py-1">
      <div className="text-xs text-[var(--theme-text-secondary)]">{label}</div>
      <div className="font-semibold text-[var(--theme-text-primary)]">{value}</div>
    </div>
  );
}
