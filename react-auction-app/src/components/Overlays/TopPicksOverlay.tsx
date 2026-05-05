// ============================================================================
// TOP PICKS OVERLAY - Redesigned showcase of top auction buys
// Shows player images prominently with team logo backgrounds
// ============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoTrophy } from 'react-icons/io5';
import type { SoldPlayer, Team } from '../../types';
import { useCurrencySuffix } from '../../store';
import './TopPicksOverlay.css';

interface TopBuyEntry extends SoldPlayer {
  team?: Team;
}

interface TopPicksOverlayProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly topBuys: TopBuyEntry[];
  readonly currentIndex: number;
}

export function TopPicksOverlay({ visible, onClose, topBuys, currentIndex }: TopPicksOverlayProps) {
  const currencySuffix = useCurrencySuffix();
  if (!visible || topBuys.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="top-picks-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
        >
          <motion.div
            className="top-picks-container"
            initial={{ scale: 0.8, y: 80 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            onClick={e => e.stopPropagation()}
          >
            <button className="top-picks-close" onClick={onClose}>
              <IoClose />
            </button>

            <motion.div
              className="top-picks-header"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <IoTrophy className="top-picks-trophy" />
              <h2>Top Picks</h2>
            </motion.div>

            <div className="top-picks-cards">
              {topBuys.map((buy, index) => {
                const isActive = index === currentIndex;
                return (
                  <motion.div
                    key={buy.id}
                    className={`top-pick-card ${isActive ? 'active' : ''}`}
                    initial={{ opacity: 0, y: 60, scale: 0.85 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: isActive ? 1.05 : 0.92,
                      filter: isActive ? 'brightness(1)' : 'brightness(0.6)',
                    }}
                    transition={{ delay: 0.15 + index * 0.1, type: 'spring', damping: 20 }}
                  >
                    {/* Team logo background */}
                    {buy.team?.logoUrl && (
                      <div className="top-pick-team-bg">
                        <img src={buy.team.logoUrl} alt="" className="top-pick-team-bg-img" />
                      </div>
                    )}

                    {/* Rank badge */}
                    <div className={`top-pick-rank rank-${index + 1}`}>
                      #{index + 1}
                    </div>

                    {/* Player image */}
                    <div className="top-pick-player-img-wrap">
                      <img
                        src={buy.imageUrl || '/placeholder_player.png'}
                        alt={buy.name}
                        className="top-pick-player-img"
                        onError={e => { (e.target as HTMLImageElement).src = '/placeholder_player.png'; }}
                      />
                    </div>

                    {/* Player info overlay at bottom */}
                    <div className="top-pick-info">
                      <div className="top-pick-amount">₹{buy.soldAmount.toFixed(1)}{currencySuffix}</div>
                      <div className="top-pick-name">{buy.name}</div>
                      <div className="top-pick-team-name">
                        {buy.team?.logoUrl && (
                          <img src={buy.team.logoUrl} alt="" className="top-pick-team-logo-sm" />
                        )}
                        <span>{buy.teamName}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="top-picks-nav-hint">
              Use ← → arrows to navigate • Esc to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
