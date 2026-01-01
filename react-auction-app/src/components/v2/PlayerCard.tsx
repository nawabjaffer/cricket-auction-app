// ============================================================================
// AUCTION APP V2 - PLAYER CARD COMPONENT
// Modern player display with animations and role-based styling
// ============================================================================

import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { GiCricketBat, GiBaseballGlove } from 'react-icons/gi';
import { IoBaseball, IoStar, IoPerson } from 'react-icons/io5';
import { Card, Avatar, AnimatedNumber } from './ui';
import type { Player, PlayerRole, SoldPlayer } from '../../types/v2';

// ============================================================================
// ROLE ICON COMPONENT
// ============================================================================

interface RoleIconProps {
  role: PlayerRole;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export const RoleIcon: React.FC<RoleIconProps> = ({ role, size = 'md', className }) => {
  const sizeClass = iconSizes[size];
  
  switch (role) {
    case 'Batsman':
      return <GiCricketBat className={clsx(sizeClass, 'text-yellow-400', className)} />;
    case 'Bowler':
      return <IoBaseball className={clsx(sizeClass, 'text-red-400', className)} />;
    case 'All-Rounder':
      return <IoStar className={clsx(sizeClass, 'text-purple-400', className)} />;
    case 'Wicket-Keeper':
    case 'Wicket Keeper Batsman':
      return <GiBaseballGlove className={clsx(sizeClass, 'text-green-400', className)} />;
    default:
      return <IoPerson className={clsx(sizeClass, 'text-gray-400', className)} />;
  }
};

// ============================================================================
// ROLE BADGE COMPONENT
// ============================================================================

interface RoleBadgeProps {
  role: PlayerRole;
  size?: 'sm' | 'md';
}

const roleColors: Record<PlayerRole, string> = {
  'Batsman': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Bowler': 'bg-red-500/20 text-red-400 border-red-500/30',
  'All-Rounder': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Wicket-Keeper': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Wicket Keeper Batsman': 'bg-green-500/20 text-green-400 border-green-500/30',
};

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'md' }) => {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full border',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      roleColors[role] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    )}>
      <RoleIcon role={role} size="sm" />
      <span className="font-medium">{role}</span>
    </span>
  );
};

// ============================================================================
// PLAYER STAT ROW COMPONENT
// ============================================================================

interface StatRowProps {
  label: string;
  value: string | number | null;
  highlight?: boolean;
}

export const StatRow: React.FC<StatRowProps> = ({ label, value, highlight }) => {
  return (
    <div className={clsx(
      'flex items-center justify-between py-2 border-b border-border/50 last:border-0',
      highlight && 'bg-accent/5 -mx-3 px-3 rounded-lg'
    )}>
      <span className="text-text-secondary text-sm">{label}</span>
      <span className={clsx(
        'font-semibold',
        highlight ? 'text-accent' : 'text-text-primary'
      )}>
        {value ?? '—'}
      </span>
    </div>
  );
};

// ============================================================================
// COMPACT PLAYER CARD
// ============================================================================

interface CompactPlayerCardProps {
  player: Player;
  onClick?: () => void;
  isSelected?: boolean;
}

