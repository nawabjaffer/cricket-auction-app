// ============================================================================
// OBS OVERLAY PAGE — Browser Source for OBS Studio
// Professional bottom-center player card with match stats, bid history,
// sold animation, and teams budget ticker.
//
// DATA: Firebase RTDB via dedicated named app "obs-overlay" — zero delay.
// IMAGES: Resolved through Firebase Storage CDN via firebaseStorageService.
// ============================================================================

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getCachedStorageUrl, resolveImageAsync } from '../services/firebaseStorageService';
import { extractDriveFileId } from '../utils/driveImage';
import SoldAnimation from '../components/Live/SoldAnimation';
import type { Player, Team } from '../types';
import { tenantPath, setActiveTenant, DEFAULT_TENANT_ID } from '../services/tenantPath';
import './OBSOverlayPage.css';

// ── Firebase: module-level synchronous init ──────────────────────────────────
const FB_CONFIG = {
  apiKey:      'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain:  'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId:   'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId:       '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const OBS_APP_NAME = 'obs-overlay';
const obsApp = getApps().find((a) => a.name === OBS_APP_NAME) ?? initializeApp(FB_CONFIG, OBS_APP_NAME);
const obsDb  = getDatabase(obsApp);
// Resolve tenant from URL (?tenant=xyz or /:tenantSlug/obs-overlay) so OBS
// can point at any tournament. Falls back to the default tenant.
(function resolveObsTenant() {
  try {
    const params = new URLSearchParams(window.location.search);
    const qp = params.get('tenant') || params.get('tenantId') || params.get('tournament');
    if (qp) { setActiveTenant(qp); return; }
    const segments = window.location.pathname.split('/').filter(Boolean);
    // Treat first segment as tenant if it looks like a tenant id/slug.
    if (segments.length >= 2 && /^[a-zA-Z0-9_-]+$/.test(segments[0])) {
      setActiveTenant(segments[0]);
      return;
    }
  } catch { /* ignore */ }
  setActiveTenant(DEFAULT_TENANT_ID);
})();
const PATH_STATE   = tenantPath('auction/currentState');
const PATH_CONTROL = tenantPath('auction/broadcastControl');

// ── Types matching RealtimeAuctionState (includes stats + bid history) ────────
interface OverlayPlayer {
  id: string; name: string; role: string;
  imageUrl: string; basePrice: number;
  age?: number | null;
  matches?: string; runs?: string; wickets?: string;
  battingBestFigures?: string; bowlingBestFigures?: string;
  battingStats?: {
    matches: string; innings: string; runs: string;
    highestScore: string; average: string; strikeRate: string;
    fifties: string; hundreds: string; fours: string; sixes: string;
    notOut: string; thirties: string;
  };
  bowlingStats?: {
    matches: string; innings: string; overs: string; wickets: string;
    bestBowling: string; economy: string; average: string; strikeRate: string;
    threeWickets: string; fiveWickets: string; maidens: string; runs: string;
  };
}
interface OverlayTeam {
  id: string; name: string; logoUrl: string;
  remainingPurse: number;
  primaryColor?: string; secondaryColor?: string;
}
interface BidHistoryEntry {
  teamId: string; teamName: string; teamLogoUrl?: string;
  amount: number; timestamp: string;
}
interface OverlayState {
  currentPlayer: OverlayPlayer | null;
  currentBid:    number;
  selectedTeam:  OverlayTeam | null;
  teams:         OverlayTeam[];
  auctionActive: boolean;
  activeOverlay: 'sold' | 'unsold' | null;
  bidHistory:    BidHistoryEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number): string => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(2)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const roleLabel = (r: string) => {
  const m: Record<string, string> = {
    batsman: 'BATTER', batter: 'BATTER', bowler: 'BOWLER',
    'all-rounder': 'ALL-ROUNDER', allrounder: 'ALL-ROUNDER',
    'wicket-keeper': 'WICKET-KEEPER', wicketkeeper: 'WICKET-KEEPER',
  };
  return m[r?.toLowerCase()] ?? r?.toUpperCase() ?? 'PLAYER';
};

// ── Image resolution hook (Firebase Storage CDN) ─────────────────────────────
function useStorageImage(originalUrl: string | undefined, storagePath: string): string {
  const [src, setSrc] = useState(() => {
    if (!originalUrl) return '';
    // Instant: check localStorage cache
    const cached = getCachedStorageUrl(originalUrl);
    if (cached) return cached;
    // Fallback: try Google Drive CDN
    const fileId = extractDriveFileId(originalUrl);
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=s512`;
    return originalUrl;
  });

  useEffect(() => {
    if (!originalUrl) { setSrc(''); return; }
    // Check cache first (synchronous)
    const cached = getCachedStorageUrl(originalUrl);
    if (cached) { setSrc(cached); return; }
    // Start background upload/resolution
    const fileId = extractDriveFileId(originalUrl);
    if (fileId) setSrc(`https://lh3.googleusercontent.com/d/${fileId}=s512`);
    else setSrc(originalUrl);
    resolveImageAsync(originalUrl, storagePath, (storageUrl) => setSrc(storageUrl));
  }, [originalUrl, storagePath]);

  return src;
}

// ── Stat pills ────────────────────────────────────────────────────────────────
function PlayerStats({ player }: { player: OverlayPlayer }) {
  const stats = useMemo(() => {
    const pills: Array<{ label: string; value: string }> = [];
    const role = player.role?.toLowerCase() ?? '';
    const isBowler = role.includes('bowl');
    const isBatter = role.includes('bat') || role.includes('batter');
    const isAllRounder = role.includes('all') || role.includes('rounder');
    const isKeeper = role.includes('keep') || role.includes('wicket');

    if (player.matches && player.matches !== '0') pills.push({ label: 'MAT', value: player.matches });

    if (player.battingStats) {
      const b = player.battingStats;
      if (b.runs && b.runs !== '0') pills.push({ label: 'RUNS', value: b.runs });
      if (b.average && b.average !== '0' && b.average !== '0.00') pills.push({ label: 'AVG', value: b.average });
      if (b.strikeRate && b.strikeRate !== '0' && b.strikeRate !== '0.00') pills.push({ label: 'SR', value: b.strikeRate });
      if (b.highestScore) pills.push({ label: 'HS', value: b.highestScore });
      if (b.fifties && b.fifties !== '0') pills.push({ label: '50s', value: b.fifties });
      if (b.hundreds && b.hundreds !== '0') pills.push({ label: '100s', value: b.hundreds });
    } else {
      if (player.runs && player.runs !== '0' && (isBatter || isAllRounder || isKeeper)) {
        pills.push({ label: 'RUNS', value: player.runs });
      }
      if (player.battingBestFigures) pills.push({ label: 'HS', value: player.battingBestFigures });
    }

    if (player.bowlingStats) {
      const bw = player.bowlingStats;
      if (bw.wickets && bw.wickets !== '0') pills.push({ label: 'WKT', value: bw.wickets });
      if (bw.economy && bw.economy !== '0' && bw.economy !== '0.00') pills.push({ label: 'ECO', value: bw.economy });
      if (bw.bestBowling) pills.push({ label: 'BB', value: bw.bestBowling });
    } else {
      if (player.wickets && player.wickets !== '0' && (isBowler || isAllRounder)) {
        pills.push({ label: 'WKT', value: player.wickets });
      }
      if (player.bowlingBestFigures) pills.push({ label: 'BB', value: player.bowlingBestFigures });
    }

    return pills.slice(0, 6); // max 6 stat pills for layout
  }, [player]);

  if (stats.length === 0) return null;

  return (
    <div className="obs-stats">
      {stats.map((s) => (
        <div key={s.label} className="obs-stats__pill">
          <span className="obs-stats__val">{s.value}</span>
          <span className="obs-stats__lbl">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════
export default function OBSOverlayPage() {
  const [state,         setState]        = useState<OverlayState | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<string>('auction');
  const [activeOverlay, setActiveOverlay] = useState<'sold' | 'unsold' | null>(null);
  const [connected,     setConnected]    = useState(false);
  const animatingRef = useRef(false);

  useEffect(() => {
    const unsubState = onValue(
      ref(obsDb, PATH_STATE),
      (snap) => {
        setConnected(true);
        if (!snap.exists()) return;
        const s = snap.val() as OverlayState;
        setState(s);
        const ov = s.activeOverlay;
        if ((ov === 'sold' || ov === 'unsold') && !animatingRef.current) {
          animatingRef.current = true;
          setActiveOverlay(ov);
        }
      },
      (err) => console.error('[OBSOverlay] state error:', err)
    );
    const unsubControl = onValue(
      ref(obsDb, PATH_CONTROL),
      (snap) => { if (snap.exists()) setBroadcastMode(snap.val()?.mode ?? 'auction'); }
    );
    return () => { unsubState(); unsubControl(); };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPlayer = state?.currentPlayer ?? null;
  const currentBid    = state?.currentBid    ?? 0;
  const selectedTeam  = state?.selectedTeam  ?? null;
  const teams         = state?.teams         ?? [];
  const bidHistory    = state?.bidHistory    ?? [];
  const isBreak       = broadcastMode === 'break';
  const hasPlayer     = !!currentPlayer && !activeOverlay && !isBreak;

  // ── Image resolution via Firebase Storage ─────────────────────────────────
  const playerStoragePath = currentPlayer
    ? `images/players/${currentPlayer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : '';
  const playerImgSrc = useStorageImage(currentPlayer?.imageUrl, playerStoragePath);

  const teamStoragePath = selectedTeam
    ? `images/teams/${selectedTeam.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : '';
  const teamLogoSrc = useStorageImage(selectedTeam?.logoUrl, teamStoragePath);

  // ── Cast for SoldAnimation ────────────────────────────────────────────────
  const soldPlayer = (activeOverlay && currentPlayer) ? (currentPlayer as unknown as Player) : null;
  const soldTeam   = (activeOverlay && selectedTeam)  ? (selectedTeam  as unknown as Team)   : null;

  return (
    <div className="obs-overlay">
      {/* Connection dot */}
      <span className={`obs-conn-dot ${connected ? 'obs-conn-dot--on' : ''}`} />

      {/* Standby */}
      <AnimatePresence>
        {!currentPlayer && !activeOverlay && !isBreak && (
          <motion.div className="obs-standby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="obs-standby__dot" />
            <span className="obs-standby__text">OVERLAY ACTIVE · STANDBY</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teams ticker */}
      <AnimatePresence>
        {teams.length > 0 && hasPlayer && (
          <motion.div className="obs-ticker"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}>
            <span className="obs-ticker__label">TEAMS</span>
            <div className="obs-ticker__viewport">
              <div className="obs-ticker__track" style={{ '--team-count': teams.length } as React.CSSProperties}>
                {[...teams, ...teams].map((t, i) => (
                  <span key={`${t.id}-${i}`} className="obs-ticker__item">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="obs-ticker__logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                    <span className="obs-ticker__team-name">{t.name}</span>
                    <span className="obs-ticker__purse">{fmt(t.remainingPurse)}</span>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM-CENTER PLAYER CARD ────────────────────────────────────── */}
      <AnimatePresence>
        {hasPlayer && (
          <motion.div className="obs-pcard"
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}>

            {/* Left: Player image */}
            <div className="obs-pcard__img-wrap">
              {playerImgSrc ? (
                <img src={playerImgSrc} alt={currentPlayer!.name} className="obs-pcard__img"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="obs-pcard__img-fallback">
                  {currentPlayer!.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="obs-pcard__role-badge">{roleLabel(currentPlayer!.role)}</div>
            </div>

            {/* Center: Name + stats */}
            <div className="obs-pcard__body">
              <div className="obs-pcard__name">{currentPlayer!.name}</div>
              {currentPlayer!.age && (
                <div className="obs-pcard__age">AGE {currentPlayer!.age}</div>
              )}
              <PlayerStats player={currentPlayer!} />
              <div className="obs-pcard__base">BASE PRICE {fmt(currentPlayer!.basePrice)}</div>
            </div>

            {/* Right: Current bid / team */}
            <div className="obs-pcard__bid-section">
              {selectedTeam ? (
                <>
                  <div className="obs-pcard__team-logo-wrap">
                    {teamLogoSrc ? (
                      <img src={teamLogoSrc} alt="" className="obs-pcard__team-logo"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="obs-pcard__team-initials">
                        {selectedTeam.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="obs-pcard__team-name">{selectedTeam.name}</div>
                  <motion.div className="obs-pcard__bid-amount"
                    key={`bid-${currentBid}`}
                    initial={{ scale: 1.3, color: '#fbbf24' }}
                    animate={{ scale: 1, color: '#ffffff' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
                    {fmt(currentBid)}
                  </motion.div>
                </>
              ) : (
                <>
                  <div className="obs-pcard__bid-label">BASE PRICE</div>
                  <div className="obs-pcard__bid-amount obs-pcard__bid-amount--base">
                    {fmt(currentPlayer!.basePrice)}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BID HISTORY (shown above the player card) ─────────────────── */}
      <AnimatePresence>
        {hasPlayer && bidHistory.length > 1 && (
          <motion.div className="obs-bid-history"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <span className="obs-bid-history__title">BID HISTORY</span>
            <div className="obs-bid-history__list">
              {bidHistory.slice(-5).reverse().map((b, i) => (
                <motion.div key={`${b.teamId}-${b.amount}-${b.timestamp}`}
                  className={`obs-bid-history__item ${i === 0 ? 'obs-bid-history__item--latest' : ''}`}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <span className="obs-bid-history__team">{b.teamName}</span>
                  <span className="obs-bid-history__amt">{fmt(b.amount)}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SOLD / UNSOLD ANIMATION ─────────────────────────────────────── */}
      <AnimatePresence>
        {activeOverlay && soldPlayer && (
          <SoldAnimation
            key={`${activeOverlay}-${soldPlayer.id ?? soldPlayer.name}`}
            type={activeOverlay}
            player={soldPlayer}
            team={soldTeam}
            amount={currentBid || 0}
            onComplete={() => { animatingRef.current = false; setActiveOverlay(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
