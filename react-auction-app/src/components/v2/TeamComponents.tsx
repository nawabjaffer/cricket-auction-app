// ============================================================================
// AUCTION APP V2 - TEAM COMPONENTS
// Team display, selection, and stats components
// ============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Card, Badge, Progress, AnimatedNumber, Kbd } from './ui';
import { SoldPlayerCard } from './PlayerCard';
import type { Team, SoldPlayer } from '../../types/v2';

// ============================================================================
// TEAM CARD COMPONENT
// ============================================================================

interface TeamCardProps {
  team: Team;
  index: number;
  isSelected?: boolean;
  isEligible?: boolean;
  maxBid?: number;
  onClick?: () => void;
}

export const TeamCard: React.FC<TeamCardProps> = ({
  team,
  index,
  isSelected,
  isEligible = true,
  maxBid,
  onClick,
}) => {
  const budgetPercentage = (team.remainingBudget / team.config.totalBudget) * 100;
  const playerPercentage = (team.players.length / team.config.maxPlayers) * 100;

  return (
    <motion.div
      className={clsx(
        'relative p-4 rounded-xl border-2 cursor-pointer transition-all',
        isSelected
          ? 'border-accent bg-accent/10 shadow-lg shadow-accent/20'
          : isEligible
          ? 'border-border bg-surface/50 hover:border-accent/50 hover:bg-surface'
          : 'border-red-500/30 bg-red-500/5 opacity-60 cursor-not-allowed'
      )}
      onClick={isEligible ? onClick : undefined}
      whileHover={isEligible ? { scale: 1.02 } : {}}
      whileTap={isEligible ? { scale: 0.98 } : {}}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      {/* Keyboard shortcut indicator */}
      <div className="absolute -top-2 -left-2">
        <Kbd className="shadow-md">{index + 1}</Kbd>
      </div>

      {/* Team Header */}
      <div className="flex items-center gap-3 mb-4">
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt={team.name}
            className="w-10 h-10 rounded-lg object-contain bg-white/10 p-1"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: team.primaryColor }}
          >
            {team.shortName.slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-text-primary truncate">{team.name}</h3>
          <div className="text-sm text-text-secondary">{team.shortName}</div>
        </div>
      </div>

      {/* Budget Display */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-text-secondary">Budget</span>
            <span className="font-semibold text-text-primary">
              ₹<AnimatedNumber value={team.remainingBudget} decimals={1} />L
            </span>
          </div>
          <Progress
            value={team.remainingBudget}
            max={team.config.totalBudget}
            variant={budgetPercentage < 20 ? 'danger' : budgetPercentage < 40 ? 'warning' : 'success'}
            size="sm"
          />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-text-secondary">Players</span>
            <span className="font-semibold text-text-primary">
              {team.players.length}/{team.config.maxPlayers}
            </span>
          </div>
          <Progress
            value={team.players.length}
            max={team.config.maxPlayers}
            variant={playerPercentage >= 100 ? 'danger' : playerPercentage >= 80 ? 'warning' : 'default'}
            size="sm"
          />
        </div>
      </div>

      {/* Max Bid */}
      {maxBid !== undefined && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-xs text-text-muted">Max Bid</span>
            <span className={clsx(
              'font-bold',
              maxBid <= 0 ? 'text-red-400' : 'text-green-400'
            )}>
              ₹{maxBid.toFixed(1)}L
            </span>
          </div>
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-accent pointer-events-none"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          layoutId="team-selection"
        />
      )}

      {/* Not eligible indicator */}
      {!isEligible && (
        <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
          <Badge variant="danger">Cannot Bid</Badge>
        </div>
      )}
    </motion.div>
  );
};

// ============================================================================
// TEAM SELECTOR GRID
// ============================================================================

interface TeamSelectorProps {
  teams: Team[];
  selectedTeam: Team | null;
  eligibleTeams: Team[];
  getMaxBid: (team: Team) => number;
  onSelect: (team: Team) => void;
}

