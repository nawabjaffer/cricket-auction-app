// ============================================================================
// SPOTLIGHT LAYOUT — centered hero cutout with rotating light rays and
// split stat columns (left/right). Mirrors the broadcast "player reveal" look.
//
// All content is Firebase-driven via props; nothing here is hardcoded.
// ============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { formatRoleDisplay } from '../../utils/roleFormatter';
import { AuctionHomeScreen } from './AuctionHomeScreen';
import { withAlpha, darken, type AuctionLayoutProps } from './types';
import './AuctionLayouts.css';
import { getThemeAssetFilter } from '../../utils/themeAssetFilter';

export function SpotlightLayout(props: AuctionLayoutProps) {
  const {
    currentPlayer,
    playerImageSrc,
    statRows,
    currentBid,
    selectedTeam,
    maxBidForTeam,
    currencySuffix,
    organizerName,
    organizerLogo,
    currentRound,
    accentColor,
    primaryColor,
    secondaryColor,
    gifHueRotate,
    headerVisible,
  } = props;

  // Split configured stats into the two vertical columns flanking the player.
  const half = Math.ceil(statRows.length / 2);
  const leftStats = statRows.slice(0, half);
  const rightStats = statRows.slice(half);

  const themeVars = {
    '--al-accent': accentColor,
    '--al-bg-inner': primaryColor,
    '--al-bg-mid': darken(secondaryColor, 0.55),
    '--al-bg-outer': darken(secondaryColor, 0.85),
    '--al-light-primary-soft': withAlpha(primaryColor, 0.46),
    '--al-light-secondary-soft': withAlpha(secondaryColor, 0.4),
    '--al-light-highlight-soft': 'rgba(255, 255, 255, 0.58)',
  } as React.CSSProperties;

  return (
    <div
      className={`auction-layout auction-layout--spotlight${headerVisible ? ' auction-layout--with-header' : ''}`}
      style={themeVars}
    >
      <div className="al-corner-rays" aria-hidden>
        <span className="al-corner-ray al-corner-ray--left" />
        <span className="al-corner-ray al-corner-ray--right" />
        <span className="al-corner-ray al-corner-ray--bottom" />
        <span className="al-bottom-beams" />
      </div>

      <img
        className="al-side-smoke"
        src="/extras/d3.gif"
        alt=""
        aria-hidden
        loading="eager"
        decoding="async"
        style={{ filter: getThemeAssetFilter(primaryColor, secondaryColor, gifHueRotate) }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />

      <div className="al-round-chip">Round {currentRound}</div>

      {currentPlayer ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPlayer.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="al-spot-header"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="al-spot-org">
                {organizerLogo && (
                  <img
                    className="al-spot-org-logo"
                    src={organizerLogo}
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className="al-spot-org-name">{organizerName || 'Auction'}</span>
              </div>
              <h1 className="al-spot-name">{currentPlayer.name}</h1>
              <div className="al-spot-role">{formatRoleDisplay(currentPlayer.role)} {currentPlayer.basePrice > 0 && (
                <div className="al-spot-base">
                  Base ₹{Number(currentPlayer.basePrice).toFixed(1)}{currencySuffix}
                </div>
              )}</div>

            </motion.div>

            <div className="al-spot-stats al-spot-stats--left">
              {leftStats.map((row, index) => (
                <motion.div
                  key={row.label}
                  className="al-spot-stat"
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.35 + index * 0.12 }}
                >
                  <div className="al-spot-stat-label-bg">
                    <span className="al-spot-stat-label">{row.label}</span>
                  </div>
                  <div className="al-spot-stat-value">{row.value}</div>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="al-spot-player"
              initial={{ opacity: 0, y: 40, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
            >
              <img src={playerImageSrc} alt={currentPlayer.name} />
              <div className="al-center-rays" aria-hidden>
                <div className="al-ray-ring al-ray-ring--inner" />
                <div className="al-ray-beams" />
              </div>
            </motion.div>

            <div className="al-spot-stats al-spot-stats--right">
              {rightStats.map((row, index) => (
                <motion.div
                  key={row.label}
                  className="al-spot-stat"
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.45 + index * 0.12 }}
                >
                  <div className="al-spot-stat-label-bg">
                    <span className="al-spot-stat-label">{row.label}</span>
                  </div>
                  <div className="al-spot-stat-value">{row.value}</div>
                </motion.div>
              ))}
            </div>

            {selectedTeam && (
              <motion.div
                className="al-bid-card"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              >
                <div className="al-bid-team">
                  {selectedTeam.logoUrl && (
                    <img
                      className="al-bid-team-logo"
                      src={selectedTeam.logoUrl}
                      alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span className="al-bid-team-name">{selectedTeam.name}</span>
                </div>
                <motion.div
                  className="al-bid-amount"
                  key={`bid-${currentBid}`}
                  initial={{ scale: 1.25 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                >
                  ₹{Number(currentBid).toFixed(2)}{currencySuffix}
                </motion.div>
                <div className="al-bid-max">
                  Max ₹{Number(maxBidForTeam).toFixed(1)}{currencySuffix}
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      ) : (
        <AuctionHomeScreen {...props} />
      )}
    </div>
  );
}
