// ============================================================================
// TEAM SELECTOR COMPONENT
// Grid of teams for bid selection
// ============================================================================

import type { Team } from '../../types';
import { useAuction } from '../../hooks';
import { AuctionRulesService } from '../../services';
import { useTeams } from '../../store';

interface TeamSelectorProps {
  readonly onTeamSelect?: (team: Team) => void;
  readonly showStats?: boolean;
}

export function TeamSelector({ onTeamSelect, showStats = true }: TeamSelectorProps) {
  const teams = useTeams();
  const { selectTeam, selectedTeam } = useAuction();
  const rulesService = new AuctionRulesService();
  const selectedTeamId = selectedTeam?.id ?? '';

  const handleTeamClick = (team: Team) => {
    selectTeam(team);
    onTeamSelect?.(team);
  };

  const handleTeamChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const team = teams.find(entry => entry.id === event.target.value);
    if (team) {
      handleTeamClick(team);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur-xl">
        <label htmlFor="team-selector-dropdown" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
          Team
        </label>
        <select
          id="team-selector-dropdown"
          value={selectedTeamId}
          onChange={handleTeamChange}
          className="w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/25"
        >
          <option value="" disabled className="text-black">
            Select a team
          </option>
          {teams.map(team => (
            <option key={team.id} value={team.id} className="text-black">
              {team.name}
            </option>
          ))}
        </select>

        {selectedTeam && showStats && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/70">
            <CompactStat label="Purse" value={`₹${selectedTeam.remainingPurse.toFixed(2)}L`} />
            <CompactStat label="Players" value={`${selectedTeam.playersBought}/${selectedTeam.totalPlayerThreshold}`} />
            <CompactStat label="Max Bid" value={`₹${rulesService.calculateMaxBid(selectedTeam).toFixed(2)}L`} />
            <CompactStat label="Captain" value={selectedTeam.captain || '—'} />
          </div>
        )}
      </div>
    </div>
  );
}

function CompactStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/5 px-2 py-2 backdrop-blur-sm">
      <div className="text-[9px] uppercase tracking-[0.25em] text-white/45">{label}</div>
      <div className="mt-1 truncate font-semibold text-white">{value}</div>
    </div>
  );
}