export const TeamSelector: React.FC<TeamSelectorProps> = ({
  teams,
  selectedTeam,
  eligibleTeams,
  getMaxBid,
  onSelect,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {teams.map((team, index) => (
        <TeamCard
          key={team.id}
          team={team}
          index={index}
          isSelected={selectedTeam?.id === team.id}
          isEligible={eligibleTeams.some((t) => t.id === team.id)}
          maxBid={getMaxBid(team)}
          onClick={() => onSelect(team)}
        />
      ))}
    </div>
  );
};

// ============================================================================
// TEAM PANEL (Full Team View with Players)
// ============================================================================

interface TeamPanelProps {
  team: Team;
  onClose: () => void;
}

export const TeamPanel: React.FC<TeamPanelProps> = ({ team, onClose }) => {
  const budgetPercentage = (team.remainingBudget / team.config.totalBudget) * 100;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-2xl max-h-[90vh] m-4 bg-surface rounded-3xl overflow-hidden shadow-2xl"
        initial={{ scale: 0.9, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 50 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-6"
          style={{
            background: `linear-gradient(135deg, ${team.primaryColor}40, ${team.secondaryColor}40)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {team.logoUrl ? (
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  className="w-16 h-16 rounded-xl object-contain bg-white/10 p-2"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-white"
                  style={{ backgroundColor: team.primaryColor }}
                >
                  {team.shortName.slice(0, 2)}
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-text-primary">{team.name}</h2>
                <div className="flex items-center gap-4 mt-1">
                  <Badge variant={budgetPercentage < 30 ? 'danger' : 'success'}>
                    ₹{team.remainingBudget.toFixed(1)}L remaining
                  </Badge>
                  <Badge>
                    {team.players.length}/{team.config.maxPlayers} players
                  </Badge>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Budget Bar */}
          <div className="mt-4">
            <Progress
              value={team.remainingBudget}
              max={team.config.totalBudget}
              variant={budgetPercentage < 20 ? 'danger' : budgetPercentage < 40 ? 'warning' : 'success'}
              size="lg"
            />
          </div>
        </div>

        {/* Players List */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Squad</h3>
          {team.players.length > 0 ? (
            <div className="space-y-2">
              {team.players.map((player) => (
                <SoldPlayerCard key={player.id} player={player} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-text-muted">
              <div className="text-4xl mb-2">🏏</div>
              <div>No players bought yet</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surface/50">
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Press <Kbd>ESC</Kbd> to close</span>
            <span>Total Spent: ₹{(team.config.totalBudget - team.remainingBudget).toFixed(1)}L</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ============================================================================
// TEAM TABS (for switching between teams)
// ============================================================================

interface TeamTabsProps {
  teams: Team[];
  selectedTeam: Team | null;
  onSelect: (team: Team) => void;
}

export const TeamTabs: React.FC<TeamTabsProps> = ({
  teams,
  selectedTeam,
  onSelect,
}) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {teams.map((team, index) => (
        <motion.button
          key={team.id}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all',
            selectedTeam?.id === team.id
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'bg-surface hover:bg-surface/80 text-text-secondary'
          )}
          onClick={() => onSelect(team)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="text-xs opacity-60">{index + 1}</span>
          <span className="font-medium">{team.shortName}</span>
          <Badge variant={team.players.length >= team.config.maxPlayers ? 'danger' : 'default'}>
            {team.players.length}
          </Badge>
        </motion.button>
      ))}
    </div>
  );
};

// ============================================================================
// TEAM BID OVERLAY (floating bid card)
// ============================================================================

interface TeamBidOverlayProps {
  team: Team;
  currentBid: number;
  maxBid: number;
}

export const TeamBidOverlay: React.FC<TeamBidOverlayProps> = ({
  team,
  currentBid,
  maxBid,
}) => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <Card variant="glass" className="p-6 text-center pointer-events-auto shadow-2xl">
        <div
          className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: team.primaryColor }}
        >
          {team.shortName.slice(0, 2)}
        </div>
        <h3 className="text-lg font-bold text-text-primary">{team.name}</h3>
        <div className="text-3xl font-black text-accent mt-2">
          ₹<AnimatedNumber value={currentBid} decimals={2} />L
        </div>
        <div className="text-sm text-text-secondary mt-2">
          Max: ₹{maxBid.toFixed(1)}L
        </div>
      </Card>
    </motion.div>
  );
};
