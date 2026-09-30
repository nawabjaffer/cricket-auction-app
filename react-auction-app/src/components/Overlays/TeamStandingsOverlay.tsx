// ============================================================================
// TEAM STANDINGS OVERLAY - Full-screen team info table (triggered by 'g' key)
// Shows all team stats in a cinematic animated table format
// ============================================================================

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose } from 'react-icons/io5';
import { SortableColumnHeader, useSortableRows } from '../SortableTable';
import type { Team, SoldPlayer } from '../../types';
import type { AdminSettings, SpecialCategory } from '../../services/auctionPersistence';
import { belongsToTeam } from '../../utils/teamMembership';
import './TeamStandingsOverlay.css';

interface TeamStandingsOverlayProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly teams: Team[];
  readonly soldPlayers: SoldPlayer[];
  readonly settings: AdminSettings | null;
}

const EMPTY_SPECIAL_CATEGORIES: SpecialCategory[] = [];

export function TeamStandingsOverlay({ visible, onClose, teams, soldPlayers, settings }: TeamStandingsOverlayProps) {
  const categories: SpecialCategory[] = settings?.specialCategories ?? EMPTY_SPECIAL_CATEGORIES;
  const budgetRules = settings?.budgetRules;

  const teamRows = useMemo(() => {
    return teams.map(team => {
      const teamPlayers = soldPlayers.filter(player => belongsToTeam(player, team));
      const spent = teamPlayers.reduce((sum, p) => sum + p.soldAmount, 0);
      const totalPurse = team.allocatedAmount || budgetRules?.totalBudgetPerTeam || 100;
      const remaining = totalPurse - spent;
      const playersBought = teamPlayers.length;
      const playersToBuy = Math.max(0, (team.totalPlayerThreshold || 11) - playersBought);
      const basePrice = budgetRules?.reservedFundPerRemainingPlayer ?? 1;
      const maxForOne = playersToBuy > 0
        ? remaining - (playersToBuy * basePrice) + basePrice
        : remaining;

      // Count players per special category
      const categoryCounts: Record<string, number> = {};
      for (const cat of categories) {
        const count = teamPlayers.filter(p => {
          const age = typeof p.age === 'number' ? p.age : null;
          if (age === null) return false;
          if (cat.ageMin != null && age < cat.ageMin) return false;
          if (cat.ageMax != null && age > cat.ageMax) return false;
          return true;
        }).length;
        categoryCounts[cat.id] = count;
      }

      return {
        team,
        totalPurse,
        spent,
        remaining: Math.max(0, remaining),
        playersBought,
        playersToBuy,
        maxForOne: Math.max(0, maxForOne),
        categoryCounts,
      };
    });
  }, [teams, soldPlayers, categories, budgetRules]);

  type TeamStandingsSortColumn = 'team' | 'totalPurse' | 'spent' | 'remaining' | 'playersBought' | 'playersToBuy' | 'maxForOne' | `category:${string}`;
  const standingsTable = useSortableRows<typeof teamRows[number], TeamStandingsSortColumn>(teamRows, (row, column) => {
    switch (column) {
      case 'team': return row.team.name;
      case 'totalPurse': return row.totalPurse;
      case 'spent': return row.spent;
      case 'remaining': return row.remaining;
      case 'playersBought': return row.playersBought;
      case 'playersToBuy': return row.playersToBuy;
      case 'maxForOne': return row.maxForOne;
      default: return row.categoryCounts[column.slice('category:'.length)] || 0;
    }
  });

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="team-standings-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        >
          <motion.div
            className="team-standings-container"
            initial={{ scale: 0.85, y: 60, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            <button className="team-standings-close" onClick={onClose}>
              <IoClose />
            </button>

            <motion.h2
              className="team-standings-title"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              Team Standings
            </motion.h2>

            <div className="team-standings-table-wrap">
              <table className="team-standings-table">
                <thead>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <SortableColumnHeader column="team" label="Team" className="th-team" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    <SortableColumnHeader column="totalPurse" label="Total Purse" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    <SortableColumnHeader column="spent" label="Spent" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    <SortableColumnHeader column="remaining" label="Remaining" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    <SortableColumnHeader column="playersBought" label="Bought" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    <SortableColumnHeader column="playersToBuy" label="To Buy" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    <SortableColumnHeader column="maxForOne" label="Max/Player" sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    {categories.map(cat => (
                      <SortableColumnHeader key={cat.id} column={`category:${cat.id}`} label={cat.label} style={{ color: cat.color }} sortState={standingsTable.sortState} onSort={standingsTable.requestSort} />
                    ))}
                  </motion.tr>
                </thead>
                <tbody>
                  {standingsTable.sortedRows.map((row, index) => (
                    <motion.tr
                      key={row.team.id}
                      initial={{ opacity: 0, x: -40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + index * 0.08, type: 'spring', damping: 20 }}
                      className="team-standings-row"
                    >
                      <td className="td-team">
                        <div className="team-standings-team-cell">
                          {row.team.logoUrl && (
                            <img src={row.team.logoUrl} alt="" className="team-standings-logo" />
                          )}
                          <span className="team-standings-name">{row.team.name}</span>
                        </div>
                      </td>
                      <td className="td-number">₹{row.totalPurse.toFixed(1)}L</td>
                      <td className="td-number td-spent">₹{row.spent.toFixed(1)}L</td>
                      <td className="td-number td-remaining">₹{row.remaining.toFixed(1)}L</td>
                      <td className="td-number">{row.playersBought}</td>
                      <td className="td-number">{row.playersToBuy}</td>
                      <td className="td-number td-max">₹{row.maxForOne.toFixed(1)}L</td>
                      {categories.map(cat => (
                        <td key={cat.id} className="td-number td-category" style={{ color: cat.color }}>
                          {row.categoryCounts[cat.id] || 0}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
