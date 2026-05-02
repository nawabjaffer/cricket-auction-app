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
import { BreakOverlay } from '../components/Overlays/BreakOverlay';
import { TeamStandingsOverlay } from '../components/Overlays/TeamStandingsOverlay';
import type { Player, Team, PlayerRole } from '../types';
import type { SponsorRecord, AdminSettings } from '../services/auctionPersistence';
import { tenantPath } from '../services/tenantPath';
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
// Paths are resolved dynamically at subscribe-time so TenantGate's
// `setActiveTenant()` has already run and the tenant id uses the
// canonical form (underscores, not hyphens from the URL slug).

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
  playersBought?: number;
  totalPlayerThreshold?: number;
  highestBid?: number;
  captain?: string;
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
export default function OBSOverlayPage({ browserMode = false }: { readonly browserMode?: boolean }) {
  const [state,         setState]        = useState<OverlayState | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<string>('auction');
  const [broadcastControl, setBroadcastControl] = useState<{
    mode: string;
    breakDuration?: number;
    breakStartedAt?: number;
    sponsorDisplayDuration?: number;
    selectedTeamId?: string | null;
    teamSquadTeamId?: string | null;
    lastUpdate?: number;
  } | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<'sold' | 'unsold' | null>(null);
  const [connected,     setConnected]    = useState(false);
  const [sponsors,      setSponsors]     = useState<SponsorRecord[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [showTeamStandings, setShowTeamStandings] = useState(false);
  const [soldPlayersObs, setSoldPlayersObs] = useState<Array<{ id: string; name: string; soldAmount: number; teamName: string; teamId?: string; age?: number | null }>>([]);
  const animatingRef = useRef(false);
  const lastAnimatedKeyRef = useRef<string | null>(null);
  // Snapshot the player/team/bid at the moment overlay triggers so heartbeat
  // updates don't overwrite the sold animation data mid-flight.
  const [overlaySnapshot, setOverlaySnapshot] = useState<{
    player: OverlayPlayer; team: OverlayTeam | null; bid: number;
  } | null>(null);

  // 'g' key to toggle TeamStandingsOverlay
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') {
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        setShowTeamStandings(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    // Resolve paths at subscribe-time so the active tenant (set by TenantGate)
    // is used. This avoids the slug-vs-id mismatch (epl-2026 vs epl_2026).
    const pathState    = tenantPath('auction/currentState');
    const pathControl  = tenantPath('auction/broadcastControl');
    const pathSponsors = tenantPath('auction/sponsors');
    const pathAdminSet = tenantPath('auction/adminSettings');

    const unsubState = onValue(
      ref(obsDb, pathState),
      (snap) => {
        setConnected(true);
        if (!snap.exists()) return;
        const s = snap.val() as OverlayState;
        setState(s);
        const ov = s.activeOverlay;
        if ((ov === 'sold' || ov === 'unsold') && !animatingRef.current) {
          // Build a unique key for this player+overlay to avoid re-triggering
          // the same animation on repeated heartbeat broadcasts.
          const animKey = `${ov}-${s.currentPlayer?.id ?? 'unknown'}`;
          if (animKey !== lastAnimatedKeyRef.current) {
            animatingRef.current = true;
            lastAnimatedKeyRef.current = animKey;
            // Snapshot the player/team/bid so they stay stable during animation
            if (s.currentPlayer) {
              setOverlaySnapshot({ player: s.currentPlayer, team: s.selectedTeam ?? null, bid: s.currentBid });
            }
            setActiveOverlay(ov);
          }
        } else if (!ov) {
          // Desktop cleared the overlay — reset state
          if (!animatingRef.current) {
            setActiveOverlay(null);
            setOverlaySnapshot(null);
          }
        }
      },
      (err) => console.error('[OBSOverlay] state error:', err)
    );
    const unsubControl = onValue(
      ref(obsDb, pathControl),
      (snap) => {
        if (snap.exists()) {
          const ctrl = snap.val();
          setBroadcastMode(ctrl?.mode ?? 'auction');
          setBroadcastControl(ctrl ?? null);
        } else {
          setBroadcastMode('auction');
          setBroadcastControl(null);
        }
      }
    );
    const unsubSponsors = onValue(
      ref(obsDb, pathSponsors),
      (snap) => {
        if (!snap.exists()) { setSponsors([]); return; }
        const raw = snap.val();
        const list: SponsorRecord[] = Array.isArray(raw) ? raw : Object.values(raw ?? {});
        setSponsors(list.filter((s): s is SponsorRecord => !!s && typeof s === 'object' && 'id' in s));
      }
    );
    const unsubAdmin = onValue(
      ref(obsDb, pathAdminSet),
      (snap) => { if (snap.exists()) setAdminSettings(snap.val()); }
    );
    // Subscribe to sold players for TeamStandingsOverlay
    const pathSold = tenantPath('auction/soldPlayers');
    const unsubSold = onValue(
      ref(obsDb, pathSold),
      (snap) => {
        if (!snap.exists()) { setSoldPlayersObs([]); return; }
        const raw = snap.val();
        const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
        setSoldPlayersObs(list.filter((p): p is typeof list[number] => !!p && typeof p === 'object'));
      }
    );
    return () => { unsubState(); unsubControl(); unsubSponsors(); unsubAdmin(); unsubSold(); };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPlayer = state?.currentPlayer ?? null;
  const currentBid    = state?.currentBid    ?? 0;
  const selectedTeam  = state?.selectedTeam  ?? null;
  const teams         = state?.teams         ?? [];
  const bidHistory    = state?.bidHistory    ?? [];
  const isBreak       = broadcastMode === 'break';
  const isStandings   = broadcastMode === 'standings';
  const isTeamSquad   = broadcastMode === 'teamSquad';
  const overlayModeActive = isBreak || isStandings || isTeamSquad;
  const hasPlayer     = !!currentPlayer && !activeOverlay && !overlayModeActive;

  // Focused team for standings panel
  const standingsTeam = useMemo(() => {
    if (!isStandings) return null;
    const id = broadcastControl?.selectedTeamId;
    return teams.find((t) => t.id === id) ?? teams[0] ?? null;
  }, [isStandings, broadcastControl?.selectedTeamId, teams]);

  // Focused team for teamSquad view
  const squadTeam = useMemo(() => {
    if (!isTeamSquad) return null;
    const id = broadcastControl?.teamSquadTeamId;
    return teams.find((t) => t.id === id) ?? teams[0] ?? null;
  }, [isTeamSquad, broadcastControl?.teamSquadTeamId, teams]);

  // ── Image resolution via Firebase Storage ─────────────────────────────────
  const playerStoragePath = currentPlayer
    ? `images/players/${currentPlayer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : '';
  const playerImgSrc = useStorageImage(currentPlayer?.imageUrl, playerStoragePath);

  const teamStoragePath = selectedTeam
    ? `images/teams/${selectedTeam.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    : '';
  const teamLogoSrc = useStorageImage(selectedTeam?.logoUrl, teamStoragePath);

  // ── Cast for SoldAnimation — use snapshot to avoid stale data from heartbeat ──
  const soldPlayer = (activeOverlay && overlaySnapshot?.player)
    ? (overlaySnapshot.player as unknown as Player)
    : null;
  const soldTeam = (activeOverlay && overlaySnapshot?.team)
    ? (overlaySnapshot.team as unknown as Team)
    : null;
  const soldBid = overlaySnapshot?.bid ?? currentBid;

  return (
    <div className={`obs-overlay ${browserMode ? 'obs-overlay--mirror' : ''}`}>
      {browserMode && (
        <div className="obs-mirror-badge" aria-hidden="true">
          MIRROR MODE · READ ONLY
        </div>
      )}
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

      {/* Teams ticker — always visible marquee whenever we have team data and
          no full-screen overlay (break/squad) is active. */}
      <AnimatePresence>
        {teams.length > 0 && !isBreak && !isTeamSquad && !activeOverlay && (
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
            amount={soldBid || 0}
            onComplete={() => { animatingRef.current = false; setActiveOverlay(null); setOverlaySnapshot(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── BREAK OVERLAY (ads + sponsor carousel with timer) ─────────── */}
      <BreakOverlay
        isVisible={isBreak}
        durationSeconds={(() => {
          const total = broadcastControl?.breakDuration ?? 120;
          const started = broadcastControl?.breakStartedAt;
          const last = broadcastControl?.lastUpdate;
          if (started && last) {
            const elapsed = Math.max(0, Math.floor((last - started) / 1000));
            return Math.max(total - elapsed, 1);
          }
          return total;
        })()}
        key={`break-${broadcastControl?.breakStartedAt ?? 'n'}`}
        sponsorDisplayDuration={broadcastControl?.sponsorDisplayDuration ?? 15}
        sponsors={sponsors}
        organizerLogo={adminSettings?.organizerLogo}
        auctionTitle={adminSettings?.organizerName ? `${adminSettings.organizerName} AUCTION` : undefined}
        onClose={() => { /* OBS is read-only; actual close is driven by desktop */ }}
      />

      {/* ── TEAM STATS PANEL (standings) ──────────────────────────────── */}
      <AnimatePresence>
        {isStandings && standingsTeam && (
          <motion.div
            className="obs-team-stats"
            initial={{ x: '110%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '110%', opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          >
            <div className="obs-team-stats__header">
              {standingsTeam.logoUrl && (
                <img src={standingsTeam.logoUrl} alt="" className="obs-team-stats__logo" />
              )}
              <div className="obs-team-stats__title">{standingsTeam.name}</div>
            </div>
            <div className="obs-team-stats__grid">
              <div className="obs-team-stats__cell">
                <div className="obs-team-stats__val">{standingsTeam.playersBought ?? 0}</div>
                <div className="obs-team-stats__lbl">PLAYERS</div>
              </div>
              <div className="obs-team-stats__cell">
                <div className="obs-team-stats__val">{fmt(standingsTeam.remainingPurse ?? 0)}</div>
                <div className="obs-team-stats__lbl">PURSE</div>
              </div>
              <div className="obs-team-stats__cell">
                <div className="obs-team-stats__val">{standingsTeam.totalPlayerThreshold ?? '-'}</div>
                <div className="obs-team-stats__lbl">SLOTS</div>
              </div>
              <div className="obs-team-stats__cell">
                <div className="obs-team-stats__val">{fmt(standingsTeam.highestBid ?? 0)}</div>
                <div className="obs-team-stats__lbl">HIGHEST BID</div>
              </div>
            </div>
            {standingsTeam.captain && (
              <div className="obs-team-stats__captain">ICON: {standingsTeam.captain}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TEAM SQUAD VIEW ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isTeamSquad && squadTeam && (
          <motion.div
            className="obs-team-squad"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35 }}
          >
            <div className="obs-team-squad__header">
              {squadTeam.logoUrl && (
                <img src={squadTeam.logoUrl} alt="" className="obs-team-squad__logo" />
              )}
              <div className="obs-team-squad__name">{squadTeam.name}</div>
              <div className="obs-team-squad__meta">
                <span>{squadTeam.playersBought ?? 0} Players</span>
                <span>•</span>
                <span>Purse {fmt(squadTeam.remainingPurse ?? 0)}</span>
              </div>
            </div>
            <div className="obs-team-squad__note">
              Squad view mirrors the main screen. Detailed player grid appears on the desktop.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TEAM STANDINGS OVERLAY (press 'g') ────────────────────────── */}
      <TeamStandingsOverlay
        visible={showTeamStandings}
        onClose={() => setShowTeamStandings(false)}
        teams={teams.map(t => ({
          id: t.id,
          name: t.name,
          logoUrl: t.logoUrl,
          remainingPurse: t.remainingPurse,
          playersBought: t.playersBought ?? 0,
          totalPlayerThreshold: t.totalPlayerThreshold ?? 11,
          remainingPlayers: 0,
          allocatedAmount: 0,
          highestBid: t.highestBid ?? 0,
          captain: t.captain ?? '',
          underAgePlayers: 0,
        }))}
        soldPlayers={soldPlayersObs.map(p => ({
          id: p.id ?? '',
          name: p.name ?? (p as Record<string, unknown>).playerName as string ?? '',
          role: (((p as Record<string, unknown>).role as string) ?? 'Batsman') as PlayerRole,
          imageUrl: ((p as Record<string, unknown>).imageUrl as string) ?? '',
          basePrice: ((p as Record<string, unknown>).basePrice as number) ?? 0,
          age: ((p as Record<string, unknown>).age as number) ?? null,
          matches: '',
          runs: '',
          wickets: '',
          battingBestFigures: '',
          bowlingBestFigures: '',
          soldAmount: ((p as Record<string, unknown>).soldAmount as number) ?? 0,
          teamName: ((p as Record<string, unknown>).teamName as string) ?? '',
          teamId: ((p as Record<string, unknown>).teamId as string) ?? undefined,
          soldDate: ((p as Record<string, unknown>).timestamp as string) ?? '',
        }))}
        settings={adminSettings}
      />
    </div>
  );
}
