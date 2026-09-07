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
import { TopPicksOverlay } from '../components/Overlays/TopPicksOverlay';
import type { Player, Team, PlayerRole } from '../types';
import type { SponsorRecord, AdminSettings } from '../services/auctionPersistence';
import { tenantPath } from '../services/tenantPath';
import './OBSOverlayPage.css';
import { useOrganizerLogo, useOrganizerName } from '../store';

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
// console.log('[OBSOverlay] Initializing Firebase app for OBS overlay:', OBS_APP_NAME, getApps());
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
  place?:string | null;
  dateOfBirth?: string | null;
  battingStyle?: string; bowlingStyle?: string;
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
  customStats?: Record<string, unknown>;
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
const fmtWithSuffix = (n: number, suffix: string): string => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(2)}${suffix}`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const roleLabel = (r: string) => {
  const m: Record<string, string> = {
    batsman: 'BATTER', batter: 'BATTER', bowler: 'BOWLER',
    'all-rounder': 'ALL-ROUNDER', allrounder: 'ALL-ROUNDER',
    'wicket-keeper': 'WICKET-KEEPER', wicketkeeper: 'WICKET-KEEPER',
    'raider': 'RAIDER', raiders: 'RAIDER', defender: 'DEFENDER',
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

// ── Broadcast style: CricHeroes-style stat set (MAT, WKT, AVG, ECO, BEST) ──────
function cricHeroesStats(player: OverlayPlayer): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const matches = player.battingStats?.matches || player.bowlingStats?.matches || player.matches;
  if (matches && matches !== '0') out.push({ label: 'MATCHES', value: matches });

  const runs = player.battingStats?.runs || player.runs;
  if (runs && runs !== '0') out.push({ label: 'RUNS', value: runs });

  const wickets = player.bowlingStats?.wickets || player.wickets;
  if (wickets && wickets !== '0') out.push({ label: 'WICKETS', value: wickets });

  const avg = player.battingStats?.average;
  if (avg && avg !== '0' && avg !== '0.00') out.push({ label: 'AVERAGE', value: avg });

  const eco = player.bowlingStats?.economy;
  if (eco && eco !== '0' && eco !== '0.00') out.push({ label: 'ECONOMY', value: eco });

  const best = player.bowlingStats?.bestBowling && player.bowlingStats.bestBowling !== 'N/A'
    ? player.bowlingStats.bestBowling
    : (player.battingStats?.highestScore || player.battingBestFigures);
  if (best) out.push({ label: 'BEST', value: best });

  return out.slice(0, 6);
}

// Human-friendly meta row: batting style, bowling style, role, age
function metaRow(player: OverlayPlayer): Array<{ label: string; value: string }> {
  const role = (player.role || '').toLowerCase();
  const battingFallback = role.includes('bat') || role.includes('keep') || role.includes('all') ? 'Batter' : '—';
  const bowlingFallback = role.includes('bowl') || role.includes('all') ? 'Bowler' : '—';
  return [
    { label: 'BATTING', value: player.battingStyle || battingFallback },
    { label: 'BOWLING', value: player.bowlingStyle || bowlingFallback },
    { label: 'ROLE', value: roleLabel(player.role) },
    { label: 'AGE', value: player.age ? String(player.age) : '—' },
  ];
}

// ── BROADCAST STYLE player lower-third ────────────────────────────────────────
function BroadcastPlayerCard({
  player, currentBid, selectedTeam, playerImgSrc, teamLogoSrc, accent, fmt,
}: Readonly<{
  player: OverlayPlayer;
  currentBid: number;
  selectedTeam: OverlayTeam | null;
  playerImgSrc: string;
  teamLogoSrc: string;
  accent: string;
  fmt: (n: number) => string;
}>) {
  const stats = cricHeroesStats(player);
  const meta = metaRow(player);
  const hasBid = !!selectedTeam && currentBid > 0;
  const organizerLogo = useOrganizerLogo();
  const organizerName = useOrganizerName();

  return (
    <motion.div
      className='obsb'
      style={{ '--obsb-accent': accent } as React.CSSProperties}
      initial={{ opacity: 0, y: 120 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
    >
      <motion.div
        className='score-obs__top-bar'
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 28, delay: 0.2 }}
      >
        <div className='score-obs__top-left'>
          {organizerLogo && (
            <img
              src={organizerLogo}
              alt={organizerName}
              className='score-obs__tournament-logo'
            />
          )}
        </div>
      </motion.div>

      <div className='obsb__lower'>
        {/* Left: player image with blue gradient (fades near the ears/top) */}
        <div className='obsb__img'>
          {playerImgSrc ? (
            <img
              src={playerImgSrc}
              alt={player.name}
              className='obsb__img-el'
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = '0';
              }}
            />
          ) : (
            <div className='obsb__img-fallback'>
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className='obsb__img-grad' />
          <div className='obsb__img-role'>{roleLabel(player.role)}</div>
        </div>

        {/* Middle: round + base boxes, name, meta row */}
        <div className='obsb__mid'>
          <div className='obsb__topboxes'>
            <div className='obsb__box obsb__box--round'>
              <span className='obsb__box-lbl'>PLAYER</span>
              <span className='obsb__box-val'>
                #{(player.id || '').replace(/\D/g, '').slice(-3) || '—'}
              </span>
            </div>
            <div className='obsb__box obsb__box--base'>
              <span className='obsb__box-lbl'>BASE PRICE</span>
              <span className='obsb__box-val'>{fmt(player.basePrice)}</span>
            </div>
          </div>
          <div className='obsb__name'>{player.name}</div>
          <div className='obsb__meta'>
            {meta.map((m) => (
              <div key={m.label} className='obsb__meta-cell'>
                <span className='obsb__meta-lbl'>{m.label}</span>
                <span className='obsb__meta-val'>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: BIG current bid */}

        {/* existing one deprecated fro new ui*/}
        {
          <div className='obsb__bidwrap'>
            <AnimatePresence>
              {hasBid && (
                <motion.div
                  className='team-bid-overlay obs'
                  initial={{ opacity: 0, y: 40, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -30, scale: 0.9 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                >
                  {/* Paddle Logo — rises above the card */}
                  <motion.div
                    className='team-bid-paddle'
                    key={`paddle-${selectedTeam.id}-${currentBid}`}
                    initial={{ y: -60, scale: 0.8, opacity: 0, rotate: -20 }}
                    animate={{ y: -20, scale: 1.4, opacity: 1, rotate: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 350,
                      damping: 16,
                      delay: 0.1,
                    }}
                  >
                    <motion.div
                      className='team-bid-paddle-inner'
                      animate={{ y: [0, -1, 0], scale: [1.0, 1.4, 1.0] }}
                      transition={{
                        duration: 2.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      {teamLogoSrc && (
                        <img
                          src={teamLogoSrc}
                          alt=''
                          className='team-bid-paddle-logo'
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              'none';
                          }}
                        />
                      )}
                    </motion.div>
                    <div className='team-bid-paddle-stick' />
                    {/* Glow ring */}
                    <motion.div
                      className='team-bid-paddle-glow'
                      animate={{ y: [-8, -8, -8] }}
                      transition={{
                        duration: 2.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  </motion.div>

                  <div className='team-bid-card'>
                    {/* Blurred team logo background */}
                    {teamLogoSrc && (
                      <img
                        src={teamLogoSrc}
                        alt=''
                        className='team-bid-bg-logo'
                        aria-hidden='true'
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className='team-bid-header-row'>
                      {teamLogoSrc && (
                        <img
                          src={teamLogoSrc}
                          alt=''
                          className='team-bid-logo'
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              'none';
                          }}
                        />
                      )}
                      <div className='team-bid-name'>{selectedTeam.name}</div>
                    </div>
                    {/* Bid amount — animated on change */}
                    <motion.div
                      className='team-bid-amount'
                      key={`bid-${currentBid}`}
                      initial={{ scale: 1.3, color: '#fbbf24' }}
                      animate={{ scale: 1, color: '#ffffff' }}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 15,
                      }}
                    >
                      {fmt(hasBid ? currentBid : player.basePrice)}
                    </motion.div>
                  </div>

                  {/* Ripple burst on new bid */}
                  <motion.div
                    className='team-bid-ripple'
                    key={`ripple-${currentBid}`}
                    initial={{ scale: 0.5, opacity: 0.8 }}
                    animate={{ scale: 2.5, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* This section is commented out for now
          <div className='obsb__bid-label'>
            {hasBid ? 'CURRENT BID' : 'BASE PRICE'}
          </div>
          {
            // fmt(hasBid ? currentBid : player.basePrice)}

            hasBid && (
              <motion.div
                className='team-bid-paddle'
                key={`paddle-${selectedTeam!.id}-${currentBid}`}
                initial={{ y: -60, scale: 0.8, opacity: 0, rotate: -20 }}
                animate={{ y: -20, scale: 1.4, opacity: 1, rotate: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 350,
                  damping: 16,
                  delay: 0.1,
                }}
              >
                <motion.div
                  className='team-bid-paddle-inner'
                  animate={{ y: [0, -1, 0], scale: [1.0, 1.4, 1.0] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  {teamLogoSrc && (
                    <img
                      src={teamLogoSrc}
                      alt=''
                      className='team-bid-paddle-logo'
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                </motion.div>
                <div className='team-bid-paddle-stick' />

                <motion.div
                  className='team-bid-paddle-glow'
                  animate={{ y: [-8, -8, -8] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </motion.div>
            )

            // (
            //   <div className="obsb__bid-team">
            //     {teamLogoSrc && <img src={teamLogoSrc} alt="" className="obsb__bid-team-logo"
            //       onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
            //     <span>{selectedTeam!.name}</span>
            //   </div>
            // )
          }
          <motion.div
            className='obsb__bid-value'
            key={`bid-${hasBid ? currentBid : player.basePrice}`}
            initial={{ scale: 1.25, color: accent }}
            animate={{ scale: 1, color: '#ffffff' }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          >
            {fmt(hasBid ? currentBid : player.basePrice)}
          </motion.div>
          */}
          </div>
        }

        {/* Right: CricHeroes stats */}
        {stats.length > 0 && (
          <div className='obsb__stats'>
            <div className='obsb__stats-title'>
              <span className='obsb__stats-dot' /> PLAYER STATS
            </div>
            <div className='obsb__stats-grid'>
              {stats.map((s) => (
                <div key={s.label} className='obsb__stat'>
                  <span className='obsb__stat-val'>{s.value}</span>
                  <span className='obsb__stat-lbl'>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Bottom broadcast marquee (purse / picks / custom) ─────────────────────────
function BroadcastMarquee({
  teams, customText, fmt,
}: Readonly<{
  teams: OverlayTeam[];
  customText?: string;
  fmt: (n: number) => string;
}>) {
  const items: string[] = customText?.trim()
    ? [customText.trim()]
    : teams.map((t) =>
        `${t.name}  ·  PURSE ${fmt(t.remainingPurse)}  ·  ${t.playersBought ?? 0} PICKED`,
      );
  if (items.length === 0) return null;
  const loop = customText?.trim() ? items : [...items, ...items];

  return (
    <div className="obsb-marquee">
      <span className="obsb-marquee__tag">LIVE</span>
      <div className="obsb-marquee__viewport">
        <div className="obsb-marquee__track">
          {loop.map((text, i) => (
            <span key={`${text}-${i}`} className="obsb-marquee__item">{text}<span className="obsb-marquee__sep">✦</span></span>
          ))}
        </div>
      </div>
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
  const [marquee, setMarquee] = useState<{ enabled: boolean; text?: string } | null>(null);
  const [overlayReq, setOverlayReq] = useState<{ mode: string; teamId?: string | null; lastUpdate?: number } | null>(null);
  const [showRecentBid, setShowRecentBid] = useState(false);
  const latestVisibleBidKeyRef = useRef<string>('');
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

  // Dynamic currency format using admin-configured suffix
  const fmt = (n: number) => fmtWithSuffix(n, adminSettings?.currencySuffix || 'L');

  useEffect(() => {
    document.documentElement.classList.add('obs-overlay-host');
    document.body.classList.add('obs-overlay-host');
    return () => {
      document.documentElement.classList.remove('obs-overlay-host');
      document.body.classList.remove('obs-overlay-host');
    };
  }, []);

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

    // console.log('[OBSOverlay] Subscribing to RTDB paths:', pathState, pathControl, pathSponsors, pathAdminSet);
    // console.log('[OBSOverlay] Subscribed to state path:', state, pathState);
    const unsubState = onValue(
      ref(obsDb, pathState),
      (snap) => {
        console.log('[OBSOverlay] State snapshot received:', snap.val());
        setConnected(true);
        if (!snap.exists()) return;
        const s = snap.val() as OverlayState;
        setState(s);
        console.log('[OBSOverlay] Received state update:', s);
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
            // Safety timeout: force-clear if animation hangs
            setTimeout(() => {
              if (animatingRef.current) {
                animatingRef.current = false;
                setActiveOverlay(null);
                setOverlaySnapshot(null);
              }
            }, 8000);
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
    console.log('[OBSOverlay] Subscribed to state path:', state, pathState);
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
    // Broadcast marquee (dedicated path — controlled from connect-bidding-admin)
    const pathMarquee = tenantPath('auction/overlayMarquee');
    const unsubMarquee = onValue(
      ref(obsDb, pathMarquee),
      (snap) => { setMarquee(snap.exists() ? snap.val() : null); }
    );
    // Mobile overlay request (team stats / squad / top picks) — priority over desktop
    const pathReq = tenantPath('auction/overlayRequest');
    const unsubReq = onValue(
      ref(obsDb, pathReq),
      (snap) => { setOverlayReq(snap.exists() ? snap.val() : null); }
    );
    return () => { unsubState(); unsubControl(); unsubSponsors(); unsubAdmin(); unsubSold(); unsubMarquee(); unsubReq(); };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPlayer = state?.currentPlayer ?? null;
  const currentBid    = state?.currentBid    ?? 0;
  const selectedTeam  = state?.selectedTeam  ?? null;
  const teams         = state?.teams         ?? [];
  const bidHistory    = state?.bidHistory    ?? [];
  // Effective overlay mode: a recent, non-auction mobile request (from
  // connect-bidding-admin) overrides the desktop for the stats/squad/top-picks
  // views. A desktop 'break' always wins (full-screen). Otherwise desktop leads.
  const reqActive = !!overlayReq && overlayReq.mode !== 'auction'
    && (Date.now() - (overlayReq.lastUpdate ?? 0) < 10 * 60 * 1000);
  const desktopMode = broadcastMode;
  let effectiveMode = desktopMode;
  if (desktopMode !== 'break' && desktopMode !== 'ad' && reqActive) {
    effectiveMode = overlayReq!.mode;
  }
  const isBreak       = effectiveMode === 'break';
  const isStandings   = effectiveMode === 'standings';
  const isTeamSquad   = effectiveMode === 'teamSquad';
  const isTeamStandings = effectiveMode === 'teamStandings';
  const isTopPicks    = effectiveMode === 'topPicks';
  const reqSelectedTeamId = reqActive && effectiveMode === 'standings' ? overlayReq!.teamId : broadcastControl?.selectedTeamId;
  const reqSquadTeamId = reqActive && effectiveMode === 'teamSquad' ? overlayReq!.teamId : broadcastControl?.teamSquadTeamId;
  const overlayModeActive = isBreak || isStandings || isTeamSquad || isTeamStandings || isTopPicks;
  const hasPlayer     = !!currentPlayer && !activeOverlay && !overlayModeActive;
  const latestBid = bidHistory.at(-1) ?? null;
  // Overlay visual style (admin-configurable) + broadcast marquee control.
  const overlayStyle = adminSettings?.obsOverlayStyle ?? 'classic';
  const isBroadcastStyle = overlayStyle === 'broadcast';
  const overlayAccent = adminSettings?.obsOverlayAccent || '#1d4ed8';
  const marqueeEnabled = marquee?.enabled ?? true;
  const marqueeText = marquee?.text;
  const latestBidKey = latestBid ? `${latestBid.teamId}-${latestBid.amount}-${latestBid.timestamp}` : '';

  // Show recent bid panel briefly, then hide to keep only active team card visible.
  useEffect(() => {
    console.log('[OBSOverlay] currentPlayer changed:', currentPlayer, 'hasPlayer:', currentBid, 'latestBidKey:', latestBidKey, 'latestVisibleBidKeyRef:', latestVisibleBidKeyRef.current);
    if (!hasPlayer || !latestBidKey) {
      setShowRecentBid(false);
      return;
    }

    if (latestBidKey === latestVisibleBidKeyRef.current) return;

    latestVisibleBidKeyRef.current = latestBidKey;
    setShowRecentBid(true);
    const timer = setTimeout(() => setShowRecentBid(false), 3000);
    return () => clearTimeout(timer);
  }, [hasPlayer, latestBidKey]);

  // Focused team for standings panel
  const standingsTeam = useMemo(() => {
    if (!isStandings) return null;
    return teams.find((t) => t.id === reqSelectedTeamId) ?? teams[0] ?? null;
  }, [isStandings, reqSelectedTeamId, teams]);

  // Focused team for teamSquad view
  const squadTeam = useMemo(() => {
    if (!isTeamSquad) return null;
    return teams.find((t) => t.id === reqSquadTeamId) ?? teams[0] ?? null;
  }, [isTeamSquad, reqSquadTeamId, teams]);

  // Top picks computed from sold players
  const topBuysObs = useMemo(() => {
    return [...soldPlayersObs]
      .sort((a, b) => (b.soldAmount ?? 0) - (a.soldAmount ?? 0))
      .slice(0, 5)
      .map(p => ({
        id: p.id ?? '',
        name: p.name ?? '',
        role: 'Batsman' as PlayerRole,
        imageUrl: '',
        basePrice: 0,
        age: p.age ?? null,
        matches: '',
        runs: '',
        wickets: '',
        battingBestFigures: '',
        bowlingBestFigures: '',
        soldAmount: p.soldAmount ?? 0,
        teamName: p.teamName ?? '',
        teamId: p.teamId,
        soldDate: '',
        team: teams.find(t => t.id === p.teamId) ?? undefined,
      }));
  }, [soldPlayersObs, teams]);

  const [topBuysIndex, setTopBuysIndex] = useState(0);

  // Auto-advance top picks index when in topPicks mode
  useEffect(() => {
    if (!isTopPicks || topBuysObs.length === 0) return;
    setTopBuysIndex(0);
    const interval = setInterval(() => {
      setTopBuysIndex(prev => (prev + 1) % topBuysObs.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isTopPicks, topBuysObs.length]);

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
            <span className="obs-standby__text">OVERLAY ACTIVE · STANDBY {JSON.stringify(currentPlayer)} {JSON.stringify(activeOverlay)}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teams ticker — classic style only (broadcast style uses its own
          bottom marquee). Hidden when a full-screen overlay is active. */}
      <AnimatePresence>
        {!isBroadcastStyle && teams.length > 0 && !isBreak && !isTeamSquad && !activeOverlay && (
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

      {/* ── BROADCAST-STYLE bottom marquee (team purses / picks / custom) ── */}
      <AnimatePresence>
        {isBroadcastStyle && hasPlayer && marqueeEnabled && teams.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35 }}>
            <BroadcastMarquee teams={teams} customText={marqueeText} fmt={fmt} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BROADCAST-STYLE player lower-third ───────────────────────────── */}
      <AnimatePresence>
        {isBroadcastStyle && hasPlayer && (
          <BroadcastPlayerCard
            key="broadcast-card"
            player={currentPlayer!}
            currentBid={currentBid}
            selectedTeam={selectedTeam}
            playerImgSrc={playerImgSrc}
            teamLogoSrc={teamLogoSrc}
            accent={overlayAccent}
            fmt={fmt}
          />
        )}
      </AnimatePresence>

      {/* ── CLASSIC BOTTOM-CENTER PLAYER CARD ────────────────────────────── */}
      <AnimatePresence>
        {!isBroadcastStyle && hasPlayer && (
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

      {/* ── BID HISTORY hidden for better UX ───────────────────
      <AnimatePresence>
        {hasPlayer && latestBid && showRecentBid && (
          <motion.div className="obs-bid-history"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <span className="obs-bid-history__title">LATEST BID</span>
            <div className="obs-bid-history__list">
              <motion.div
                key={latestBidKey}
                className="obs-bid-history__item obs-bid-history__item--latest"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="obs-bid-history__team">{latestBid.teamName}</span>
                <span className="obs-bid-history__amt">{fmt(latestBid.amount)}</span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      */}

      {/* ── SOLD / UNSOLD ANIMATION ─────────────────────────────────────── */}
      <AnimatePresence>
        {activeOverlay && soldPlayer && (
          <SoldAnimation
            key={`${activeOverlay}-${soldPlayer.id ?? soldPlayer.name}`}
            type={activeOverlay}
            player={soldPlayer}
            team={soldTeam}
            amount={soldBid || 0}
            currencySuffix={adminSettings?.currencySuffix || 'L'}
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
        showOwnerOverlay={adminSettings?.branding?.showTeamOwnersInBreak !== false}
        breakContentMode={adminSettings?.branding?.breakContentMode || 'sponsors'}
        teamOwners={(() => {
          const owners = adminSettings?.teamOwners;
          if (!owners) return [];
          const result: { id: string; name: string; imageUrl?: string; brandImageUrl?: string; designation?: string; teamName: string; teamLogo?: string; teamColor?: string }[] = [];
          for (const [teamId, ownerList] of Object.entries(owners)) {
            const team = teams.find(t => t.id === teamId);
            if (!team || !ownerList) continue;
            for (const owner of ownerList) {
              result.push({ ...owner, teamName: team.name, teamLogo: team.logoUrl, teamColor: team.primaryColor });
            }
          }
          return result;
        })()}
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

      {/* ── TEAM STANDINGS OVERLAY (press 'g' or broadcastMode 'teamStandings') ── */}
      <TeamStandingsOverlay
        visible={showTeamStandings || isTeamStandings}
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

      {/* ── TOP PICKS OVERLAY (broadcastMode 'topPicks') ──────────────── */}
      <TopPicksOverlay
        visible={isTopPicks}
        onClose={() => {/* controlled by broadcast */}}
        topBuys={topBuysObs}
        currentIndex={topBuysIndex}
      />
    </div>
  );
}
