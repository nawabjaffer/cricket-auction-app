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

function VibrantPlayerReveal({
  imageUrl,
  placeholderUrl,
  playerName,
}: {
  readonly imageUrl: string;
  readonly placeholderUrl: string;
  readonly playerName: string;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [displayUrl, setDisplayUrl] = useState(imageUrl || placeholderUrl);

  return (
    <>
      <svg
        className='al-vib-brush-defs'
        width='0'
        height='0'
        aria-hidden='true'
        focusable='false'
      >
        <defs>
          <mask
            id='al-vib-brush-alpha'
            maskUnits='userSpaceOnUse'
            x='0'
            y='0'
            width='1920'
            height='1080'
          >
            <g fill='#fff'>
              {/* ============================= */}
              {/* BRUSH STROKE 1 */}
              {/* ============================= */}

              <path
                className={`al-vib-brush-stroke stroke-370 ${
                  imageReady ? 'is-ready' : ''
                }`}
                d='M -250,150 C 200,20 650,300 2150,180'
                fill='none'
                stroke='#fff'
                strokeWidth='232px'
                strokeLinecap='round'
                strokeLinejoin='round'
              />

              {/* ============================= */}
              {/* BRUSH STROKE 2 */}
              {/* ============================= */}

              <path
                className={`al-vib-brush-stroke stroke-318 ${
                  imageReady ? 'is-ready' : ''
                }`}
                d='M -250,400 C 250,600 700,180 2150,430'
                fill='none'
                stroke='#fff'
                strokeWidth='1400'
                strokeLinecap='round'
                strokeLinejoin='round'
              />

              {/* ============================= */}
              {/* BRUSH STROKE 3 */}
              {/* ============================= */}

              <path
                className={`al-vib-brush-stroke stroke-320 ${
                  imageReady ? 'is-ready' : ''
                }`}
                d='M -250,650 C 250,450 700,900 2150,680'
                fill='none'
                stroke='#fff'
                strokeWidth='99999'
                strokeLinecap='round'
                strokeLinejoin='round'
              />

              {/* ============================= */}
              {/* BRUSH STROKE 4 */}
              {/* ============================= */}

              <path
                className={`al-vib-brush-stroke stroke-440 ${
                  imageReady ? 'is-ready' : ''
                }`}
                d='M -250,900 C 250,1100 750,650 2150,920'
                fill='none'
                stroke='#fff'
                strokeWidth='1400'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </g>
          </mask>
        </defs>
      </svg>
      <img
        src={displayUrl}
        alt={playerName}
        className={`al-vib-player-image${imageReady ? ' is-ready' : ''}`}
        onLoad={() => setImageReady(true)}
        onError={() => {
          if (displayUrl !== placeholderUrl) {
            setImageReady(false);
            setDisplayUrl(placeholderUrl);
            return;
          }
          setImageReady(true);
        }}
      />
    </>
  );
}

export function VibrantLayout(props: AuctionLayoutProps) {
  const {
    currentPlayer,
    playerImageSrc,
    playerPlaceholderSrc,
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
    headerVisible,
  } = props;

  // The splash panel sits behind the cutout, so the table stays readable at 8 rows.
  const visibleStats = statRows.slice(0, 8);

  const themeVars = {
    '--al-accent': accentColor,
    '--al-primary': primaryColor,
    '--al-secondary': secondaryColor,
    '--al-border': withAlpha(accentColor, 0.28),
  } as React.CSSProperties;

  return (
    <div
      className={`auction-layout auction-layout--vibrant${headerVisible ? ' auction-layout--with-header' : ''}`}
      style={themeVars}
    >
      <div className='al-vib-particles' aria-hidden />

      <motion.div
        className='al-vib-splash'
        aria-hidden
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: '0%', opacity: 1 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        {!currentPlayer && (
          <img
            className='al-vib-splash-image'
            src={playerPlaceholderSrc}
            alt=''
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        )}
      </motion.div>

      <div className='al-round-chip'>Round {currentRound}</div>

      {currentPlayer ? (
        <AnimatePresence mode='wait'>
          <motion.div
            key={currentPlayer.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className='al-vib-content'>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className='al-vib-org'>
                  {organizerLogo && (
                    <img
                      className='al-vib-org-logo'
                      src={organizerLogo}
                      alt=''
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          'none';
                      }}
                    />
                  )}
                  <span>{organizerName || 'Auction'}</span>
                </div>
                <h1 className='al-vib-name'>{currentPlayer.name}</h1>
                <div className='al-vib-role'>
                  {formatRoleDisplay(currentPlayer.role)}
                </div>
              </motion.div>

              <div className='al-vib-table'>
                {visibleStats.map((row, index) => (
                  <motion.div
                    key={row.label}
                    className='al-vib-row'
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.3 + index * 0.08 }}
                  >
                    <span className='al-vib-row-label'>{row.label}</span>
                    <span className='al-vib-row-value'>{row.value}</span>
                  </motion.div>
                ))}
                {currentPlayer.basePrice > 0 && (
                  <motion.div
                    className='al-vib-row'
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.55,
                      delay: 0.3 + visibleStats.length * 0.08,
                    }}
                  >
                    <span className='al-vib-row-label'>Base Price</span>
                    <span className='al-vib-row-value'>
                      ₹{Number(currentPlayer.basePrice).toFixed(1)}
                      {currencySuffix}
                    </span>
                  </motion.div>
                )}
              </div>

              {selectedTeam && (
                <motion.div
                  className='al-bid-card'
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                >
                  <div className='al-bid-team'>
                    {selectedTeam.logoUrl && (
                      <img
                        className='al-bid-team-logo'
                        src={selectedTeam.logoUrl}
                        alt=''
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            'none';
                        }}
                      />
                    )}
                    <span className='al-bid-team-name'>
                      {selectedTeam.name}
                    </span>
                  </div>
                  <motion.div
                    className='al-bid-amount'
                    key={`bid-${currentBid}`}
                    initial={{ scale: 1.25 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  >
                    ₹{Number(currentBid).toFixed(2)}
                    {currencySuffix}
                  </motion.div>
                  <div className='al-bid-max'>
                    Max ₹{Number(maxBidForTeam).toFixed(1)}
                    {currencySuffix}
                  </div>
                </motion.div>
              )}
            </div>

            <motion.div
              className='al-vib-player'
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.4, delay: 0.25, ease: 'easeOut' }}
            >
              <VibrantPlayerReveal
                key={`${currentPlayer.id}-${playerImageSrc}-${playerPlaceholderSrc}`}
                imageUrl={playerImageSrc}
                placeholderUrl={playerPlaceholderSrc}
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
