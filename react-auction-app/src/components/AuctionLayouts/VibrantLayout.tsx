// ============================================================================
// VIBRANT LAYOUT — split screen with an accent splash panel behind the player
// cutout and a full stat table on the left.
//
// All content is Firebase-driven via props; nothing here is hardcoded.
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatRoleDisplay } from '../../utils/roleFormatter';
import { AuctionHomeScreen } from './AuctionHomeScreen';
import { withAlpha, type AuctionLayoutProps } from './types';
import './AuctionLayouts.css';

function VibrantPlayerReveal({ imageUrl, playerName }: { readonly imageUrl: string; readonly playerName: string }) {
  const [imageReady, setImageReady] = useState(false);

  return (
    <>
      <svg
        className="al-vib-brush-defs"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <mask id="al-vib-brush-alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <g fill="#fff">
              <circle cx="65" cy="170" r="16" opacity="0.65" />
              <circle cx="170" cy="850" r="12" opacity="0.55" />
              <circle cx="365" cy="90" r="20" opacity="0.75" />
              <circle cx="575" cy="900" r="14" opacity="0.62" />
              <circle cx="825" cy="120" r="18" opacity="0.7" />
              <circle cx="965" cy="760" r="13" opacity="0.6" />
              <rect x="230" y="75" width="120" height="7" transform="rotate(-7 230 75)" opacity="0.5" />
              <rect x="640" y="875" width="150" height="8" transform="rotate(5 640 875)" opacity="0.55" />
              <path
                className={`al-vib-brush-stroke${imageReady ? ' is-ready' : ''}`}
                d="M -260,500 C 40,185 250,810 510,430 S 900,150 1260,520"
                fill="none"
                stroke="#fff"
                strokeWidth="980"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </mask>
        </defs>
      </svg>
      <img
        src={imageUrl}
        alt={playerName}
        className={`al-vib-player-image${imageReady ? ' is-ready' : ''}`}
        onLoad={() => setImageReady(true)}
        onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
      />
    </>
  );
}

export function VibrantLayout(props: AuctionLayoutProps) {
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
    headerVisible,
  } = props;

  // The splash panel sits behind the cutout, so the table stays readable at 8 rows.
  const visibleStats = statRows.slice(0, 8);

  const themeVars = {
    '--al-accent': accentColor,
    '--al-border': withAlpha(accentColor, 0.28),
  } as React.CSSProperties;

  return (
    <div
      className={`auction-layout auction-layout--vibrant${headerVisible ? ' auction-layout--with-header' : ''}`}
      style={themeVars}
    >
      <div className="al-vib-particles" aria-hidden />

      <motion.div
        className="al-vib-splash"
        aria-hidden
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: '0%', opacity: 1 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
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
            <div className="al-vib-content">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="al-vib-org">
                  {organizerLogo && (
                    <img
                      className="al-vib-org-logo"
                      src={organizerLogo}
                      alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span>{organizerName || 'Auction'}</span>
                </div>
                <h1 className="al-vib-name">{currentPlayer.name}</h1>
                <div className="al-vib-role">{formatRoleDisplay(currentPlayer.role)}</div>
              </motion.div>

              <div className="al-vib-table">
                {visibleStats.map((row, index) => (
                  <motion.div
                    key={row.label}
                    className="al-vib-row"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.3 + index * 0.08 }}
                  >
                    <span className="al-vib-row-label">{row.label}</span>
                    <span className="al-vib-row-value">{row.value}</span>
                  </motion.div>
                ))}
                {currentPlayer.basePrice > 0 && (
                  <motion.div
                    className="al-vib-row"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.3 + visibleStats.length * 0.08 }}
                  >
                    <span className="al-vib-row-label">Base Price</span>
                    <span className="al-vib-row-value">
                      ₹{Number(currentPlayer.basePrice).toFixed(1)}{currencySuffix}
                    </span>
                  </motion.div>
                )}
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
            </div>

            <motion.div
              className="al-vib-player"
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.4, delay: 0.25, ease: 'easeOut' }}
            >
              <VibrantPlayerReveal
                key={`${currentPlayer.id}-${playerImageSrc}`}
                imageUrl={playerImageSrc}
                playerName={currentPlayer.name}
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <AuctionHomeScreen {...props} />
      )}
    </div>
  );
}
