// ============================================================================
// SCORE OBS OVERLAY PAGE — /:tenantSlug/cricket/scorer/obs-overlay
// Browser source for OBS Studio — transparent background, real-time score
// strip, player stats cards, animations, L-banner ads, keyboard shortcuts.
//
// DATA: Firebase RTDB via dedicated named app "score-obs" — zero delay.
// KEYBOARD: F=[scorecard], [=striker, ]=non-striker, ;=bowler,
//           4/6=boundary, W=wicket, D=duck, H=hat-trick, Q=question, ESC=clear
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, set as fbSet } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import type {
  LiveScore, OverlayControlState, OverlayType,
  ScoringOverlayConfig, ScoringAd, MatchSetup, LiveQuestion,
  PreMatchState, MatchLineup, MatchStatsSnapshot, TournamentStats,
  ReplayTrigger, Innings, MatchScore, AnimationConfig,
} from '../types/scoring';
import PreMatchOverlay from './PreMatchOverlay';
import './ScoreOBSOverlayPage.css';

const DEFAULT_OVERLAY_CONFIG: ScoringOverlayConfig = {
  showLiveBadge: true,
  enableBoundaryAnimation: true,
  enableWicketAnimation: true,
  enableDuckOutAnimation: true,
  enableHatTrickAnimation: true,
  enableSixerAnimation: true,
  enableKeyboardShortcuts: true,
  autoOverlayEnabled: true,
  autoOverlayIntervalSeconds: 30,
  liveQuestions: [],
};

// ── Firebase: module-level synchronous init (dedicated app) ──────────────────
const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const SCORE_OBS_APP = 'score-obs';
const obsApp = getApps().find(a => a.name === SCORE_OBS_APP) ?? initializeApp(FB_CONFIG, SCORE_OBS_APP);
const obsDb = getDatabase(obsApp);

