// ============================================================================
// TEAM SELECTOR COMPONENT
// Grid of teams for bid selection
// ============================================================================

import { motion } from 'framer-motion';
import { IoRibbon } from 'react-icons/io5';
import type { Team } from '../../types';
import { useAuction } from '../../hooks';
import { AuctionRulesService } from '../../services';
import { useTeams } from '../../store';
import { TeamLogo } from '../TeamLogo';

interface TeamSelectorProps {
  onTeamSelect?: (team: Team) => void;
  showStats?: boolean;
}

export function TeamSelector({ onTeamSelect, showStats = true }: TeamSelectorProps) {
  const teams = useTeams();
  const { selectTeam, selectedTeam, currentPlayer, currentBid } = useAuction();

  const handleTeamClick = (team: Team) => {
    selectTeam(team);
    onTeamSelect?.(team);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {teams.map((team, index) => (
        <TeamCard
          key={team.name}
          team={team}
          index={index}
          isSelected={selectedTeam?.name === team.name}
          showStats={showStats}
          currentPlayer={currentPlayer}
          currentBid={currentBid}
          onClick={() => handleTeamClick(team)}
        />
      ))}
    </div>
  );
}

// Individual Team Card
interface TeamCardProps {
  team: Team;
  index: number;
  isSelected: boolean;
  showStats: boolean;
  currentPlayer: ReturnType<typeof useAuction>['currentPlayer'];
  currentBid: number;
  onClick: () => void;
}

function TeamCard({ 
  team, 
  index, 
  isSelected, 
  showStats, 
  currentPlayer, 
  currentBid,
  onClick 
}: TeamCardProps) {
  // Check if team can bid
  const rulesService = new AuctionRulesService();
  const playerBasePrice = currentPlayer?.basePrice || rulesService.minimumPlayerBasePrice;
  const playerAge = currentPlayer?.age || null;
  
  const validation = currentPlayer 
    ? rulesService.validateBid(team, currentBid, playerBasePrice, playerAge) 
    : { valid: true, severity: 'info' as const, message: '', ruleId: null };
  
  const maxBid = rulesService.calculateMaxBid(team);
  const canBid = validation.valid;
  const teamStatusValue = rulesService.getTeamStatus(team, currentBid, rulesService.minimumPlayerBasePrice);

  // Status indicators
  const isFull = team.remainingPlayers <= 0;
  const isLowBudget = team.remainingPurse < currentBid;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={canBid ? { scale: 1.02, y: -2 } : undefined}
      whileTap={canBid ? { scale: 0.98 } : undefined}
      onClick={canBid ? onClick : undefined}
      className={`
        relative p-4 rounded-xl transition-all duration-200
        ${isSelected 
          ? 'bg-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)] shadow-lg' 
          : 'bg-[var(--theme-surface)]'}
        ${canBid 
          ? 'cursor-pointer hover:shadow-md' 
          : 'opacity-50 cursor-not-allowed'}
        ${isFull ? 'border-2 border-red-400' : ''}
      `}
    >
      {/* Keyboard shortcut badge */}
      <div className={`
        absolute top-2 right-2 w-6 h-6 rounded-full 
        flex items-center justify-center text-xs font-bold
        ${isSelected 
          ? 'bg-white text-[var(--theme-accent)]' 
          : 'bg-[var(--theme-secondary)] text-white'}
      `}>
        {index + 1}
      </div>

      {/* Team Logo & Name */}
      <div className="flex items-center gap-3 mb-3">
        <TeamLogo logoUrl={team.logoUrl} teamName={team.name} size="lg" />
        <div>
          <h4 className={`font-bold truncate ${isSelected ? 'text-white' : 'text-[var(--theme-text-primary)]'}`}>
            {team.name}
          </h4>
          {team.captain && (
            <div className={`text-xs flex items-center gap-1 ${isSelected ? 'text-white/80' : 'text-[var(--theme-text-secondary)]'}`}>
              <IoRibbon className="text-yellow-500" /> {team.captain}
            </div>
          )}
        </div>
      </div>

      {/* Team Stats */}
      {showStats && (
        <div className="space-y-2 text-sm">
          {/* Purse */}
          <div className={`flex justify-between ${isSelected ? 'text-white/90' : 'text-[var(--theme-text-secondary)]'}`}>
            <span>Purse:</span>
            <span className={`font-semibold ${isLowBudget && !isSelected ? 'text-red-500' : ''}`}>
              ₹{team.remainingPurse.toFixed(2)}L
            </span>
          </div>

          {/* Players */}
          <div className={`flex justify-between ${isSelected ? 'text-white/90' : 'text-[var(--theme-text-secondary)]'}`}>
            <span>Players:</span>
            <span className={`font-semibold ${isFull && !isSelected ? 'text-red-500' : ''}`}>
              {team.playersBought}/{team.totalPlayerThreshold}
            </span>
          </div>

          {/* Max Bid */}
          <div className={`flex justify-between ${isSelected ? 'text-white/90' : 'text-[var(--theme-text-secondary)]'}`}>
            <span>Max Bid:</span>
            <span className="font-semibold">₹{maxBid.toFixed(2)}L</span>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            {isFull && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                Full
              </span>
            )}
            {teamStatusValue === 'danger' && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                Danger
              </span>
            )}
            {teamStatusValue === 'warning' && (
              <span className="px-2 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                Warning
              </span>
            )}
            {team.underAgePlayers > 0 && (
              <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                U-Age: {team.underAgePlayers}
              </span>
            )}
          </div>

          {/* Validation Errors */}
          {!canBid && validation.message && (
            <div className="mt-2 text-xs text-red-400">
              {validation.message}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