export const CompactPlayerCard: React.FC<CompactPlayerCardProps> = ({
  player,
  onClick,
  isSelected,
}) => {
  return (
    <motion.div
      className={clsx(
        'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all',
        'border border-transparent hover:border-accent/30 hover:bg-accent/5',
        isSelected && 'border-accent bg-accent/10'
      )}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Avatar
        src={player.imageUrl}
        alt={player.name}
        fallback={player.name}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-text-primary truncate">{player.name}</h4>
        <div className="flex items-center gap-2">
          <RoleIcon role={player.role} size="sm" />
          <span className="text-sm text-text-secondary">{player.role}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm text-text-secondary">Base</div>
        <div className="font-bold text-accent">₹{player.basePrice}L</div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// FULL PLAYER CARD
// ============================================================================

interface PlayerCardProps {
  player: Player;
  showStats?: boolean;
  className?: string;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  showStats = true,
  className,
}) => {
  return (
    <Card variant="glass" className={clsx('overflow-hidden', className)}>
      {/* Header with Image */}
      <div className="relative h-48 bg-gradient-to-b from-accent/20 to-transparent">
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar
            src={player.imageUrl}
            alt={player.name}
            fallback={player.name}
            size="xl"
            className="ring-4 ring-accent/30"
          />
        </div>
        <div className="absolute top-3 right-3">
          <RoleBadge role={player.role} size="sm" />
        </div>
      </div>

      {/* Player Info */}
      <div className="p-4">
        <h3 className="text-xl font-bold text-text-primary mb-1">{player.name}</h3>
        <div className="flex items-center gap-2 text-sm text-text-secondary mb-4">
          {player.age && <span>{player.age} years</span>}
          {player.age && player.stats.matches && <span>•</span>}
          {player.stats.matches && <span>{player.stats.matches} matches</span>}
        </div>

        {/* Stats */}
        {showStats && (
          <div className="space-y-1">
            <StatRow label="Runs" value={player.stats.runs} />
            <StatRow label="Wickets" value={player.stats.wickets} />
            <StatRow label="Highest Score" value={player.stats.highestScore} />
            <StatRow label="Best Bowling" value={player.stats.bestBowling} />
            <StatRow label="Base Price" value={`₹${player.basePrice}L`} highlight />
          </div>
        )}
      </div>
    </Card>
  );
};

// ============================================================================
// SOLD PLAYER CARD
// ============================================================================

interface SoldPlayerCardProps {
  player: SoldPlayer;
  onClick?: () => void;
}

export const SoldPlayerCard: React.FC<SoldPlayerCardProps> = ({
  player,
  onClick,
}) => {
  return (
    <motion.div
      className="flex items-center gap-3 p-3 bg-surface rounded-xl cursor-pointer hover:bg-surface/80"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <Avatar
        src={player.imageUrl}
        alt={player.name}
        fallback={player.name}
        size="lg"
      />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-text-primary truncate">{player.name}</h4>
        <div className="flex items-center gap-2">
          <RoleIcon role={player.role} size="sm" />
          <span className="text-sm text-text-secondary">{player.role}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-bold text-green-400">
          <AnimatedNumber value={player.soldAmount} prefix="₹" suffix="L" decimals={1} />
        </div>
        <div className="text-xs text-text-muted">{player.teamName}</div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// PLAYER HERO DISPLAY (for main auction view)
// ============================================================================

interface PlayerHeroProps {
  player: Player;
  currentBid: number;
  biddingTeam?: string | null;
}

export const PlayerHero: React.FC<PlayerHeroProps> = ({
  player,
  currentBid,
  biddingTeam,
}) => {
  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Role Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <RoleBadge role={player.role} />
      </motion.div>

      {/* Player Name */}
      <motion.h1
        className="text-4xl md:text-5xl font-black text-text-primary mt-4 mb-2"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        {player.name}
      </motion.h1>

      {/* Current Bid */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="text-sm text-text-secondary uppercase tracking-wider mb-1">
          Current Bid
        </div>
        <div className="text-5xl md:text-6xl font-black text-accent">
          <AnimatedNumber value={currentBid} prefix="₹" suffix="L" decimals={2} />
        </div>
        {biddingTeam && (
          <motion.div
            className="text-lg text-text-secondary mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            by <span className="text-text-primary font-semibold">{biddingTeam}</span>
          </motion.div>
        )}
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="flex items-center justify-center gap-8 mt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {player.stats.matches && (
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{player.stats.matches}</div>
            <div className="text-xs text-text-muted uppercase">Matches</div>
          </div>
        )}
        {player.stats.runs && (
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{player.stats.runs}</div>
            <div className="text-xs text-text-muted uppercase">Runs</div>
          </div>
        )}
        {player.stats.wickets && (
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{player.stats.wickets}</div>
            <div className="text-xs text-text-muted uppercase">Wickets</div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