export default function ScoreOBSOverlayPage() {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [live, setLive] = useState<LiveScore | null>(null);
  // @ts-expect-error - overlay state kept for future use
  const [overlay, setOverlay] = useState<OverlayControlState | null>(null);
  const [config, setConfig] = useState<ScoringOverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [ads, setAds] = useState<ScoringAd[]>([]);
  const [preMatch, setPreMatch] = useState<PreMatchState | null>(null);
  const [lineups, setLineups] = useState<{ teamA: MatchLineup | null; teamB: MatchLineup | null }>({ teamA: null, teamB: null });
  const [rawLineups, setRawLineups] = useState<Record<string, MatchLineup>>({});
  const [playerImages, setPlayerImages] = useState<Record<string, string>>({});

  // Local overlay state (for keyboard-triggered overlays)
  const [localOverlay, setLocalOverlay] = useState<OverlayType>('none');
  const [showAd, setShowAd] = useState(false);
  const adIndexRef = useRef(0);
  const questionIndexRef = useRef(0);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStatsSnapshot | null>(null);
  const [tournamentStats, setTournamentStats] = useState<TournamentStats | null>(null);
  const [innings, setInnings] = useState<Record<string, Innings>>({});
  const [replayTrigger, setReplayTrigger] = useState<ReplayTrigger | null>(null);
  const [allMatches, setAllMatches] = useState<Record<string, { setup: MatchSetup; final?: MatchScore }>>({});

  // Get matchId from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('matchId');
    if (id) setMatchId(id);
  }, []);

  // Subscribe to Firebase data
  useEffect(() => {
    if (!matchId) return;
    const basePath = tenantPath('scoring');
    const unsubs: (() => void)[] = [];

    // Match setup
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/setup`), snap => {
      if (snap.exists()) setMatch(snap.val());
    }));

    // Live score
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/live`), snap => {
      if (snap.exists()) setLive(snap.val());
    }));

    // Overlay control (from admin/scorer)
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/overlay`), snap => {
      if (snap.exists()) {
        const ctrl = snap.val() as OverlayControlState;
        setOverlay(ctrl);
        if (ctrl.activeOverlay !== 'none') {
          setLocalOverlay(ctrl.activeOverlay);
          // Auto-dismiss animation overlays and clear Firebase state
          const animationTypes = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
          if (animationTypes.includes(ctrl.activeOverlay)) {
            if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
            const duration = ctrl.activeOverlay === 'hat_trick' ? 8000 :
              ctrl.activeOverlay === 'boundary_four' ? (config.fourAnimation?.durationMs || 3000) :
              ctrl.activeOverlay === 'boundary_six' ? (config.sixAnimation?.durationMs || 4000) :
              ctrl.activeOverlay === 'wicket' ? (config.wicketAnimation?.durationMs || 4000) : 5000;
            autoDismissRef.current = setTimeout(() => {
              setLocalOverlay('none');
              // Clear Firebase overlay state so dock can re-trigger
              fbSet(ref(obsDb, `${basePath}/matches/${matchId}/overlay`), { activeOverlay: 'none', lastUpdated: Date.now() });
            }, duration);
          }
        } else {
          setLocalOverlay('none');
        }
      }
    }));

    // Overlay config (branding)
    unsubs.push(onValue(ref(obsDb, `${basePath}/overlayConfig`), snap => {
      if (snap.exists()) {
        setConfig({ ...DEFAULT_OVERLAY_CONFIG, ...snap.val() });
      } else {
        setConfig(DEFAULT_OVERLAY_CONFIG);
      }
    }));

    // Ads
    unsubs.push(onValue(ref(obsDb, `${basePath}/ads`), snap => {
      if (!snap.exists()) { setAds([]); return; }
      const data = snap.val() as Record<string, ScoringAd>;
      setAds(Object.values(data).filter(a => a.active).sort((a, b) => a.order - b.order));
    }));

    // Pre-match state
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/preMatch`), snap => {
      if (snap.exists()) setPreMatch(snap.val());
      else setPreMatch(null);
    }));

    // Lineups (team A & B) — keyed by teamId in Firebase
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/lineups`), snap => {
      if (snap.exists()) {
        const data = snap.val() as Record<string, MatchLineup>;
        // Store raw data; resolve teamA/teamB at render using match.teamA.id
        setRawLineups(data);
      }
    }));

    // Match stats
    unsubs.push(onValue(ref(obsDb, `${basePath}/matchStats/${matchId}`), snap => {
      if (snap.exists()) setMatchStats(snap.val());
    }));

    // Tournament stats
    unsubs.push(onValue(ref(obsDb, `${basePath}/tournamentStats`), snap => {
      if (snap.exists()) setTournamentStats(snap.val());
    }));

    // Innings data (for full scorecard)
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/innings`), snap => {
      if (snap.exists()) setInnings(snap.val() as Record<string, Innings>);
    }));

    // Replay trigger
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/replayTrigger`), snap => {
      if (snap.exists()) setReplayTrigger(snap.val() as ReplayTrigger);
      else setReplayTrigger(null);
    }));

    // Player images from auction database (fallback for lineup images)
    const auctionPath = tenantPath('auction/adminPlayers');
    unsubs.push(onValue(ref(obsDb, auctionPath), snap => {
      if (snap.exists()) {
        const data = snap.val() as Record<string, { id: string; imageUrl?: string }>;
        const imgMap: Record<string, string> = {};
        for (const p of Object.values(data)) {
          if (p.imageUrl) imgMap[p.id] = p.imageUrl;
        }
        setPlayerImages(imgMap);
      }
    }));

    // All matches (for points table)
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches`), snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, { setup?: MatchSetup; final?: MatchScore }>;
      const result: Record<string, { setup: MatchSetup; final?: MatchScore }> = {};
      for (const [id, m] of Object.entries(data)) {
        if (m.setup) result[id] = { setup: m.setup, final: m.final };
      }
      setAllMatches(result);
    }));

    return () => unsubs.forEach(u => u());
  }, [matchId]);

  // Resolve raw lineups to teamA/teamB using match setup team IDs
  useEffect(() => {
    if (!match || Object.keys(rawLineups).length === 0) return;
    const teamALineup = rawLineups[match.teamA.id] || null;
    const teamBLineup = rawLineups[match.teamB.id] || null;
    // Fallback: if teamIds don't match keys, use first two entries
    if (!teamALineup && !teamBLineup) {
      const values = Object.values(rawLineups);
      setLineups({ teamA: values[0] || null, teamB: values[1] || null });
    } else {
      setLineups({ teamA: teamALineup, teamB: teamBLineup });
    }
  }, [match, rawLineups]);

  // Auto-dismiss overlay after duration
  const triggerOverlay = useCallback((type: OverlayType, durationMs = 5000) => {
    setLocalOverlay(type);
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    if (type !== 'none' && type !== 'full_scorecard') {
      autoDismissRef.current = setTimeout(() => setLocalOverlay('none'), durationMs);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!config.enableKeyboardShortcuts) return;
      const key = e.key;
      if (key === 'f' || key === 'F') triggerOverlay('full_scorecard');
      else if (key === '[') triggerOverlay('batsman_striker', 6000);
      else if (key === ']') triggerOverlay('batsman_nonstriker', 6000);
      else if (key === ';' || key === "'") triggerOverlay('bowler', 6000);
      else if (key === '4') triggerOverlay('boundary_four', config.fourAnimation?.durationMs || 3000);
      else if (key === '6') triggerOverlay('boundary_six', config.sixAnimation?.durationMs || 4000);
      else if (key === 'w' || key === 'W') triggerOverlay('wicket', config.wicketAnimation?.durationMs || 4000);
      else if (key === 'd' || key === 'D') triggerOverlay('duck_out', 5000);
      else if (key === 'h' || key === 'H') triggerOverlay('hat_trick', 8000);
      else if (key === 'q' || key === 'Q') {
        triggerOverlay('live_question', (config?.liveQuestions?.[questionIndexRef.current]?.duration || 10) * 1000);
        questionIndexRef.current = ((questionIndexRef.current + 1) % (config?.liveQuestions?.length || 1));
      }
      else if (key === 'Escape') { setLocalOverlay('none'); if (autoDismissRef.current) clearTimeout(autoDismissRef.current); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [triggerOverlay, config]);

  // Auto-rotate full scorecard + player/bowler stat overlays
  useEffect(() => {
    if (!live || !config.autoOverlayEnabled) return;
    const sequence: OverlayType[] = ['full_scorecard', 'batsman_striker', 'batsman_nonstriker', 'bowler'];
    let idx = 0;
    const intervalMs = Math.max(10, config.autoOverlayIntervalSeconds || 30) * 1000;
    const timer = setInterval(() => {
      triggerOverlay(sequence[idx], sequence[idx] === 'full_scorecard' ? 7000 : 5000);
      idx = (idx + 1) % sequence.length;
    }, intervalMs);
    return () => clearInterval(timer);
  }, [live, config.autoOverlayEnabled, config.autoOverlayIntervalSeconds, triggerOverlay]);

  // L-banner ad rotation
  useEffect(() => {
    if (ads.length === 0) return;
    const lBannerAds = ads.filter(a => a.position === 'l-banner');
    if (lBannerAds.length === 0) return;
    const interval = setInterval(() => {
      setShowAd(true);
      adIndexRef.current = (adIndexRef.current + 1) % lBannerAds.length;
      setTimeout(() => setShowAd(false), (lBannerAds[adIndexRef.current]?.durationSeconds || 10) * 1000);
    }, 30000);
    return () => clearInterval(interval);
  }, [ads]);

  if (!matchId) return null;

  // Pre-match overlay (before live score exists)
  const isPreMatch = preMatch && preMatch.phase !== 'idle' && preMatch.phase !== 'match_ready';
  if (isPreMatch && match) {
    return (
      <div className="score-obs">
        {/* Top bar during pre-match */}
        <div className="score-obs__top-bar">
          <div className="score-obs__top-left">
            {config.tournamentLogo && <img src={config.tournamentLogo} alt="" className="score-obs__tournament-logo" />}
            {config.tournamentName && <span className="score-obs__tournament-name">{config.tournamentName}</span>}
          </div>
          <div className="score-obs__top-right">
            {config.broadcastPartnerLogo && <img src={config.broadcastPartnerLogo} alt="" className="score-obs__partner-logo" />}
            {config.broadcastPartnerName && <span className="score-obs__partner-name">{config.broadcastPartnerName}</span>}
          </div>
        </div>
        <PreMatchOverlay match={match} preMatch={preMatch} config={config} lineups={lineups} />
      </div>
    );
  }

  if (!live) return null;

  const effectiveOverlay = localOverlay;
  const lBannerAds = ads.filter(a => a.position === 'l-banner');
  const currentAd = lBannerAds[adIndexRef.current % Math.max(lBannerAds.length, 1)];
  const currentQuestion = config?.liveQuestions?.[
    (questionIndexRef.current - 1 + (config?.liveQuestions?.length || 1)) % (config?.liveQuestions?.length || 1)
  ];

  const battingTeamName = match
    ? (live.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name)
    : '';
  const bowlingTeamName = match
    ? (live.bowlingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name)
    : '';

  return (
    <div className="score-obs">
      {/* ── Top Bar: Tournament + LIVE + Broadcast Partner ──────────── */}
      <motion.div
        className="score-obs__top-bar"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 28, delay: 0.2 }}
      >
        <div className="score-obs__top-left">
          {config.tournamentLogo && (
            <img src={config.tournamentLogo} alt="" className="score-obs__tournament-logo" />
          )}
          {config.tournamentName && (
            <span className="score-obs__tournament-name">{config.tournamentName}</span>
          )}
        </div>
        <div className="score-obs__top-right">
          {config.showLiveBadge && (
            <span className="score-obs__live-badge">● LIVE</span>
          )}
          {config.broadcastPartnerLogo && (
            <img src={config.broadcastPartnerLogo} alt="" className="score-obs__partner-logo" />
          )}
          {config.broadcastPartnerName && (
            <span className="score-obs__partner-name">{config.broadcastPartnerName}</span>
          )}
        </div>
      </motion.div>

      {/* ── Score Ticker (always visible when live) ──────────────── */}
      {live && match && (
        <ScorecardTicker
          live={live}
          match={match}
          battingTeam={battingTeamName}
          bowlingTeam={bowlingTeamName}
          config={config}
          lineups={lineups}
          playerImages={playerImages}
        />
      )}

      {/* ── Title Sponsor Strip ────────────────────────────────────── */}
      {config.titleSponsorLogo && (
        <div className="score-obs__sponsor-strip">
          <img src={config.titleSponsorLogo} alt="" className="score-obs__sponsor-logo" />
          {config.titleSponsorName && <span className="score-obs__sponsor-name">{config.titleSponsorName}</span>}
        </div>
      )}

      {/* ── L-Banner Ad ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAd && currentAd && (
          <motion.div
            className="score-obs__l-banner"
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <img src={currentAd.imageUrl} alt={currentAd.name} className="score-obs__l-banner-img" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Overlay Components ─────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {effectiveOverlay === 'batsman_striker' && live.currentBatsmen?.[0] && (
          <BatsmanStatsOverlay key="striker" batsman={live.currentBatsmen[0]} />
        )}
        {effectiveOverlay === 'batsman_nonstriker' && live.currentBatsmen?.[1] && (
          <BatsmanStatsOverlay key="non-striker" batsman={live.currentBatsmen[1]} />
        )}
        {effectiveOverlay === 'bowler' && (
          <BowlerStatsOverlay bowler={live.currentBowler} />
        )}
        {effectiveOverlay === 'full_scorecard' && (
          <FullScorecardOverlay live={live} battingTeam={battingTeamName} bowlingTeam={bowlingTeamName} />
        )}
        {effectiveOverlay === 'boundary_four' && config.enableBoundaryAnimation && (
          <BoundaryOverlay type="four" animConfig={config.fourAnimation} />
        )}
        {effectiveOverlay === 'boundary_six' && config.enableSixerAnimation && (
          <BoundaryOverlay type="six" animConfig={config.sixAnimation} />
        )}
        {effectiveOverlay === 'wicket' && config.enableWicketAnimation && (
          <WicketOverlay imageUrl={config.wicketImageUrl} animConfig={config.wicketAnimation} />
        )}
        {effectiveOverlay === 'duck_out' && config.enableDuckOutAnimation && (
          <DuckOutOverlay imageUrl={config.duckOutImageUrl} />
        )}
        {effectiveOverlay === 'hat_trick' && config.enableHatTrickAnimation && (
          <HatTrickOverlay imageUrl={config.hatTrickImageUrl} />
        )}
        {effectiveOverlay === 'live_question' && currentQuestion && (
          <QuestionOverlay question={currentQuestion} />
        )}
        {effectiveOverlay === 'stats_fours' && matchStats && (
          <StatsListOverlay
            title="FOURS"
            items={matchStats.topRunScorers?.map(p => ({
              name: p.playerName,
              value: String(p.fours || 0),
            })) || []}
          />
        )}
        {effectiveOverlay === 'stats_sixes' && matchStats && (
          <StatsListOverlay
            title="SIXES"
            items={matchStats.topRunScorers?.map(p => ({
              name: p.playerName,
              value: String(p.sixes || 0),
            })).sort((a, b) => Number(b.value) - Number(a.value)) || []}
          />
        )}
        {effectiveOverlay === 'stats_sr' && matchStats && (
          <StatsListOverlay
            title="STRIKE RATE"
            items={matchStats.topRunScorers?.filter(p => p.balls >= 10).map(p => ({
              name: p.playerName,
              value: String(p.strikeRate),
            })).sort((a, b) => Number(b.value) - Number(a.value)) || []}
          />
        )}
        {effectiveOverlay === 'stats_mvp' && matchStats && (
          <StatsListOverlay
            title="MVP POINTS"
            items={matchStats.mvpPoints?.slice(0, 5).map(p => ({
              name: p.playerName,
              value: String(p.totalPoints.toFixed(1)),
            })) || []}
          />
        )}
        {effectiveOverlay === 'match_summary' && matchStats && match && (
          <MatchSummaryOverlay matchStats={matchStats} match={match} innings={innings} />
        )}
        {effectiveOverlay === 'award_orange_cap' && tournamentStats && (
          <AwardOverlay
            title="ORANGE CAP"
            subtitle="Most Runs"
            color="#f97316"
            playerName={tournamentStats.topRunScorers?.[0]?.playerName || ''}
            value={`${tournamentStats.topRunScorers?.[0]?.totalRuns || 0} runs`}
          />
        )}
        {effectiveOverlay === 'award_purple_cap' && tournamentStats && (
          <AwardOverlay
            title="PURPLE CAP"
            subtitle="Most Wickets"
            color="#a855f7"
            playerName={tournamentStats.topWicketTakers?.[0]?.playerName || ''}
            value={`${tournamentStats.topWicketTakers?.[0]?.totalWickets || 0} wickets`}
          />
        )}
        {effectiveOverlay === 'points_table' && (
          <PointsTableOverlay allMatches={allMatches} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAY SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function getBallClass(ball: string): string {
  if (ball === 'W') return 'score-obs__ball--wicket';
  if (ball === '4') return 'score-obs__ball--four';
  if (ball === '6') return 'score-obs__ball--six';
  if (ball === '0') return 'score-obs__ball--dot';
  return '';
}

function BatsmanStatsOverlay({ batsman }: { batsman: { playerId: string; playerName: string; runs: number; balls: number; fours: number; sixes: number; strikeRate: number; isOnStrike: boolean } }) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__batsman-card"
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__card-header">
        {batsman.isOnStrike && <span className="score-obs__strike-indicator">●</span>}
        <span className="score-obs__card-name">{batsman.playerName}</span>
      </div>
      <div className="score-obs__card-stats">
        <div className="score-obs__stat-main">
          <span className="score-obs__stat-value score-obs__stat-value--big">{batsman.runs}</span>
          <span className="score-obs__stat-label">({batsman.balls})</span>
        </div>
        <div className="score-obs__stat-row">
          <span className="score-obs__stat-item">4s: {batsman.fours}</span>
          <span className="score-obs__stat-item">6s: {batsman.sixes}</span>
          <span className="score-obs__stat-item">SR: {batsman.strikeRate}</span>
        </div>
      </div>
    </motion.div>
  );
}

function BowlerStatsOverlay({ bowler }: { bowler: { playerId: string; playerName: string; overs: number; maidens: number; runs: number; wickets: number; economy: number; dots: number } }) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__bowler-card"
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__card-header">
        <span className="score-obs__card-name">{bowler.playerName}</span>
      </div>
      <div className="score-obs__card-stats">
        <div className="score-obs__stat-main">
          <span className="score-obs__stat-value score-obs__stat-value--big">{bowler.wickets}/{bowler.runs}</span>
          <span className="score-obs__stat-label">({bowler.overs} ov)</span>
        </div>
        <div className="score-obs__stat-row">
          <span className="score-obs__stat-item">Eco: {bowler.economy}</span>
          <span className="score-obs__stat-item">Dots: {bowler.dots}</span>
          <span className="score-obs__stat-item">Mdns: {bowler.maidens}</span>
        </div>
      </div>
    </motion.div>
  );
}

function FullScorecardOverlay({ live, battingTeam }: {
  live: LiveScore; battingTeam: string; bowlingTeam: string;
}) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__scorecard"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__scorecard-header">
        <span className="score-obs__scorecard-team">{battingTeam}</span>
        <span className="score-obs__scorecard-score">{live.runs}/{live.wickets} ({live.overs} ov)</span>
      </div>

      <div className="score-obs__scorecard-section">
        <div className="score-obs__scorecard-row score-obs__scorecard-row--header">
          <span>Batsman</span><span>R</span><span>B</span><span>4s</span><span>6s</span><span>SR</span>
        </div>
        {(live.currentBatsmen || []).map(b => (
          <div key={b.playerId} className="score-obs__scorecard-row">
            <span>{b.playerName} {b.isOnStrike ? '●' : ''}</span>
            <span>{b.runs}</span><span>{b.balls}</span>
            <span>{b.fours}</span><span>{b.sixes}</span><span>{b.strikeRate}</span>
          </div>
        ))}
      </div>

      <div className="score-obs__scorecard-section">
        <div className="score-obs__scorecard-row score-obs__scorecard-row--header">
          <span>Bowler</span><span>O</span><span>M</span><span>R</span><span>W</span><span>Eco</span>
        </div>
        {live.currentBowler && (
        <div className="score-obs__scorecard-row">
          <span>{live.currentBowler.playerName}</span>
          <span>{live.currentBowler.overs}</span><span>{live.currentBowler.maidens}</span>
          <span>{live.currentBowler.runs}</span><span>{live.currentBowler.wickets}</span>
          <span>{live.currentBowler.economy}</span>
        </div>
        )}
      </div>

      <div className="score-obs__scorecard-footer">
        <span>CRR: {live.runRate}</span>
        {live.requiredRate !== undefined && <span>RRR: {live.requiredRate}</span>}
        <span>P'ship: {(live.partnership || { runs: 0, balls: 0 }).runs}({(live.partnership || { runs: 0, balls: 0 }).balls})</span>
      </div>
    </motion.div>
  );
}

// ── Chroma Key Video Component ────────────────────────────────────────────────
function ChromaKeyVideo({ src, chromaColor, similarity, className }: {
  src: string;
  chromaColor: string;
  similarity: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Parse hex color to RGB
    const hex = chromaColor.replace('#', '');
    const keyR = parseInt(hex.substring(0, 2), 16);
    const keyG = parseInt(hex.substring(2, 4), 16);
    const keyB = parseInt(hex.substring(4, 6), 16);
    const threshold = similarity * 442; // max distance = sqrt(255^2*3) ≈ 442

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const draw = () => {
      if (video.paused || video.ended) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const dist = Math.sqrt((r - keyR) ** 2 + (g - keyG) ** 2 + (b - keyB) ** 2);
        if (dist < threshold) {
          data[i + 3] = 0; // set alpha to 0 (transparent)
        }
      }
      ctx.putImageData(imageData, 0, 0);
      animRef.current = requestAnimationFrame(draw);
    };

    video.addEventListener('play', () => { animRef.current = requestAnimationFrame(draw); });
    if (!video.paused) animRef.current = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(animRef.current); };
  }, [chromaColor, similarity]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} className="score-obs__celebration-video" />
    </div>
  );
}

function BoundaryOverlay({ type, animConfig }: { type: 'four' | 'six'; animConfig?: AnimationConfig }) {
  const isSix = type === 'six';
  const defaultText = isSix ? 'MAXIMUM!' : 'FOUR!';
  const defaultColor = isSix ? '#8b5cf6' : '#22c55e';
  const text = animConfig?.text || defaultText;
  const color = animConfig?.color || defaultColor;
  const scale = animConfig?.scale || (isSix ? 1.2 : 1);

  // Custom media (image/video)
  if (animConfig?.type === 'image' && animConfig.mediaUrl) {
    return (
      <motion.div
        className={`score-obs__celebration score-obs__celebration--${type}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <img src={animConfig.mediaUrl} alt={text} className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  if (animConfig?.type === 'video' && animConfig.mediaUrl) {
    return (
      <motion.div
        className={`score-obs__celebration score-obs__celebration--${type}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {animConfig.chromaKeyEnabled ? (
          <ChromaKeyVideo
            src={animConfig.mediaUrl}
            chromaColor={animConfig.chromaKeyColor || '#00ff00'}
            similarity={animConfig.chromaKeySimilarity || 0.4}
            className="score-obs__celebration-chroma"
          />
        ) : (
          <video src={animConfig.mediaUrl} autoPlay muted playsInline className="score-obs__celebration-video" />
        )}
      </motion.div>
    );
  }

  // Default CSS animation
  return (
    <motion.div
      className={`score-obs__celebration score-obs__celebration--${type}`}
      initial={{ scale: 0, rotate: -15 }}
      animate={{ scale, rotate: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span className="score-obs__celebration-num" style={{ color, textShadow: `0 0 30px ${color}80` }}>{isSix ? '6' : '4'}</span>
      <span className="score-obs__celebration-text" style={{ color }}>{text}</span>
    </motion.div>
  );
}

function WicketOverlay({ imageUrl, animConfig }: { imageUrl?: string; animConfig?: AnimationConfig }) {
  const text = animConfig?.text || 'WICKET!';
  const color = animConfig?.color || '#ef4444';
  const scale = animConfig?.scale || 1;

  // Custom media from animConfig takes priority
  if (animConfig?.type === 'image' && animConfig.mediaUrl) {
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--wicket"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1, scale }}
        exit={{ y: 50, opacity: 0 }}
      >
        <img src={animConfig.mediaUrl} alt={text} className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  if (animConfig?.type === 'video' && animConfig.mediaUrl) {
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--wicket"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {animConfig.chromaKeyEnabled ? (
          <ChromaKeyVideo
            src={animConfig.mediaUrl}
            chromaColor={animConfig.chromaKeyColor || '#00ff00'}
            similarity={animConfig.chromaKeySimilarity || 0.4}
            className="score-obs__celebration-chroma"
          />
        ) : (
          <video src={animConfig.mediaUrl} autoPlay muted playsInline className="score-obs__celebration-video" />
        )}
      </motion.div>
    );
  }

  // Legacy imageUrl support
  if (imageUrl) {
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--wicket"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
      >
        <img src={imageUrl} alt="Wicket" className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  // Default CSS animation
  return (
    <motion.div
      className="score-obs__celebration score-obs__celebration--wicket"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1, scale }}
      exit={{ y: 50, opacity: 0 }}
    >
      <span className="score-obs__celebration-num" style={{ color, textShadow: `0 0 30px ${color}80` }}>W</span>
      <span className="score-obs__celebration-text" style={{ color }}>{text}</span>
    </motion.div>
  );
}

function DuckOutOverlay({ imageUrl }: { imageUrl?: string }) {
  return (
    <motion.div
      className="score-obs__celebration score-obs__celebration--duck"
      initial={{ scale: 0, rotate: 10 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0 }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="Duck Out" className="score-obs__celebration-img" />
      ) : (
        <>
          <span className="score-obs__celebration-emoji">🦆</span>
          <span className="score-obs__celebration-text">DUCK OUT!</span>
        </>
      )}
    </motion.div>
  );
}

function HatTrickOverlay({ imageUrl }: { imageUrl?: string }) {
  return (
    <motion.div
      className="score-obs__celebration score-obs__celebration--hattrick"
      initial={{ scale: 0 }}
      animate={{ scale: [0, 1.3, 1] }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="Hat-Trick" className="score-obs__celebration-img" />
      ) : (
        <>
          <span className="score-obs__celebration-emoji">🎩</span>
          <span className="score-obs__celebration-text">HAT-TRICK!</span>
        </>
      )}
    </motion.div>
  );
}

function QuestionOverlay({ question }: { question: LiveQuestion }) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__question"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 50, opacity: 0 }}
    >
      <div className="score-obs__question-text">{question.text}</div>
      {question.options && (
        <div className="score-obs__question-options">
          {question.options.map((opt, i) => (
            <span key={i} className="score-obs__question-option">
              <span className="score-obs__question-letter">{String.fromCharCode(65 + i)}</span>
              {opt}
            </span>
          ))}
        </div>
      )}
      {question.imageUrl && (
        <img src={question.imageUrl} alt="" className="score-obs__question-img" />
      )}
    </motion.div>
  );
}

// ── Stats List Overlay ──

function StatsListOverlay({ title, items }: {
  title: string;
  items: { name: string; value: string }[];
}) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__stats-list"
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__stats-title">{title}</div>
      <div className="score-obs__stats-items">
        {items.slice(0, 5).map((item, i) => (
          <div key={i} className="score-obs__stats-item">
            <span className="score-obs__stats-rank">{i + 1}</span>
            <span className="score-obs__stats-name">{item.name}</span>
            <span className="score-obs__stats-value">{item.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Match Summary Overlay ──

function MatchSummaryOverlay({ matchStats, match, innings }: {
  matchStats: MatchStatsSnapshot;
  match: MatchSetup;
  innings: Record<string, Innings>;
}) {
  const inn1 = innings['1'];
  const inn2 = innings['2'];
  
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__match-summary"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
    >
      <div className="score-obs__summary-header">MATCH SUMMARY</div>
      <div className="score-obs__summary-scores">
        {inn1 && (
          <div className="score-obs__summary-innings">
            <span className="score-obs__summary-team">
              {inn1.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name}
            </span>
            <span className="score-obs__summary-total">
              {inn1.totalRuns}/{inn1.totalWickets} ({inn1.totalOvers} ov)
            </span>
          </div>
        )}
        {inn2 && (
          <div className="score-obs__summary-innings">
            <span className="score-obs__summary-team">
              {inn2.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name}
            </span>
            <span className="score-obs__summary-total">
              {inn2.totalRuns}/{inn2.totalWickets} ({inn2.totalOvers} ov)
            </span>
          </div>
        )}
      </div>
      {matchStats.mvpPoints && matchStats.mvpPoints.length > 0 && (
        <div className="score-obs__summary-mvp">
          <span className="score-obs__summary-mvp-label">Player of the Match</span>
          <span className="score-obs__summary-mvp-name">{matchStats.mvpPoints[0].playerName}</span>
          <span className="score-obs__summary-mvp-points">{matchStats.mvpPoints[0].totalPoints.toFixed(1)} pts</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Award Overlay ──

function AwardOverlay({ title, subtitle, color, playerName, value }: {
  title: string;
  subtitle: string;
  color: string;
  playerName: string;
  value: string;
}) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__award"
      style={{ '--award-color': color } as React.CSSProperties}
      initial={{ scale: 0, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <div className="score-obs__award-title" style={{ color }}>{title}</div>
      <div className="score-obs__award-subtitle">{subtitle}</div>
      <div className="score-obs__award-player">{playerName}</div>
      <div className="score-obs__award-value">{value}</div>
    </motion.div>
  );
}

// ── Scorecard Ticker (bottom bar for broadcast) ──

function ScorecardTicker({ live, match, battingTeam, bowlingTeam, config, lineups, playerImages }: {
  live: LiveScore;
  match: MatchSetup;
  battingTeam: string;
  bowlingTeam: string;
  config: ScoringOverlayConfig;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  playerImages: Record<string, string>;
}) {
  const ticker = config.tickerConfig;
  const position = ticker?.position || 'bottom';
  const design = ticker?.design || 'glass';
  const dotBallSymbol = ticker?.dotBallSymbol || '0';

  const battingLogo = live.battingTeamId === match.teamA.id ? match.teamA.logoUrl : match.teamB.logoUrl;
  const bowlingLogo = live.bowlingTeamId === match.teamA.id ? match.teamA.logoUrl : match.teamB.logoUrl;

  // Build player image lookup from lineups + fallback from auction DB
  const playerImageMap: Record<string, string> = { ...playerImages };
  [lineups.teamA, lineups.teamB].forEach(l => {
    l?.players?.forEach(p => { if (p.imageUrl) playerImageMap[p.playerId] = p.imageUrl; });
  });

  const designClass = design === 'premium' ? ' score-ticker--premium' : '';

  // ── Premium Design ──
  if (design === 'premium') {
    return (
      <motion.div
        className={`score-ticker score-ticker--${position} score-ticker--premium`}
        initial={{ y: position === 'bottom' ? 80 : -80, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 26, delay: 0.4 }}
      >
        {/* Left: Batting team logo */}
        <div className="score-ticker__logo-glass">
          {battingLogo
            ? <img src={battingLogo} alt={battingTeam} className="score-ticker__prem-logo" />
            : <div className="score-ticker__team-logo-fallback">{battingTeam.slice(0, 3).toUpperCase()}</div>
          }
        </div>

        {/* Score section: matchup + big score */}
        <div className="score-ticker__score-section">
          <div className="score-ticker__prem-matchup">
            {battingTeam.toUpperCase()} <span className="score-ticker__prem-vs">vs</span> {bowlingTeam.toUpperCase()}
          </div>
          <div className="score-ticker__prem-score-row">
            <span className="score-ticker__prem-score">{live.runs}-{live.wickets}</span>
            <span className="score-ticker__prem-overs">({live.overs} ov)</span>
          </div>
        </div>

        {/* Middle: Batsmen with full-height transparent PNG portraits */}
        <div className="score-ticker__prem-batsmen">
          {(live.currentBatsmen || []).map(b => (
            <div key={b.playerId} className="score-ticker__prem-bat">
              <div className="score-ticker__prem-bat-portrait">
                {playerImageMap[b.playerId]
                  ? <img src={playerImageMap[b.playerId]} alt={b.playerName} className="score-ticker__prem-bat-img" />
                  : <div className="score-ticker__prem-bat-placeholder">{b.playerName.charAt(0)}</div>
                }
              </div>
              <div className="score-ticker__prem-bat-info">
                <span className="score-ticker__prem-bat-name">{b.playerName.split(' ').slice(0, 2).join(' ').toUpperCase()}</span>
                <div className="score-ticker__prem-bat-stats">
                  <span className="score-ticker__prem-bat-runs">{b.runs}</span>
                  <span className="score-ticker__prem-bat-balls">{b.balls}</span>
                  {b.isOnStrike && <span className="score-ticker__prem-bat-icon">🏏</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Gold panel with bowler image + stats + over balls */}
        <div className="score-ticker__gold-panel">
          <div className="score-ticker__gold-bowler-portrait">
            {playerImageMap[live.currentBowler.playerId]
              ? <img src={playerImageMap[live.currentBowler.playerId]} alt={live.currentBowler.playerName} className="score-ticker__gold-bowler-img" />
              : <div className="score-ticker__gold-bowler-placeholder">{live.currentBowler.playerName.charAt(0)}</div>
            }
          </div>
          <div className="score-ticker__gold-bowler">
            <div className="score-ticker__gold-bowler-name">
              {live.currentBowler.playerName.toUpperCase()}
            </div>
            <div className="score-ticker__gold-bowler-figures">
              {live.currentBowler.wickets}-{live.currentBowler.runs} ({live.currentBowler.overs})
            </div>
            {/* This over balls */}
            <div className="score-ticker__prem-over-balls">
              {(() => {
                // Show last completed over balls if current over is empty (over just ended, awaiting new bowler)
                const ballsToShow = (live.currentOverBalls || []).length > 0
                  ? live.currentOverBalls
                  : (live.lastCompletedOverBalls || []);
                return Array.from({ length: 6 }).map((_, i) => {
                  const ball = ballsToShow[i];
                  return (
                    <span
                      key={i}
                      className={`score-ticker__prem-ball ${ball ? (
                        ball === 'W' ? 'score-ticker__prem-ball--wicket' :
                        ball === '4' ? 'score-ticker__prem-ball--four' :
                        ball === '6' ? 'score-ticker__prem-ball--six' :
                        ball === '0' ? 'score-ticker__prem-ball--dot' :
                        'score-ticker__prem-ball--filled'
                      ) : 'score-ticker__prem-ball--empty'}`}
                    >
                      {ball === '0' ? dotBallSymbol : (ball || '')}
                    </span>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Far right: Bowling team logo */}
        <div className="score-ticker__prem-team-badge">
          {bowlingLogo
            ? <img src={bowlingLogo} alt={bowlingTeam} className="score-ticker__prem-team-badge-img" />
            : <div className="score-ticker__team-logo-fallback">{bowlingTeam.slice(0, 3).toUpperCase()}</div>
          }
        </div>

        {/* Powerplay badge */}
        {live.isPowerplay && (
          <div className="score-ticker__powerplay">PP</div>
        )}

        {/* Target chase info */}
        {live.target !== undefined && live.currentInnings === 2 && (
          <div className="score-ticker__target-info">
            Need {live.target - live.runs} off {Math.max(0, (match.maxOvers * 6 - Math.floor(live.overs) * 6 - Math.round((live.overs % 1) * 10)))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── Glass Design (default) ──
  return (
    <motion.div
      className={`score-ticker score-ticker--${position}`}
      initial={{ y: position === 'bottom' ? 80 : -80, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 26, delay: 0.4 }}
    >
      {/* Batting team logo */}
      <div className="score-ticker__logo-section">
        {battingLogo
          ? <img src={battingLogo} alt={battingTeam} className="score-ticker__team-logo" />
          : <div className="score-ticker__team-logo-fallback">{battingTeam.slice(0, 3).toUpperCase()}</div>
        }
      </div>

      {/* Batsmen stats */}
      <div className="score-ticker__batsmen">
        {(live.currentBatsmen || []).map(b => (
          <div key={b.playerId} className={`score-ticker__bat ${b.isOnStrike ? 'score-ticker__bat--strike' : ''}`}>
            <div className="score-ticker__bat-indicator">
              {b.isOnStrike && <span className="score-ticker__strike-icon" />}
            </div>
            <span className="score-ticker__bat-name">{b.playerName.split(' ').pop()?.toUpperCase()}</span>
            <div className="score-ticker__bat-figures">
              <span className="score-ticker__bat-runs">{b.runs}</span>
              <span className="score-ticker__bat-balls">{b.balls}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Center score pill */}
      <div className="score-ticker__center-pill">
        <div className="score-ticker__matchup">
          <span className="score-ticker__matchup-bowling">{bowlingTeam.slice(0, 3).toUpperCase()}</span>
          <span className="score-ticker__matchup-vs">v</span>
          <span className="score-ticker__matchup-batting">{battingTeam.slice(0, 3).toUpperCase()}</span>
        </div>
        <div className="score-ticker__score-row">
          <div className="score-ticker__score-badge">
            <span className="score-ticker__score-value">{live.runs}-{live.wickets}</span>
          </div>
          {live.currentInnings === 2 && (
            <span className="score-ticker__innings-badge">P2</span>
          )}
          <span className="score-ticker__overs-value">{live.overs}</span>
        </div>
        <div className="score-ticker__rate-line">
          RUN RATE {live.runRate}
          {live.requiredRate !== undefined && <span> &middot; REQ {live.requiredRate}</span>}
        </div>
      </div>

      {/* Bowler stats + this over */}
      <div className="score-ticker__bowler-section">
        <div className="score-ticker__bowler-info">
          <span className="score-ticker__bowler-name">{live.currentBowler.playerName.split(' ').pop()?.toUpperCase()}</span>
          <div className="score-ticker__bowler-figures">
            <span className="score-ticker__bowler-wkts">{live.currentBowler.wickets}-{live.currentBowler.runs}</span>
            <span className="score-ticker__bowler-overs">({live.currentBowler.overs})</span>
          </div>
        </div>
        {/* This over balls */}
        <div className="score-ticker__over-balls">
          {(() => {
            const ballsToShow = (live.currentOverBalls || []).length > 0
              ? live.currentOverBalls
              : (live.lastCompletedOverBalls || []);
            return Array.from({ length: 6 }).map((_, i) => {
              const ball = ballsToShow[i];
              return (
                <span
                  key={i}
                  className={`score-ticker__ball ${ball ? (
                    ball === 'W' ? 'score-ticker__ball--wicket' :
                    ball === '4' ? 'score-ticker__ball--four' :
                    ball === '6' ? 'score-ticker__ball--six' :
                    ball === '0' ? 'score-ticker__ball--dot' :
                    'score-ticker__ball--filled'
                  ) : 'score-ticker__ball--empty'}`}
                >
                  {ball === '0' ? dotBallSymbol : (ball || '')}
                </span>
              );
            });
          })()}
        </div>
      </div>

      {/* Bowling team logo */}
      <div className="score-ticker__logo-section score-ticker__logo-section--right">
        {bowlingLogo
          ? <img src={bowlingLogo} alt={bowlingTeam} className="score-ticker__team-logo" />
          : <div className="score-ticker__team-logo-fallback">{bowlingTeam.slice(0, 3).toUpperCase()}</div>
        }
      </div>

      {/* Powerplay badge */}
      {live.isPowerplay && (
        <div className="score-ticker__powerplay">PP</div>
      )}

      {/* Target chase info */}
      {live.target !== undefined && live.currentInnings === 2 && (
        <div className="score-ticker__target-info">
          Need {live.target - live.runs} off {Math.max(0, (match.maxOvers * 6 - Math.floor(live.overs) * 6 - Math.round((live.overs % 1) * 10)))}
        </div>
      )}
    </motion.div>
  );
}

// ── Points Table Overlay ──

interface TeamStanding {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  nrr: number;
  points: number;
}

function PointsTableOverlay({ allMatches }: { allMatches: Record<string, { setup: MatchSetup; final?: MatchScore }> }) {
  // Compute standings from completed matches
  const standings: Record<string, TeamStanding> = {};

  for (const m of Object.values(allMatches)) {
    const { setup, final: matchScore } = m;
    if (setup.status !== 'completed' || !matchScore?.result) continue;

    // Ensure both teams exist
    for (const team of [setup.teamA, setup.teamB]) {
      if (!standings[team.id]) {
        standings[team.id] = { teamId: team.id, teamName: team.name, played: 0, won: 0, lost: 0, nrr: 0, points: 0 };
      }
    }

    standings[setup.teamA.id].played++;
    standings[setup.teamB.id].played++;

    if (matchScore.result.winner === setup.teamA.id) {
      standings[setup.teamA.id].won++;
      standings[setup.teamA.id].points += 2;
      standings[setup.teamB.id].lost++;
    } else if (matchScore.result.winner === setup.teamB.id) {
      standings[setup.teamB.id].won++;
      standings[setup.teamB.id].points += 2;
      standings[setup.teamA.id].lost++;
    }
  }

  // Also add teams from scheduled/live matches that haven't completed
  for (const m of Object.values(allMatches)) {
    for (const team of [m.setup.teamA, m.setup.teamB]) {
      if (!standings[team.id]) {
        standings[team.id] = { teamId: team.id, teamName: team.name, played: 0, won: 0, lost: 0, nrr: 0, points: 0 };
      }
    }
  }

  const sorted = Object.values(standings).sort((a, b) => b.points - a.points || b.won - a.won || a.lost - b.lost);

  return (
    <motion.div
      className="score-obs__overlay-card score-obs__points-table"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__points-title">POINTS TABLE</div>
      <table className="score-obs__points-grid">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>L</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <tr key={t.teamId} className={i < 2 ? 'score-obs__points-qualify' : ''}>
              <td>{i + 1}</td>
              <td className="score-obs__points-team">{t.teamName}</td>
              <td>{t.played}</td>
              <td>{t.won}</td>
              <td>{t.lost}</td>
              <td className="score-obs__points-pts">{t.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
