// ============================================================================
// BREAK OVERLAY - Premium Broadcast Break Screen
// Full-screen break with:
//   TOP:    Tournament logo + title sponsors
//   CENTER: Sponsor video / brochure playback (10-60s configurable)
//   BOTTOM: Logo train carousel (B&W → color at center)
//   BG:     Animated geometric shapes
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SponsorRecord } from '../../services/auctionPersistence';
import './BreakOverlay.css';

interface BreakOverlayProps {
  readonly isVisible: boolean;
  readonly durationSeconds: number;
  readonly sponsors: SponsorRecord[];
  readonly sponsorDisplayDuration?: number; // seconds per sponsor in center (default 15)
  readonly organizerLogo?: string;
  readonly auctionTitle?: string;
  readonly onClose: () => void;
}

export function BreakOverlay({
  isVisible,
  durationSeconds,
  sponsors,
  sponsorDisplayDuration = 15,
  organizerLogo,
  auctionTitle,
  onClose,
}: BreakOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [activeSponsorIndex, setActiveSponsorIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const endsAtRef = useRef<number>(0);

  // Reset + start the countdown the instant the overlay becomes visible.
  // We use a deadline-based clock so the timer is robust against tab throttling
  // and starts immediately on the first frame after the 'B' keypress.
  useEffect(() => {
    if (!isVisible) return;
    endsAtRef.current = Date.now() + durationSeconds * 1000;
    setTimeLeft(durationSeconds);
    setActiveSponsorIndex(0);

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        onClose();
      }
    };
    // Fire immediately for snappy feel, then every 250ms.
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isVisible, durationSeconds, onClose]);

  // Categorize sponsors
  const titleSponsors = useMemo(
    () => sponsors.filter(s => s.active !== false && s.isTitleSponsor && s.logoUrl),
    [sponsors],
  );

  const centerSponsors = useMemo(
    () => sponsors.filter(s => s.active !== false && (s.videoUrl || s.logoUrl)),
    [sponsors],
  );

  const allLogoSponsors = useMemo(
    () => sponsors.filter(s => s.active !== false && s.logoUrl),
    [sponsors],
  );

  // Rotate center content
  useEffect(() => {
    if (!isVisible || centerSponsors.length <= 1) return;
    const current = centerSponsors[activeSponsorIndex];
    if (current?.videoUrl) return; // video controls its own rotation via onEnded
    const timer = setTimeout(() => {
      setActiveSponsorIndex((prev) => (prev + 1) % centerSponsors.length);
    }, sponsorDisplayDuration * 1000);
    return () => clearTimeout(timer);
  }, [isVisible, activeSponsorIndex, centerSponsors, sponsorDisplayDuration]);

  const handleVideoEnded = useCallback(() => {
    if (centerSponsors.length > 1) {
      setActiveSponsorIndex((prev) => (prev + 1) % centerSponsors.length);
    }
  }, [centerSponsors.length]);

  // ESC / B to close
  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        onClose();
      }
    };
    globalThis.addEventListener('keydown', handleKey);
    return () => globalThis.removeEventListener('keydown', handleKey);
  }, [isVisible, onClose]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentSponsor = centerSponsors[activeSponsorIndex];

  // Double the logos array for seamless infinite scroll
  const trainLogos = useMemo(() => {
    if (allLogoSponsors.length === 0) return [];
    // Need enough to fill the screen twice for the infinite loop
    const repetitions = Math.max(3, Math.ceil(20 / allLogoSponsors.length));
    const result: SponsorRecord[] = [];
    for (let i = 0; i < repetitions; i++) {
      result.push(...allLogoSponsors);
    }
    return result;
  }, [allLogoSponsors]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="break-ov"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* ═══ ANIMATED BACKGROUND SHAPES ═══ */}
          <div className="break-ov__bg">
            <div className="break-ov__shape break-ov__shape--1" />
            <div className="break-ov__shape break-ov__shape--2" />
            <div className="break-ov__shape break-ov__shape--3" />
            <div className="break-ov__shape break-ov__shape--4" />
            <div className="break-ov__shape break-ov__shape--5" />
            <div className="break-ov__shape break-ov__shape--6" />
            {/* Grid lines */}
            <div className="break-ov__grid" />
          </div>

          {/* ═══ TOP BAR: Tournament Logo + Title Sponsors + Timer ═══ */}
          <motion.header
            className="break-ov__header"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <div className="break-ov__header-left">
              {organizerLogo && (
                <img
                  src={organizerLogo}
                  alt="Tournament"
                  className="break-ov__tournament-logo"
                />
              )}
              <div className="break-ov__header-text">
                <h1 className="break-ov__title">
                  {auctionTitle || 'AUCTION BREAK'}
                </h1>
                <p className="break-ov__subtitle">Resuming shortly</p>
              </div>
            </div>

            {/* Title Sponsors */}
            {titleSponsors.length > 0 && (
              <div className="break-ov__title-sponsors">
                <span className="break-ov__title-sponsors-label">Title Sponsor</span>
                <div className="break-ov__title-sponsors-logos">
                  {titleSponsors.map(s => (
                    <img key={s.id} src={s.logoUrl} alt={s.name} className="break-ov__title-sponsor-logo" />
                  ))}
                </div>
              </div>
            )}

            {/* Timer */}
            <div className="break-ov__timer">
              <div className="break-ov__timer-value">{formatTime(timeLeft)}</div>
              <span className="break-ov__timer-label">Remaining</span>
            </div>
          </motion.header>

          {/* ═══ CENTER: Sponsor Video / Brochure Playback ═══ */}
          <motion.div
            className="break-ov__center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <AnimatePresence mode="wait">
              {currentSponsor?.videoUrl ? (
                <motion.div
                  key={`video-${currentSponsor.id}`}
                  className="break-ov__media-wrap"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.6 }}
                >
                  <video
                    ref={videoRef}
                    src={currentSponsor.videoUrl}
                    autoPlay
                    muted
                    onEnded={handleVideoEnded}
                    className="break-ov__video"
                  />
                  <div className="break-ov__media-badge">
                    <span className="break-ov__media-badge-dot" />
                    {currentSponsor.name}
                  </div>
                </motion.div>
              ) : currentSponsor?.logoUrl ? (
                <motion.div
                  key={`logo-${currentSponsor.id}`}
                  className="break-ov__media-wrap break-ov__media-wrap--poster"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  transition={{ duration: 0.5 }}
                >
                  <img
                    src={currentSponsor.logoUrl}
                    alt={currentSponsor.name}
                    className="break-ov__poster"
                  />
                  <div className="break-ov__poster-info">
                    <span className="break-ov__poster-name">{currentSponsor.name}</span>
                    {currentSponsor.tier && (
                      <span className="break-ov__poster-tier">{currentSponsor.tier} Sponsor</span>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="break-default"
                  className="break-ov__default-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="break-ov__default-icon">☕</div>
                  <h3 className="break-ov__default-text">Break Time</h3>
                  <p className="break-ov__default-sub">Auction will resume shortly</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dot indicator */}
            {centerSponsors.length > 1 && (
              <div className="break-ov__dots">
                {centerSponsors.map((s, i) => (
                  <div
                    key={s.id}
                    className={`break-ov__dot ${i === activeSponsorIndex ? 'active' : ''}`}
                  />
                ))}
              </div>
            )}
          </motion.div>

          {/* ═══ BOTTOM: Logo Train Carousel (B&W → color zoom at center) ═══ */}
          {trainLogos.length > 0 && (
            <motion.div
              className="break-ov__train"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              {/* Base B&W layer */}
              <div className="break-ov__train-track">
                <div
                  className="break-ov__train-runner"
                  style={{
                    animationDuration: `${Math.max(15, allLogoSponsors.length * 4)}s`,
                  }}
                >
                  {trainLogos.map((sponsor, i) => (
                    <div key={`${sponsor.id}-${i}`} className="break-ov__train-item">
                      <img
                        src={sponsor.logoUrl}
                        alt={sponsor.name}
                        className="break-ov__train-logo"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Color overlay — clipped to center zone for zoom-in color reveal */}
              <div
                className="break-ov__train-color-layer"
                style={{
                  clipPath: 'inset(0 35% 0 35%)',
                }}
              >
                <div
                  className="break-ov__train-runner-clone"
                  style={{
                    animationDuration: `${Math.max(15, allLogoSponsors.length * 4)}s`,
                  }}
                >
                  {trainLogos.map((sponsor, i) => (
                    <div key={`color-${sponsor.id}-${i}`} className="break-ov__train-item-clone">
                      <img
                        src={sponsor.logoUrl}
                        alt={sponsor.name}
                        className="break-ov__train-logo-color"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Center focus ring */}
              <div className="break-ov__train-focus" />
              {/* Center highlight glow */}
              <div className="break-ov__train-center-glow" />
              {/* Branding */}
              <div className="break-ov__branding">
                crafted by <b>NJS Creative Labs</b>
              </div>
            </motion.div>
          )}

          {/* NJS Creative Labs footer branding */}
          <div className="break-ov__hint">
            Press <kbd>B</kbd> or <kbd>ESC</kbd> to end break
            <span style={{ marginLeft: '1.5rem', opacity: 0.6 }}>powered by <b style={{ color: 'rgba(129,140,248,0.6)' }}>NJS Creative Labs</b></span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BreakOverlay;
