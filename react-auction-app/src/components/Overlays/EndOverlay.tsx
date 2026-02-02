// ============================================================================
// END OVERLAY COMPONENT
// Full-screen overlay when auction is complete
// ============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { useSoldPlayers, useUnsoldPlayers, useTeams, useCurrentRound, useMaxUnsoldRounds } from '../../store';
import { TeamLogo } from '../TeamLogo';

interface EndOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onStartRound2?: () => void;
  onStartNextRound?: () => void;
  onShowTeam?: (teamId: string) => void;
}

export function EndOverlay({ isVisible, onClose, onStartRound2, onStartNextRound, onShowTeam }: EndOverlayProps) {
  const soldPlayers = useSoldPlayers();
  const unsoldPlayers = useUnsoldPlayers();
  const teams = useTeams();
  const currentRound = useCurrentRound();
  const maxUnsoldRounds = useMaxUnsoldRounds();
  const maxRound = 1 + maxUnsoldRounds;

  // Calculate summary stats
  const totalSold = soldPlayers.length;
  const totalUnsold = unsoldPlayers.length;
  const totalAmount = soldPlayers.reduce((sum, p) => sum + p.soldAmount, 0);
  const highestSale = soldPlayers.length > 0 
    ? soldPlayers.reduce((max, p) => p.soldAmount > max.soldAmount ? p : max, soldPlayers[0])
    : null;

  // Team rankings by amount spent
  const teamRankings = [...teams].sort((a, b) => 
    (b.allocatedAmount - b.remainingPurse) - (a.allocatedAmount - a.remainingPurse)
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto py-8"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative max-w-4xl w-full mx-4 bg-[var(--theme-surface)] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[var(--theme-gradient-start)] to-[var(--theme-gradient-end)] p-8 text-center">
              <motion.h1 
                className="text-5xl font-extrabold text-white mb-2"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                🏏 AUCTION COMPLETE! 🏆
              </motion.h1>
              <p className="text-white/80 text-lg">
                Round {currentRound} Summary
              </p>
            </div>

            {/* Stats Grid */}
            <div className="p-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard 
                  label="Players Sold" 
                  value={totalSold.toString()} 
                  icon="✅" 
                  color="var(--theme-sold)"
                />
                <StatCard 
                  label="Players Unsold" 
                  value={totalUnsold.toString()} 
                  icon="❌" 
                  color="var(--theme-unsold)"
                />
                <StatCard 
                  label="Total Amount" 
                  value={`₹${totalAmount.toFixed(1)}L`} 
                  icon="💰" 
                  color="var(--theme-accent)"
                />
                <StatCard 
                  label="Avg. Price" 
                  value={totalSold > 0 ? `₹${(totalAmount / totalSold).toFixed(2)}L` : 'N/A'} 
                  icon="📊" 
                  color="var(--theme-bid)"
                />
              </div>

              {/* Highest Sale */}
              {highestSale && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mb-8 p-4 bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 rounded-xl border border-yellow-500/30"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">🌟</span>
                    <div>
                      <div className="text-sm text-[var(--theme-text-secondary)]">Highest Sale</div>
                      <div className="text-xl font-bold text-[var(--theme-text-primary)]">
                        {highestSale.name}
                      </div>
                      <div className="text-lg text-yellow-500 font-semibold">
                        ₹{highestSale.soldAmount.toFixed(2)}L → {highestSale.teamName}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Team Rankings */}
              <h3 className="text-xl font-bold text-[var(--theme-text-primary)] mb-4">
                Team Summary
              </h3>
              <div className="space-y-2 mb-8">
                {teamRankings.map((team, index) => {
                  const spent = team.allocatedAmount - team.remainingPurse;
                  return (
                    <motion.div
                      key={team.name}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      className="flex items-center justify-between p-3 bg-[var(--theme-background)]/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-[var(--theme-text-secondary)]">
                          #{index + 1}
                        </span>
                        <TeamLogo logoUrl={team.logoUrl} teamName={team.name} size="md" />
                        <span className="font-semibold text-[var(--theme-text-primary)]">
                          {team.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[var(--theme-accent)]">
                          {team.playersBought} players
                        </div>
                        <div className="text-sm text-[var(--theme-text-secondary)]">
                          Spent: ₹{spent.toFixed(2)}L | Remaining: ₹{team.remainingPurse.toFixed(2)}L
                        </div>
                        {onShowTeam && (
                          <button
                            onClick={() => {
                              onShowTeam(team.id);
                              onClose();
                            }}
                            className="mt-2 text-sm font-semibold text-[var(--theme-accent)] hover:underline"
                          >
                            Show full team →
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {unsoldPlayers.length > 0 && (onStartNextRound || onStartRound2) && currentRound < maxRound && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onStartNextRound ?? onStartRound2}
                    className="px-8 py-3 bg-[var(--theme-accent)] text-white rounded-lg font-bold text-lg shadow-lg"
                  >
                    🔄 Start Round {currentRound + 1} ({unsoldPlayers.length} players)
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="px-8 py-3 bg-[var(--theme-secondary)] text-white rounded-lg font-bold text-lg"
                >
                  Close Summary
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Stat Card Component
function StatCard({ 
  label, 
  value, 
  icon, 
  color 
}: { 
  label: string; 
  value: string; 
  icon: string; 
  color: string;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="p-4 bg-[var(--theme-background)]/50 rounded-xl text-center"
    >
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-sm text-[var(--theme-text-secondary)]">
        {label}
      </div>
    </motion.div>
  );
}
