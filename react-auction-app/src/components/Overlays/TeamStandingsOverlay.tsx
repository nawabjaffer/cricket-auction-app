// ============================================================================
// TEAM STANDINGS OVERLAY - Full-screen team info table (triggered by 'g' key)
// Shows all team stats in a cinematic animated table format
// ============================================================================

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose } from 'react-icons/io5';
import type { Team, SoldPlayer } from '../../types';
import type { AdminSettings, SpecialCategory } from '../../services/auctionPersistence';
import './TeamStandingsOverlay.css';

interface TeamStandingsOverlayProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly teams: Team[];
  readonly soldPlayers: SoldPlayer[];
  readonly settings: AdminSettings | null;
}

export function TeamStandingsOverlay({ visible, onClose, teams, soldPlayers, settings }: TeamStandingsOverlayProps) {
  const categories: SpecialCategory[] = settings?.specialCategories ?? [];
  const budgetRules = settings?.budgetRules;

  const teamRows = useMemo(() => {
    return teams.map(team => {
      const teamPlayers = soldPlayers.filter(p => p.teamName === team.name);
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
                    <th className="th-team">Team</th>
                    <th>Total Purse</th>
                    <th>Spent</th>
                    <th>Remaining</th>
                    <th>Bought</th>
                    <th>To Buy</th>
                    <th>Max/Player</th>
                    {categories.map(cat => (
                      <th key={cat.id} style={{ color: cat.color }}>{cat.label}</th>
                    ))}
                  </motion.tr>
                </thead>
                <tbody>
                  {teamRows.map((row, index) => (
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
