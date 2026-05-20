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
  ReplayTrigger, Innings, MatchScore, AnimationConfig, FieldPlacement,
  ImpactPlayer,
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
  const celebrationActiveRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;
  const [matchStats, setMatchStats] = useState<MatchStatsSnapshot | null>(null);
  const [tournamentStats, setTournamentStats] = useState<TournamentStats | null>(null);
  const [innings, setInnings] = useState<Record<string, Innings>>({});
  const [replayTrigger, setReplayTrigger] = useState<ReplayTrigger | null>(null);
  const [allMatches, setAllMatches] = useState<Record<string, { setup: MatchSetup; final?: MatchScore }>>({});
  const [allTeams, setAllTeams] = useState<{ id: string; name: string; logoUrl?: string }[]>([]);
  const [inningsIntroPhase, setInningsIntroPhase] = useState<'batsmen' | 'bowler' | 'done'>('done');
  const inningsIntroShownRef = useRef(false);
  const [activeFieldPlacement, setActiveFieldPlacement] = useState<FieldPlacement | null>(null);

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
        console.log('[OBS-Overlay] Firebase overlay received:', ctrl.activeOverlay, ctrl);
        setOverlay(ctrl);
        if (ctrl.activeOverlay !== 'none') {
          // Always clear any pending auto-dismiss from previous overlay
          if (autoDismissRef.current) { clearTimeout(autoDismissRef.current); autoDismissRef.current = null; }
          celebrationActiveRef.current = false;
          setLocalOverlay(ctrl.activeOverlay);
          console.log('[OBS-Overlay] setLocalOverlay →', ctrl.activeOverlay);
          // Auto-dismiss animation overlays and clear Firebase state
          const animationTypes = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
          if (animationTypes.includes(ctrl.activeOverlay)) {
            celebrationActiveRef.current = true;
            const cfg = configRef.current;
            const duration =
              ctrl.activeOverlay === 'hat_trick' ? (cfg.hatTrickAnimation?.durationMs || 8000) :
              ctrl.activeOverlay === 'duck_out' ? (cfg.duckOutAnimation?.durationMs || 5000) :
              ctrl.activeOverlay === 'boundary_four' ? (cfg.fourAnimation?.durationMs || 3000) :
              ctrl.activeOverlay === 'boundary_six' ? (cfg.sixAnimation?.durationMs || 4000) :
              ctrl.activeOverlay === 'wicket' ? (cfg.wicketAnimation?.durationMs || 4000) : 5000;
            console.log('[OBS-Overlay] Celebration active:', ctrl.activeOverlay, 'duration:', duration);
            autoDismissRef.current = setTimeout(() => {
              console.log('[OBS-Overlay] Auto-dismiss firing, clearing overlay');
              celebrationActiveRef.current = false;
              setLocalOverlay('none');
              // Clear Firebase overlay state so dock can re-trigger
              fbSet(ref(obsDb, `${basePath}/matches/${matchId}/overlay`), { activeOverlay: 'none', lastUpdated: Date.now() });
            }, duration);
          }
        } else {
          if (autoDismissRef.current) { clearTimeout(autoDismissRef.current); autoDismissRef.current = null; }
          celebrationActiveRef.current = false;
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

    // Match stats (check both paths for compatibility)
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/stats`), snap => {
      if (snap.exists()) setMatchStats(snap.val());
    }));
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

    // All auction teams (for full points table)
    const teamsPath = tenantPath('auction/teams');
    unsubs.push(onValue(ref(obsDb, teamsPath), snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, { id: string; name: string; logoUrl?: string }>;
      setAllTeams(Object.values(data).map(t => ({ id: t.id, name: t.name, logoUrl: t.logoUrl })));
    }));

    // Active field placement (bottom-left mini overlay)
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/activeFieldPlacement`), async snap => {
      if (!snap.exists() || !snap.val()) { setActiveFieldPlacement(null); return; }
      const placementId = snap.val() as string;
      // Fetch the actual placement data
      onValue(ref(obsDb, `${basePath}/matches/${matchId}/fieldPlacements/${placementId}`), pSnap => {
        if (pSnap.exists()) setActiveFieldPlacement(pSnap.val() as FieldPlacement);
        else setActiveFieldPlacement(null);
      }, { onlyOnce: true });
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

  // Preload animation assets (video/image) to eliminate latency on trigger
  useEffect(() => {
    const urls: string[] = [];
    if (config.fourAnimation?.mediaUrl) urls.push(config.fourAnimation.mediaUrl);
    if (config.sixAnimation?.mediaUrl) urls.push(config.sixAnimation.mediaUrl);
    if (config.wicketAnimation?.mediaUrl) urls.push(config.wicketAnimation.mediaUrl);
    if (config.duckOutAnimation?.mediaUrl) urls.push(config.duckOutAnimation.mediaUrl);
    if (config.hatTrickAnimation?.mediaUrl) urls.push(config.hatTrickAnimation.mediaUrl);
    if (config.duckOutImageUrl) urls.push(config.duckOutImageUrl);
    if (config.hatTrickImageUrl) urls.push(config.hatTrickImageUrl);
    if (config.wicketImageUrl) urls.push(config.wicketImageUrl);

    urls.forEach(url => {
      if (!url) return;
      const ext = url.split('.').pop()?.toLowerCase() || '';
      if (['mp4', 'webm', 'mov'].includes(ext)) {
        // Preload video by creating a hidden element and loading metadata+data
        const vid = document.createElement('video');
        vid.preload = 'auto';
        vid.muted = true;
        vid.src = url;
        vid.load();
      } else {
        // Preload image
        const img = new Image();
        img.src = url;
      }
    });
  }, [config]);

  // Innings start intro sequence — show batsmen then bowler when live first appears
  useEffect(() => {
    if (!live || inningsIntroShownRef.current) return;
    inningsIntroShownRef.current = true;
    setInningsIntroPhase('batsmen');
    const t1 = setTimeout(() => setInningsIntroPhase('bowler'), 4000);
    const t2 = setTimeout(() => setInningsIntroPhase('done'), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [live]);

  // Auto-dismiss overlay after duration
  const triggerOverlay = useCallback((type: OverlayType, durationMs = 5000) => {
    // Never overwrite an active celebration with a stats overlay
    const celebrationTypes: OverlayType[] = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
    if (!celebrationTypes.includes(type) && celebrationActiveRef.current) return;
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

  // Auto-show stats ONLY on contextual events: over end, new bowler, new batsman
  const prevLiveRef = useRef<LiveScore | null>(null);
  useEffect(() => {
    if (!live) { prevLiveRef.current = null; return; }
    const prev = prevLiveRef.current;
    prevLiveRef.current = live;
    if (!prev) return;

    // Don't interrupt celebration animations or manually triggered overlays
    const celebrationTypes: OverlayType[] = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
    const manualOverlays: OverlayType[] = ['field_placement', 'full_scorecard', 'match_intro', 'points_table', 'match_summary', 'live_question'];
    if (celebrationTypes.includes(localOverlay) || manualOverlays.includes(localOverlay)) return;

    // Over just completed → show bowler stats briefly
    if (live.overs > prev.overs && (live.currentOverBalls?.length || 0) === 0) {
      triggerOverlay('bowler', 5000);
      return;
    }

    // New bowler assigned → show new bowler stats
    if (live.currentBowler?.playerId && prev.currentBowler?.playerId &&
        live.currentBowler.playerId !== prev.currentBowler.playerId) {
      triggerOverlay('bowler', 5000);
      return;
    }

    // New batsman on strike → show striker stats
    if (live.currentBatsmen?.[0]?.playerId && prev.currentBatsmen?.[0]?.playerId &&
        live.currentBatsmen[0].playerId !== prev.currentBatsmen[0].playerId &&
        (live.currentOverBalls?.length || 0) > 0) {
      triggerOverlay('batsman_striker', 5000);
    }
  }, [live, localOverlay, triggerOverlay]);

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

  // Pre-match overlay (show ceremony phases regardless of live score)
  // Only skip pre-match when phase is idle or match_ready (ceremony done)
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
        <PreMatchOverlay match={match} preMatch={preMatch} config={config} lineups={lineups} playerImages={playerImages} />
      </div>
    );
  }

  // Match intro / waiting for innings — show animated match info card
  if (!live && match) {
    return (
      <div className="score-obs">
        <motion.div
          className="score-obs__top-bar"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 28, delay: 0.2 }}
        >
          <div className="score-obs__top-left">
            {config.tournamentLogo && <img src={config.tournamentLogo} alt="" className="score-obs__tournament-logo" />}
            {config.tournamentName && <span className="score-obs__tournament-name">{config.tournamentName}</span>}
          </div>
          <div className="score-obs__top-right">
            {config.broadcastPartnerLogo && <img src={config.broadcastPartnerLogo} alt="" className="score-obs__partner-logo" />}
            {config.broadcastPartnerName && <span className="score-obs__partner-name">{config.broadcastPartnerName}</span>}
          </div>
        </motion.div>
        <MatchIntroOverlay match={match} config={config} lineups={lineups} playerImages={playerImages} impactPlayers={preMatch?.impactPlayers} />
        {/* Show tournament overlays even without live score */}
        <AnimatePresence mode="wait">
          {localOverlay === 'points_table' && (
            <PointsTableOverlay allMatches={allMatches} allTeams={allTeams} />
          )}
          {localOverlay === 'award_orange_cap' && tournamentStats && (
            <AwardOverlay title="ORANGE CAP" subtitle="Most Runs — Tournament" color="#f97316"
              playerName={tournamentStats.orangeCap?.playerName || ''} value={`${tournamentStats.orangeCap?.runs || 0} runs`}
              imageUrl={tournamentStats.orangeCap?.imageUrl} />
          )}
          {localOverlay === 'award_purple_cap' && tournamentStats && (
            <AwardOverlay title="PURPLE CAP" subtitle="Most Wickets — Tournament" color="#a855f7"
              playerName={tournamentStats.purpleCap?.playerName || ''} value={`${tournamentStats.purpleCap?.wickets || 0} wickets`}
              imageUrl={tournamentStats.purpleCap?.imageUrl} />
          )}
          {localOverlay === 'tournament_fours' && tournamentStats && (
            <StatsListOverlay title="MOST FOURS — TOURNAMENT" items={tournamentStats.topFourHitters?.map(p => ({ name: p.playerName, value: String(p.fours), team: p.teamName, imageUrl: p.imageUrl })) || []} playerImages={playerImages} />
          )}
          {localOverlay === 'tournament_sixes' && tournamentStats && (
            <StatsListOverlay title="MOST SIXES — TOURNAMENT" items={tournamentStats.topSixHitters?.map(p => ({ name: p.playerName, value: String(p.sixes), team: p.teamName, imageUrl: p.imageUrl })) || []} playerImages={playerImages} />
          )}
          {localOverlay === 'tournament_sr' && tournamentStats && (
            <StatsListOverlay title="BEST STRIKE RATE — TOURNAMENT" items={tournamentStats.topStrikeRates?.map(p => ({ name: p.playerName, value: String(p.strikeRate), team: p.teamName, imageUrl: p.imageUrl })) || []} playerImages={playerImages} />
          )}
          {localOverlay === 'tournament_mvp' && tournamentStats && (
            <StatsListOverlay title="MVP — TOURNAMENT" items={tournamentStats.mvpLeaderboard?.slice(0, 5).map(p => ({ name: p.playerName, value: String(p.total.toFixed(1)), team: p.teamId })) || []} playerImages={playerImages} />
          )}
          {/* Animation overlays work even before innings starts */}
          {localOverlay === 'boundary_four' && (
            <BoundaryOverlay key="pre-overlay-four" type="four" animConfig={config.fourAnimation} />
          )}
          {localOverlay === 'boundary_six' && (
            <BoundaryOverlay key="pre-overlay-six" type="six" animConfig={config.sixAnimation} />
          )}
          {localOverlay === 'wicket' && (
            <WicketOverlay key="pre-overlay-wicket" imageUrl={config.wicketImageUrl} animConfig={config.wicketAnimation} />
          )}
          {localOverlay === 'duck_out' && (
            <DuckOutOverlay key="pre-overlay-duck" imageUrl={config.duckOutImageUrl} animConfig={config.duckOutAnimation} />
          )}
          {localOverlay === 'hat_trick' && (
            <HatTrickOverlay key="pre-overlay-hattrick" imageUrl={config.hatTrickImageUrl} animConfig={config.hatTrickAnimation} />
          )}
        </AnimatePresence>
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

      {/* ── Innings Start Intro (batsmen + bowler with images) ────── */}
      <AnimatePresence>
        {inningsIntroPhase === 'batsmen' && live && match && (
          <InningsIntroCard key="intro-bat" type="batsmen" live={live} match={match} playerImages={playerImages} lineups={lineups} />
        )}
        {inningsIntroPhase === 'bowler' && live && match && (
          <InningsIntroCard key="intro-bowl" type="bowler" live={live} match={match} playerImages={playerImages} lineups={lineups} />
        )}
      </AnimatePresence>

      {/* ── Score Ticker (always visible when live) ──────────────── */}
      {live && match && (
        <TickerWithIntro
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

      {/* ── Persistent Field Placement (bottom-left) ───────────────── */}
      <AnimatePresence>
        {activeFieldPlacement && (
          <motion.div
            className="score-obs__field-placement"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          >
            <div className="score-obs__field-ground">
              <div className="score-obs__field-pitch" />
              <div className="score-obs__field-inner-circle" />
              {activeFieldPlacement.positions.map(pos => (
                <div
                  key={pos.id}
                  className="score-obs__field-dot"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  title={pos.label}
                >
                  <span className="score-obs__field-dot-label">{pos.label}</span>
                </div>
              ))}
            </div>
            <div className="score-obs__field-name">{activeFieldPlacement.name}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Celebration Animation Overlays (immediate, no wait) ─── */}
      {effectiveOverlay !== 'none' && console.log('[OBS-Overlay] Render check:', effectiveOverlay, 'enableBoundary:', config.enableBoundaryAnimation, 'enableSixer:', config.enableSixerAnimation, 'fourAnim:', config.fourAnimation, 'sixAnim:', config.sixAnimation)}
      <AnimatePresence>
        {effectiveOverlay === 'boundary_four' && (
          <BoundaryOverlay key="overlay-four" type="four" animConfig={config.fourAnimation} />
        )}
        {effectiveOverlay === 'boundary_six' && (
          <BoundaryOverlay key="overlay-six" type="six" animConfig={config.sixAnimation} />
        )}
        {effectiveOverlay === 'wicket' && (
          <WicketOverlay key="overlay-wicket" imageUrl={config.wicketImageUrl} animConfig={config.wicketAnimation} />
        )}
        {effectiveOverlay === 'duck_out' && (
          <DuckOutOverlay key="overlay-duck" imageUrl={config.duckOutImageUrl} animConfig={config.duckOutAnimation} />
        )}
        {effectiveOverlay === 'hat_trick' && (
          <HatTrickOverlay key="overlay-hattrick" imageUrl={config.hatTrickImageUrl} animConfig={config.hatTrickAnimation} />
        )}
      </AnimatePresence>

      {/* ── Info/Stats Overlay Components ──────────────────────────── */}
      <AnimatePresence mode="wait">
        {effectiveOverlay === 'batsman_striker' && live.currentBatsmen?.[0] && (
          <BatsmanStatsOverlay key="overlay-striker" batsman={live.currentBatsmen[0]} playerImages={playerImages} lineups={lineups} />
        )}
        {effectiveOverlay === 'batsman_nonstriker' && live.currentBatsmen?.[1] && (
          <BatsmanStatsOverlay key="overlay-nonstriker" batsman={live.currentBatsmen[1]} playerImages={playerImages} lineups={lineups} />
        )}
        {effectiveOverlay === 'bowler' && (
          <BowlerStatsOverlay key="overlay-bowler" bowler={live.currentBowler} playerImages={playerImages} lineups={lineups} />
        )}
        {effectiveOverlay === 'full_scorecard' && (
          <FullScorecardOverlay key="overlay-scorecard" live={live} battingTeam={battingTeamName} bowlingTeam={bowlingTeamName} />
        )}
        {effectiveOverlay === 'live_question' && currentQuestion && (
          <QuestionOverlay key="overlay-question" question={currentQuestion} />
        )}
        {effectiveOverlay === 'stats_fours' && matchStats && (
          <StatsListOverlay
            title="FOURS — THIS MATCH"
            items={matchStats.topFours?.map(p => ({
              name: p.playerName,
              value: String(p.fours),
              imageUrl: p.imageUrl,
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'stats_sixes' && matchStats && (
          <StatsListOverlay
            title="SIXES — THIS MATCH"
            items={matchStats.topSixes?.map(p => ({
              name: p.playerName,
              value: String(p.sixes),
              imageUrl: p.imageUrl,
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'stats_sr' && matchStats && (
          <StatsListOverlay
            title="STRIKE RATE — THIS MATCH"
            items={matchStats.topStrikeRates?.map(p => ({
              name: p.playerName,
              value: String(p.strikeRate),
              imageUrl: p.imageUrl,
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'stats_mvp' && matchStats && (
          <StatsListOverlay
            title="MVP — THIS MATCH"
            items={matchStats.mvpPoints?.slice(0, 5).map(p => ({
              name: p.playerName,
              value: String(p.totalPoints.toFixed(1)),
              imageUrl: p.imageUrl,
            })) || matchStats.mvpLeaderboard?.slice(0, 5).map(p => ({
              name: p.playerName,
              value: String(p.total.toFixed(1)),
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'tournament_fours' && tournamentStats && (
          <StatsListOverlay
            title="MOST FOURS — TOURNAMENT"
            items={tournamentStats.topFourHitters?.map(p => ({
              name: p.playerName,
              value: String(p.fours),
              team: p.teamName,
              imageUrl: p.imageUrl,
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'tournament_sixes' && tournamentStats && (
          <StatsListOverlay
            title="MOST SIXES — TOURNAMENT"
            items={tournamentStats.topSixHitters?.map(p => ({
              name: p.playerName,
              value: String(p.sixes),
              team: p.teamName,
              imageUrl: p.imageUrl,
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'tournament_sr' && tournamentStats && (
          <StatsListOverlay
            title="BEST STRIKE RATE — TOURNAMENT"
            items={tournamentStats.topStrikeRates?.map(p => ({
              name: p.playerName,
              value: String(p.strikeRate),
              team: p.teamName,
              imageUrl: p.imageUrl,
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'tournament_mvp' && tournamentStats && (
          <StatsListOverlay
            title="MVP — TOURNAMENT"
            items={tournamentStats.mvpLeaderboard?.slice(0, 5).map(p => ({
              name: p.playerName,
              value: String(p.total.toFixed(1)),
            })) || []}
            playerImages={playerImages}
          />
        )}
        {effectiveOverlay === 'match_summary' && matchStats && match && (
          <MatchSummaryOverlay matchStats={matchStats} match={match} innings={innings} />
        )}
        {effectiveOverlay === 'award_orange_cap' && tournamentStats && (
          <AwardOverlay
            title="ORANGE CAP"
            subtitle="Most Runs — Tournament"
            color="#f97316"
            playerName={tournamentStats.orangeCap?.playerName || ''}
            value={`${tournamentStats.orangeCap?.runs || 0} runs`}
            imageUrl={tournamentStats.orangeCap?.imageUrl}
          />
        )}
        {effectiveOverlay === 'award_purple_cap' && tournamentStats && (
          <AwardOverlay
            title="PURPLE CAP"
            subtitle="Most Wickets — Tournament"
            color="#a855f7"
            playerName={tournamentStats.purpleCap?.playerName || ''}
            value={`${tournamentStats.purpleCap?.wickets || 0} wickets`}
            imageUrl={tournamentStats.purpleCap?.imageUrl}
          />
        )}
        {effectiveOverlay === 'award_orange_cap_match' && matchStats && (
          <AwardOverlay
            title="ORANGE CAP"
            subtitle="Most Runs — This Match"
            color="#f97316"
            playerName={matchStats.topRunScorers?.[0]?.playerName || ''}
            value={`${matchStats.topRunScorers?.[0]?.runs || 0} runs (${matchStats.topRunScorers?.[0]?.balls || 0} balls)`}
            imageUrl={matchStats.topRunScorers?.[0]?.imageUrl}
          />
        )}
        {effectiveOverlay === 'award_purple_cap_match' && matchStats && (
          <AwardOverlay
            title="PURPLE CAP"
            subtitle="Most Wickets — This Match"
            color="#a855f7"
            playerName={matchStats.topWicketTakers?.[0]?.playerName || ''}
            value={`${matchStats.topWicketTakers?.[0]?.wickets || 0} wickets`}
            imageUrl={matchStats.topWicketTakers?.[0]?.imageUrl}
          />
        )}
        {effectiveOverlay === 'points_table' && (
          <PointsTableOverlay allMatches={allMatches} allTeams={allTeams} />
        )}
        {effectiveOverlay === 'match_intro' && match && (
          <MatchIntroOverlay match={match} config={config} lineups={lineups} playerImages={playerImages} impactPlayers={preMatch?.impactPlayers} />
        )}
        {effectiveOverlay === 'field_placement' && activeFieldPlacement && (
          <FieldPlacementOverlay placement={activeFieldPlacement} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAY SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function getBallClass(ball: string): string {
  if (ball === 'W' || ball.includes('·W')) return 'score-obs__ball--wicket';
  if (ball === '4') return 'score-obs__ball--four';
  if (ball === '6') return 'score-obs__ball--six';
  if (ball === '0') return 'score-obs__ball--dot';
  if (ball === 'B' || ball === 'LB' || ball.includes('WD') || ball.includes('NB')) return 'score-obs__ball--extra';
  return '';
}

function BatsmanStatsOverlay({ batsman, playerImages, lineups }: {
  batsman: { playerId: string; playerName: string; runs: number; balls: number; fours: number; sixes: number; strikeRate: number; isOnStrike: boolean };
  playerImages?: Record<string, string>;
  lineups?: { teamA: MatchLineup | null; teamB: MatchLineup | null };
}) {
  // Build player image map
  const imgMap: Record<string, string> = { ...(playerImages || {}) };
  if (lineups) {
    [lineups.teamA, lineups.teamB].forEach(l => {
      l?.players?.forEach(p => { if (p.imageUrl) imgMap[p.playerId] = p.imageUrl; });
    });
  }
  const playerImg = imgMap[batsman.playerId];

  return (
    <motion.div
      className="score-obs__overlay-card score-obs__batsman-profile"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__profile-layout">
        {/* Player Image Section */}
        <div className="score-obs__profile-image-section">
          {playerImg ? (
            <img src={playerImg} alt={batsman.playerName} className="score-obs__profile-img" />
          ) : (
            <div className="score-obs__profile-img-placeholder">
              {batsman.playerName.charAt(0)}
            </div>
          )}
          <div className="score-obs__profile-img-gradient" />
        </div>

        {/* Stats Section */}
        <div className="score-obs__profile-stats">
          {/* Name Header */}
          <div className="score-obs__profile-header">
            <h1 className="score-obs__profile-name">{batsman.playerName.toUpperCase()}</h1>
            <span className="score-obs__profile-role">
              {batsman.isOnStrike ? '🏏 ON STRIKE' : 'BATTING'}
            </span>
          </div>

          {/* Primary Stat: Runs (highlighted) */}
          <div className="score-obs__profile-stat-highlight">
            <span className="score-obs__profile-stat-label">RUNS</span>
            <span className="score-obs__profile-stat-big">{batsman.runs}</span>
          </div>

          {/* Stats Grid */}
          <div className="score-obs__profile-stat-grid">
            <div className="score-obs__profile-stat-cell">
              <span className="score-obs__profile-stat-cell-label">BALLS</span>
              <span className="score-obs__profile-stat-cell-value">{batsman.balls}</span>
            </div>
            <div className="score-obs__profile-stat-cell">
              <span className="score-obs__profile-stat-cell-label">STRIKE RATE</span>
              <span className="score-obs__profile-stat-cell-value">{batsman.strikeRate}</span>
            </div>
          </div>

          {/* Boundaries Row */}
          <div className="score-obs__profile-stat-row">
            <span className="score-obs__profile-stat-label">4s / 6s</span>
            <span className="score-obs__profile-stat-value">{batsman.fours} / {batsman.sixes}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function BowlerStatsOverlay({ bowler, playerImages, lineups }: {
  bowler: { playerId: string; playerName: string; overs: number; maidens: number; runs: number; wickets: number; economy: number; dots: number };
  playerImages?: Record<string, string>;
  lineups?: { teamA: MatchLineup | null; teamB: MatchLineup | null };
}) {
  // Build player image map
  const imgMap: Record<string, string> = { ...(playerImages || {}) };
  if (lineups) {
    [lineups.teamA, lineups.teamB].forEach(l => {
      l?.players?.forEach(p => { if (p.imageUrl) imgMap[p.playerId] = p.imageUrl; });
    });
  }
  const playerImg = imgMap[bowler.playerId];

  return (
    <motion.div
      className="score-obs__overlay-card score-obs__batsman-profile score-obs__bowler-profile"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__profile-layout">
        {/* Player Image Section */}
        <div className="score-obs__profile-image-section">
          {playerImg ? (
            <img src={playerImg} alt={bowler.playerName} className="score-obs__profile-img" />
          ) : (
            <div className="score-obs__profile-img-placeholder">
              {bowler.playerName.charAt(0)}
            </div>
          )}
          <div className="score-obs__profile-img-gradient" />
        </div>

        {/* Stats Section */}
        <div className="score-obs__profile-stats">
          {/* Name Header */}
          <div className="score-obs__profile-header score-obs__profile-header--bowler">
            <h1 className="score-obs__profile-name">{bowler.playerName.toUpperCase()}</h1>
            <span className="score-obs__profile-role">BOWLING</span>
          </div>

          {/* Primary Stat: Wickets/Runs (highlighted) */}
          <div className="score-obs__profile-stat-highlight score-obs__profile-stat-highlight--bowler">
            <span className="score-obs__profile-stat-label">FIGURES</span>
            <span className="score-obs__profile-stat-big">{bowler.wickets}/{bowler.runs}</span>
          </div>

          {/* Stats Grid */}
          <div className="score-obs__profile-stat-grid">
            <div className="score-obs__profile-stat-cell">
              <span className="score-obs__profile-stat-cell-label">OVERS</span>
              <span className="score-obs__profile-stat-cell-value">{bowler.overs}</span>
            </div>
            <div className="score-obs__profile-stat-cell">
              <span className="score-obs__profile-stat-cell-label">ECONOMY</span>
              <span className="score-obs__profile-stat-cell-value">{bowler.economy}</span>
            </div>
          </div>

          {/* Additional stats */}
          <div className="score-obs__profile-stat-grid">
            <div className="score-obs__profile-stat-cell">
              <span className="score-obs__profile-stat-cell-label">MAIDENS</span>
              <span className="score-obs__profile-stat-cell-value">{bowler.maidens}</span>
            </div>
            <div className="score-obs__profile-stat-cell">
              <span className="score-obs__profile-stat-cell-label">DOTS</span>
              <span className="score-obs__profile-stat-cell-value">{bowler.dots}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FullScorecardOverlay({ live, battingTeam, bowlingTeam }: {
  live: LiveScore; battingTeam: string; bowlingTeam: string;
}) {
  const allBatsmen = live.allBatsmen || [];
  const allBowlers = live.allBowlers || [];

  return (
    <motion.div
      className="score-obs__overlay-card score-obs__scorecard-v2"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.85, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      {/* Title Bar */}
      <div className="score-obs__sc-title-bar">
        <div className="score-obs__sc-team-badge">
          <span className="score-obs__sc-team-name">{battingTeam.toUpperCase()}</span>
        </div>
        <div className="score-obs__sc-score-badge">
          {live.runs}/{live.wickets} ({live.overs} ov)
        </div>
      </div>

      {/* Batting Section */}
      <div className="score-obs__sc-batting">
        {/* Header row */}
        <div className="score-obs__sc-bat-header">
          <span className="score-obs__sc-col-name">BATSMAN</span>
          <span className="score-obs__sc-col-how">HOW OUT</span>
          <span className="score-obs__sc-col-r">R</span>
          <span className="score-obs__sc-col-b">B</span>
          <span className="score-obs__sc-col-4">4s</span>
          <span className="score-obs__sc-col-6">6s</span>
          <span className="score-obs__sc-col-sr">SR</span>
        </div>

        {/* Current batsmen (highlighted) */}
        {(live.currentBatsmen || []).map(b => (
          <motion.div
            key={b.playerId}
            className="score-obs__sc-bat-row score-obs__sc-bat-row--active"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <span className="score-obs__sc-col-name">
              {b.playerName.toUpperCase()}
              {b.isOnStrike && <span className="score-obs__sc-strike">●</span>}
            </span>
            <span className="score-obs__sc-col-how score-obs__sc-notout">not out</span>
            <span className="score-obs__sc-col-r score-obs__sc-runs-active">{b.runs}</span>
            <span className="score-obs__sc-col-b">{b.balls}</span>
            <span className="score-obs__sc-col-4">{b.fours}</span>
            <span className="score-obs__sc-col-6">{b.sixes}</span>
            <span className="score-obs__sc-col-sr">{b.strikeRate}</span>
          </motion.div>
        ))}

        {/* Dismissed batsmen */}
        {allBatsmen.filter(b => b.isOut).map((b, i) => (
          <motion.div
            key={b.playerId}
            className="score-obs__sc-bat-row"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.05 * (i + 2) }}
          >
            <span className="score-obs__sc-col-name">{b.playerName.toUpperCase()}</span>
            <span className="score-obs__sc-col-how">{b.dismissal}</span>
            <span className="score-obs__sc-col-r">{b.runs}</span>
            <span className="score-obs__sc-col-b">{b.balls}</span>
            <span className="score-obs__sc-col-4">{b.fours}</span>
            <span className="score-obs__sc-col-6">{b.sixes}</span>
            <span className="score-obs__sc-col-sr">{b.strikeRate}</span>
          </motion.div>
        ))}

        {/* Yet to bat (dimmed) */}
        {allBatsmen.filter(b => !b.isOut && !(live.currentBatsmen || []).some((cb: { playerId: string }) => cb.playerId === b.playerId)).map((b, i) => (
          <motion.div
            key={b.playerId}
            className="score-obs__sc-bat-row score-obs__sc-bat-row--pending"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 0.5 }}
            transition={{ delay: 0.05 * (i + 4) }}
          >
            <span className="score-obs__sc-col-name">{b.playerName.toUpperCase()}</span>
            <span className="score-obs__sc-col-how"></span>
            <span className="score-obs__sc-col-r"></span>
            <span className="score-obs__sc-col-b"></span>
            <span className="score-obs__sc-col-4"></span>
            <span className="score-obs__sc-col-6"></span>
            <span className="score-obs__sc-col-sr"></span>
          </motion.div>
        ))}
      </div>

      {/* Bowling Section */}
      {allBowlers.length > 0 && (
        <div className="score-obs__sc-bowling">
          <div className="score-obs__sc-bowl-header-bar">
            <span>{bowlingTeam.toUpperCase()} — BOWLING</span>
          </div>
          <div className="score-obs__sc-bowl-header">
            <span className="score-obs__sc-col-name">BOWLER</span>
            <span className="score-obs__sc-col-o">O</span>
            <span className="score-obs__sc-col-m">M</span>
            <span className="score-obs__sc-col-r">R</span>
            <span className="score-obs__sc-col-w">W</span>
            <span className="score-obs__sc-col-eco">ECO</span>
          </div>
          {/* Current bowler (highlighted) */}
          {live.currentBowler && (
            <div className="score-obs__sc-bowl-row score-obs__sc-bowl-row--active">
              <span className="score-obs__sc-col-name">{live.currentBowler.playerName.toUpperCase()}</span>
              <span className="score-obs__sc-col-o">{live.currentBowler.overs}</span>
              <span className="score-obs__sc-col-m">{live.currentBowler.maidens}</span>
              <span className="score-obs__sc-col-r">{live.currentBowler.runs}</span>
              <span className="score-obs__sc-col-w score-obs__sc-wkts-active">{live.currentBowler.wickets}</span>
              <span className="score-obs__sc-col-eco">{live.currentBowler.economy}</span>
            </div>
          )}
          {/* Other bowlers */}
          {allBowlers.filter(b => b.playerId !== live.currentBowler?.playerId).map(b => (
            <div key={b.playerId} className="score-obs__sc-bowl-row">
              <span className="score-obs__sc-col-name">{b.playerName.toUpperCase()}</span>
              <span className="score-obs__sc-col-o">{b.overs}</span>
              <span className="score-obs__sc-col-m">{b.maidens}</span>
              <span className="score-obs__sc-col-r">{b.runs}</span>
              <span className="score-obs__sc-col-w">{b.wickets}</span>
              <span className="score-obs__sc-col-eco">{b.economy}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary Footer */}
      <div className="score-obs__sc-footer">
        <span className="score-obs__sc-footer-item">OVERS {live.overs}</span>
        <span className="score-obs__sc-footer-item">CRR {live.runRate}</span>
        {live.requiredRate !== undefined && <span className="score-obs__sc-footer-item">RRR {live.requiredRate}</span>}
        <span className="score-obs__sc-footer-item">P'SHIP {(live.partnership || { runs: 0, balls: 0 }).runs}({(live.partnership || { runs: 0, balls: 0 }).balls})</span>
        <span className="score-obs__sc-footer-total">TOTAL {live.runs}-{live.wickets}</span>
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
  const drawingRef = useRef(false);
  const [corsFailed, setCorsFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Fetch video as blob to bypass CORS restrictions on canvas
  useEffect(() => {
    let cancelled = false;
    const fetchBlob = async () => {
      try {
        const response = await fetch(src, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!cancelled) {
          setBlobUrl(URL.createObjectURL(blob));
        }
      } catch {
        // CORS fetch failed — try without CORS mode (opaque response won't help for blob)
        // Fall back to direct src with crossOrigin (original approach)
        if (!cancelled) {
          setBlobUrl(null);
          // Will use direct src approach which may get tainted
        }
      }
    };
    fetchBlob();
    return () => {
      cancelled = true;
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [src]);

  useEffect(() => {
    if (corsFailed) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Parse hex color to RGB
    const hex = chromaColor.replace('#', '');
    const keyR = parseInt(hex.substring(0, 2), 16);
    const keyG = parseInt(hex.substring(2, 4), 16);
    const keyB = parseInt(hex.substring(4, 6), 16);
    const threshold = similarity * 442; // max distance = sqrt(255^2*3) ≈ 442
    const thresholdSq = threshold * threshold; // avoid sqrt per pixel

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const draw = () => {
      if (video.paused || video.ended) {
        drawingRef.current = false;
        return;
      }
      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      try {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i] - keyR;
          const dg = data[i + 1] - keyG;
          const db = data[i + 2] - keyB;
          const distSq = dr * dr + dg * dg + db * db;
          if (distSq < thresholdSq) {
            data[i + 3] = 0; // transparent
          } else if (distSq < thresholdSq * 2.25) {
            // Soft edge — feather the alpha for smooth transition
            const ratio = (Math.sqrt(distSq) - threshold) / (threshold * 0.5);
            data[i + 3] = Math.min(255, Math.round(ratio * 255));
          }
        }
        ctx.putImageData(imageData, 0, 0);
      } catch {
        // Canvas tainted by CORS — fall back to regular video
        console.warn('[OBS-Overlay] Chroma key canvas tainted, falling back to direct video');
        drawingRef.current = false;
        setCorsFailed(true);
        return;
      }
      animRef.current = requestAnimationFrame(draw);
    };

    const startDrawing = () => {
      if (!drawingRef.current) {
        drawingRef.current = true;
        animRef.current = requestAnimationFrame(draw);
      }
    };

    const handleError = () => {
      console.warn('[OBS-Overlay] Video CORS error, falling back to direct video');
      setCorsFailed(true);
    };

    video.addEventListener('play', startDrawing);
    video.addEventListener('playing', startDrawing);
    video.addEventListener('error', handleError);
    // If video already playing (autoPlay), start immediately
    if (!video.paused && video.readyState >= 2) startDrawing();

    return () => {
      drawingRef.current = false;
      cancelAnimationFrame(animRef.current);
      video.removeEventListener('play', startDrawing);
      video.removeEventListener('playing', startDrawing);
      video.removeEventListener('error', handleError);
    };
  }, [chromaColor, similarity, corsFailed, blobUrl]);

  // CORS failed — render video directly without chroma key
  if (corsFailed) {
    return <AutoPlayVideo src={src} className={className ? `${className} score-obs__celebration-video` : 'score-obs__celebration-video'} />;
  }

  // Use blob URL if available (bypasses CORS), otherwise fall back to src with crossOrigin
  const videoSrc = blobUrl || src;

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        muted
        playsInline
        crossOrigin={blobUrl ? undefined : 'anonymous'}
        onError={() => setCorsFailed(true)}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}

// AutoPlayVideo — ensures video plays immediately even in OBS browser source
function AutoPlayVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Force play on mount — handles browsers/OBS that block autoplay
    video.muted = true;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Retry after a tick
        setTimeout(() => { video.play().catch(() => {}); }, 50);
      });
    }
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      muted
      playsInline
      className={className}
    />
  );
}

function BoundaryOverlay({ type, animConfig }: { type: 'four' | 'six'; animConfig?: AnimationConfig }) {
  const isSix = type === 'six';
  const defaultText = isSix ? 'MAXIMUM!' : 'FOUR!';
  const defaultColor = isSix ? '#8b5cf6' : '#22c55e';
  const text = animConfig?.text || defaultText;
  const color = animConfig?.color || defaultColor;
  const scale = animConfig?.scale || (isSix ? 1.2 : 1);

  // Custom media — check if mediaUrl is set (regardless of type field, be lenient)
  const hasVideo = animConfig?.mediaUrl && (animConfig.type === 'video' || animConfig.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i));
  const hasImage = animConfig?.mediaUrl && (animConfig.type === 'image' || animConfig.mediaUrl.match(/\.(png|gif|jpg|jpeg|webp|svg)(\?|$)/i));

  if (hasImage && !hasVideo) {
    return (
      <motion.div
        className={`score-obs__celebration score-obs__celebration--${type}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <img src={animConfig!.mediaUrl} alt={text} className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  if (hasVideo) {
    const useChromaKey = !!animConfig!.chromaKeyEnabled;
    return (
      <motion.div
        className={`score-obs__celebration score-obs__celebration--${type}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {useChromaKey ? (
          <ChromaKeyVideo
            src={animConfig!.mediaUrl!}
            chromaColor={animConfig!.chromaKeyColor || '#00ff00'}
            similarity={animConfig!.chromaKeySimilarity || 0.4}
            className="score-obs__celebration-chroma"
          />
        ) : (
          <AutoPlayVideo src={animConfig!.mediaUrl!} className="score-obs__celebration-video" />
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

  // Lenient media type detection
  const hasVideo = animConfig?.mediaUrl && (animConfig.type === 'video' || animConfig.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i));
  const hasImage = animConfig?.mediaUrl && (animConfig.type === 'image' || animConfig.mediaUrl.match(/\.(png|gif|jpg|jpeg|webp|svg)(\?|$)/i));

  if (hasImage && !hasVideo) {
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--wicket"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1, scale }}
        exit={{ y: 50, opacity: 0 }}
      >
        <img src={animConfig!.mediaUrl} alt={text} className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  if (hasVideo) {
    const useChromaKey = !!animConfig!.chromaKeyEnabled;
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--wicket"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {useChromaKey ? (
          <ChromaKeyVideo
            src={animConfig!.mediaUrl!}
            chromaColor={animConfig!.chromaKeyColor || '#00ff00'}
            similarity={animConfig!.chromaKeySimilarity || 0.4}
            className="score-obs__celebration-chroma"
          />
        ) : (
          <AutoPlayVideo src={animConfig!.mediaUrl!} className="score-obs__celebration-video" />
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

function DuckOutOverlay({ imageUrl, animConfig }: { imageUrl?: string; animConfig?: AnimationConfig }) {
  const text = animConfig?.text || 'DUCK OUT!';
  const scale = animConfig?.scale || 1;

  const hasVideo = animConfig?.mediaUrl && (animConfig.type === 'video' || animConfig.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i));
  const hasImage = animConfig?.mediaUrl && (animConfig.type === 'image' || animConfig.mediaUrl.match(/\.(png|gif|jpg|jpeg|webp|svg)(\?|$)/i));

  if (hasVideo) {
    const useChromaKey = !!animConfig!.chromaKeyEnabled;
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--duck"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {useChromaKey ? (
          <ChromaKeyVideo
            src={animConfig!.mediaUrl!}
            chromaColor={animConfig!.chromaKeyColor || '#00ff00'}
            similarity={animConfig!.chromaKeySimilarity || 0.4}
            className="score-obs__celebration-chroma"
          />
        ) : (
          <AutoPlayVideo src={animConfig!.mediaUrl!} className="score-obs__celebration-video" />
        )}
      </motion.div>
    );
  }

  if (hasImage && !hasVideo) {
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--duck"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <img src={animConfig!.mediaUrl} alt={text} className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="score-obs__celebration score-obs__celebration--duck"
      initial={{ scale: 0, rotate: 10 }}
      animate={{ scale, rotate: 0 }}
      exit={{ scale: 0 }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="Duck Out" className="score-obs__celebration-img" />
      ) : (
        <>
          <span className="score-obs__celebration-emoji">🦆</span>
          <span className="score-obs__celebration-text">{text}</span>
        </>
      )}
    </motion.div>
  );
}

function HatTrickOverlay({ imageUrl, animConfig }: { imageUrl?: string; animConfig?: AnimationConfig }) {
  const text = animConfig?.text || 'HAT-TRICK!';
  const scale = animConfig?.scale || 1;

  const hasVideo = animConfig?.mediaUrl && (animConfig.type === 'video' || animConfig.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i));
  const hasImage = animConfig?.mediaUrl && (animConfig.type === 'image' || animConfig.mediaUrl.match(/\.(png|gif|jpg|jpeg|webp|svg)(\?|$)/i));

  if (hasVideo) {
    const useChromaKey = !!animConfig!.chromaKeyEnabled;
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--hattrick"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {useChromaKey ? (
          <ChromaKeyVideo
            src={animConfig!.mediaUrl!}
            chromaColor={animConfig!.chromaKeyColor || '#00ff00'}
            similarity={animConfig!.chromaKeySimilarity || 0.4}
            className="score-obs__celebration-chroma"
          />
        ) : (
          <AutoPlayVideo src={animConfig!.mediaUrl!} className="score-obs__celebration-video" />
        )}
      </motion.div>
    );
  }

  if (hasImage && !hasVideo) {
    return (
      <motion.div
        className="score-obs__celebration score-obs__celebration--hattrick"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3 * scale, scale] }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        <img src={animConfig!.mediaUrl} alt={text} className="score-obs__celebration-img" />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="score-obs__celebration score-obs__celebration--hattrick"
      initial={{ scale: 0 }}
      animate={{ scale: [0, 1.3 * scale, scale] }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="Hat-Trick" className="score-obs__celebration-img" />
      ) : (
        <>
          <span className="score-obs__celebration-emoji">🎩</span>
          <span className="score-obs__celebration-text">{text}</span>
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

// ── Stats List Overlay (Leaderboard style) ──

function StatsListOverlay({ title, items, playerImages }: {
  title: string;
  items: { name: string; value: string; team?: string; imageUrl?: string }[];
  playerImages?: Record<string, string>;
}) {
  const topPlayer = items[0];
  const topPlayerImg = topPlayer?.imageUrl || (playerImages && topPlayer ? playerImages[topPlayer.name] : undefined);
  // Determine color theme from title
  const isOrange = title.toLowerCase().includes('run') || title.toLowerCase().includes('four') || title.toLowerCase().includes('orange');
  const isPurple = title.toLowerCase().includes('wicket') || title.toLowerCase().includes('purple') || title.toLowerCase().includes('dot');
  const isMvp = title.toLowerCase().includes('mvp');
  const isSixes = title.toLowerCase().includes('six');
  const accentColor = isPurple ? '#a855f7' : isMvp ? '#fbbf24' : isSixes ? '#06b6d4' : '#f97316';

  // Determine the value column header based on stat type
  const valueHeader = isPurple ? 'Wickets' : isSixes ? 'Sixes' : title.toLowerCase().includes('four') ? 'Fours' : isMvp ? 'Points' : 'Runs';

  return (
    <motion.div
      className="score-obs__overlay-card score-obs__leaderboard"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.85, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="score-obs__lb-layout">
        {/* Left: Content */}
        <div className="score-obs__lb-content">
          {/* Header */}
          <div className="score-obs__lb-header" style={{ background: `linear-gradient(135deg, ${accentColor}18, transparent)`, borderBottomColor: `${accentColor}40` }}>
            <div className="score-obs__lb-header-icon" style={{ color: accentColor }}>
              {isPurple ? '🟣' : isMvp ? '🏆' : isSixes ? '6️⃣' : isOrange ? '🟠' : '🏏'}
            </div>
            <span className="score-obs__lb-title" style={{ color: accentColor }}>{title}</span>
          </div>

          {/* Column Headers */}
          <div className="score-obs__lb-col-headers">
            <span className="score-obs__lb-col-player">Player</span>
            <span className="score-obs__lb-col-matches">Matches</span>
            <span className="score-obs__lb-col-value">{valueHeader}</span>
          </div>

          {/* Rows */}
          <div className="score-obs__lb-rows">
            {items.slice(0, 5).map((item, i) => (
              <motion.div
                key={i}
                className={`score-obs__lb-row ${i === 0 ? 'score-obs__lb-row--first' : i % 2 === 0 ? 'score-obs__lb-row--alt' : ''}`}
                style={i === 0 ? { background: `linear-gradient(90deg, ${accentColor}dd, ${accentColor}88)` } : undefined}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="score-obs__lb-row-left">
                  <span className="score-obs__lb-rank">{i + 1}</span>
                  <div className="score-obs__lb-player-info">
                    <span className="score-obs__lb-player-name">{item.name}</span>
                    {item.team && <span className="score-obs__lb-player-team">{item.team}</span>}
                  </div>
                </div>
                <span className="score-obs__lb-player-value" style={i === 0 ? { color: '#fff' } : undefined}>{item.value}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: Player image spotlight */}
        {topPlayerImg && (
          <div className="score-obs__lb-player-spotlight" style={{ background: `linear-gradient(180deg, ${accentColor}10, ${accentColor}30)` }}>
            <img src={topPlayerImg} alt={topPlayer?.name || ''} className="score-obs__lb-player-img" />
            <div className="score-obs__lb-spotlight-gradient" style={{ background: `linear-gradient(180deg, transparent 40%, ${accentColor}40 100%)` }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Match Summary Overlay (broadcast-style card) ──

function MatchSummaryOverlay({ matchStats, match, innings }: {
  matchStats: MatchStatsSnapshot;
  match: MatchSetup;
  innings: Record<string, Innings>;
}) {
  const inn1 = innings['1'];
  const inn2 = innings['2'];

  const getTeamName = (teamId: string) =>
    teamId === match.teamA.id ? match.teamA.name : match.teamB.name;
  const getTeamColor = (teamId: string) =>
    teamId === match.teamA.id ? (match.teamA.primaryColor || '#3b82f6') : (match.teamB.primaryColor || '#22c55e');
  const getTeamLogo = (teamId: string) =>
    teamId === match.teamA.id ? match.teamA.logoUrl : match.teamB.logoUrl;

  // Build result text
  let resultText = '';
  if (matchStats.mvpPoints && matchStats.mvpPoints.length > 0) {
    resultText = `PLAYER OF THE MATCH: ${matchStats.mvpPoints[0].playerName}`;
  }

  return (
    <motion.div
      className="score-obs__overlay-card score-obs__match-summary-v2"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.85, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      {/* Header */}
      <div className="score-obs__ms-header">
        <span className="score-obs__ms-header-text">MATCH SUMMARY</span>
      </div>

      <div className="score-obs__ms-body">
        {/* Innings 1 Block */}
        {inn1 && (
          <div className="score-obs__ms-innings">
            {/* Team Banner */}
            <div className="score-obs__ms-team-banner" style={{ background: `linear-gradient(90deg, ${getTeamColor(inn1.battingTeamId)}, ${getTeamColor(inn1.battingTeamId)}dd)` }}>
              <div className="score-obs__ms-team-left">
                {getTeamLogo(inn1.battingTeamId) && (
                  <img src={getTeamLogo(inn1.battingTeamId)!} alt="" className="score-obs__ms-team-logo" />
                )}
                <span className="score-obs__ms-team-name">{getTeamName(inn1.battingTeamId).toUpperCase()}</span>
              </div>
              <span className="score-obs__ms-team-score">
                {inn1.totalOvers} Ov | <strong>{inn1.totalRuns}-{inn1.totalWickets}</strong>
              </span>
            </div>

            {/* Stats Grid: Batsmen (left) | Bowlers (right) */}
            <div className="score-obs__ms-stats-grid">
              {/* Top Batsmen */}
              <div className="score-obs__ms-stats-col">
                {inn1.batsmen.filter(b => b.runs > 0).sort((a, b) => b.runs - a.runs).slice(0, 4).map(b => (
                  <div key={b.playerId} className="score-obs__ms-stat-row">
                    <span className="score-obs__ms-player-name">{b.playerName.toUpperCase()}</span>
                    <div className="score-obs__ms-player-figures">
                      <span className="score-obs__ms-fig-primary">{b.runs}</span>
                      <span className="score-obs__ms-fig-secondary">{b.balls}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top Bowlers (from bowling team) */}
              <div className="score-obs__ms-stats-col">
                {inn1.bowlers.sort((a, b) => b.wickets - a.wickets || a.economy - b.economy).slice(0, 4).map(b => (
                  <div key={b.playerId} className="score-obs__ms-stat-row">
                    <span className="score-obs__ms-player-name">{b.playerName.toUpperCase()}</span>
                    <div className="score-obs__ms-player-figures">
                      <span className="score-obs__ms-fig-primary">{b.wickets}-{b.runs}</span>
                      <span className="score-obs__ms-fig-secondary">{b.overs}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Innings 2 Block */}
        {inn2 && (
          <div className="score-obs__ms-innings">
            {/* Team Banner */}
            <div className="score-obs__ms-team-banner" style={{ background: `linear-gradient(90deg, ${getTeamColor(inn2.battingTeamId)}, ${getTeamColor(inn2.battingTeamId)}dd)` }}>
              <div className="score-obs__ms-team-left">
                {getTeamLogo(inn2.battingTeamId) && (
                  <img src={getTeamLogo(inn2.battingTeamId)!} alt="" className="score-obs__ms-team-logo" />
                )}
                <span className="score-obs__ms-team-name">{getTeamName(inn2.battingTeamId).toUpperCase()}</span>
              </div>
              <span className="score-obs__ms-team-score">
                {inn2.totalOvers} Ov | <strong>{inn2.totalRuns}-{inn2.totalWickets}</strong>
              </span>
            </div>

            {/* Stats Grid */}
            <div className="score-obs__ms-stats-grid">
              <div className="score-obs__ms-stats-col">
                {inn2.batsmen.filter(b => b.runs > 0).sort((a, b) => b.runs - a.runs).slice(0, 4).map(b => (
                  <div key={b.playerId} className="score-obs__ms-stat-row">
                    <span className="score-obs__ms-player-name">{b.playerName.toUpperCase()}</span>
                    <div className="score-obs__ms-player-figures">
                      <span className="score-obs__ms-fig-primary">{b.runs}</span>
                      <span className="score-obs__ms-fig-secondary">{b.balls}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="score-obs__ms-stats-col">
                {inn2.bowlers.sort((a, b) => b.wickets - a.wickets || a.economy - b.economy).slice(0, 4).map(b => (
                  <div key={b.playerId} className="score-obs__ms-stat-row">
                    <span className="score-obs__ms-player-name">{b.playerName.toUpperCase()}</span>
                    <div className="score-obs__ms-player-figures">
                      <span className="score-obs__ms-fig-primary">{b.wickets}-{b.runs}</span>
                      <span className="score-obs__ms-fig-secondary">{b.overs}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="score-obs__ms-footer">
        <span className="score-obs__ms-footer-text">{resultText}</span>
      </div>
    </motion.div>
  );
}

// ── Award Overlay (Orange Cap / Purple Cap / MVP style) ──

function AwardOverlay({ title, subtitle, color, playerName, value, imageUrl }: {
  title: string;
  subtitle: string;
  color: string;
  playerName: string;
  value: string;
  imageUrl?: string;
}) {
  return (
    <motion.div
      className="score-obs__overlay-card score-obs__award-v2"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <div className="score-obs__award-v2-layout">
        {/* Left: Info */}
        <div className="score-obs__award-v2-content">
          {/* Award badge header */}
          <div className="score-obs__award-v2-badge" style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
            <div className="score-obs__award-v2-badge-icon">
              {title.toLowerCase().includes('orange') ? '🟠' : title.toLowerCase().includes('purple') ? '🟣' : '🏆'}
            </div>
            <div className="score-obs__award-v2-badge-text">
              <span className="score-obs__award-v2-badge-title">{title}</span>
              <span className="score-obs__award-v2-badge-sub">{subtitle}</span>
            </div>
          </div>

          {/* Player name */}
          <div className="score-obs__award-v2-player">
            <span className="score-obs__award-v2-rank">1</span>
            <span className="score-obs__award-v2-name">{playerName}</span>
          </div>

          {/* Value */}
          <div className="score-obs__award-v2-value-row">
            <span className="score-obs__award-v2-value" style={{ color }}>{value}</span>
            <span className="score-obs__award-v2-value-label">{subtitle.toLowerCase().includes('run') || title.toLowerCase().includes('orange') ? 'RUNS' : title.toLowerCase().includes('purple') ? 'WICKETS' : 'POINTS'}</span>
          </div>
        </div>

        {/* Right: Player image */}
        {imageUrl && (
          <div className="score-obs__award-v2-image" style={{ background: `linear-gradient(180deg, ${color}10, ${color}30)` }}>
            <img src={imageUrl} alt={playerName} className="score-obs__award-v2-img" />
            <div className="score-obs__award-v2-img-gradient" style={{ background: `linear-gradient(180deg, transparent 50%, ${color}40 100%)` }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Ticker With Intro Animation ──

function TickerWithIntro({ live, match, battingTeam, bowlingTeam, config, lineups, playerImages }: {
  live: LiveScore;
  match: MatchSetup;
  battingTeam: string;
  bowlingTeam: string;
  config: ScoringOverlayConfig;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  playerImages: Record<string, string>;
}) {
  // Skip intro if match is already in progress (balls bowled) — only show intro on fresh match start
  const matchAlreadyStarted = live.overs > 0 || (live.currentOverBalls?.length || 0) > 0;
  const [introPhase, setIntroPhase] = useState<'venue' | 'logos' | 'reveal' | 'done'>(matchAlreadyStarted ? 'done' : 'venue');
  const ticker = config.tickerConfig;
  const position = ticker?.position || 'bottom';

  useEffect(() => {
    if (matchAlreadyStarted) return; // No intro needed
    // Phase 1: venue info (2.5s) → Phase 2: logos slide in (3s) → Phase 3: reveal ticker (1.5s) → done
    const t1 = setTimeout(() => setIntroPhase('logos'), 2500);
    const t2 = setTimeout(() => setIntroPhase('reveal'), 5500);
    const t3 = setTimeout(() => setIntroPhase('done'), 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const battingLogo = live.battingTeamId === match.teamA.id ? match.teamA.logoUrl : match.teamB.logoUrl;
  const bowlingLogo = live.bowlingTeamId === match.teamA.id ? match.teamA.logoUrl : match.teamB.logoUrl;

  // Single flat AnimatePresence — each phase has a unique key for clean transitions
  if (introPhase === 'done') {
    return (
      <ScorecardTicker
        live={live} match={match} battingTeam={battingTeam} bowlingTeam={bowlingTeam}
        config={config} lineups={lineups} playerImages={playerImages}
      />
    );
  }

  return (
    <div className={`score-ticker-intro score-ticker-intro--${position}`}>
      <AnimatePresence mode="wait">
        {/* Phase 1: Venue + Match Info */}
        {introPhase === 'venue' && (
          <motion.div
            key="venue"
            className="score-ticker-intro__venue"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          >
            <span className="score-ticker-intro__teams">
              {match.teamA.name} vs {match.teamB.name}
            </span>
            <span className="score-ticker-intro__venue-text">
              {match.venue} • {new Date(match.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </motion.div>
        )}

        {/* Phase 2: Logos slide in from left/right */}
        {introPhase === 'logos' && (
          <motion.div
            key="logos"
            className="score-ticker-intro__logos"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="score-ticker-intro__logo-wrap"
              initial={{ x: -200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.1 }}
            >
              {battingLogo ? (
                <img src={battingLogo} alt={battingTeam} className="score-ticker-intro__logo-img" />
              ) : (
                <div className="score-ticker-intro__logo-fallback">{battingTeam.slice(0, 3).toUpperCase()}</div>
              )}
            </motion.div>

            <motion.div
              className="score-ticker-intro__vs"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.4 }}
            >
              VS
            </motion.div>

            <motion.div
              className="score-ticker-intro__logo-wrap"
              initial={{ x: 200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.1 }}
            >
              {bowlingLogo ? (
                <img src={bowlingLogo} alt={bowlingTeam} className="score-ticker-intro__logo-img" />
              ) : (
                <div className="score-ticker-intro__logo-fallback">{bowlingTeam.slice(0, 3).toUpperCase()}</div>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Phase 3: Collapse into ticker shape */}
        {introPhase === 'reveal' && (
          <motion.div
            key="reveal"
            className="score-ticker-intro__reveal"
            initial={{ scaleX: 0.3, opacity: 0.5 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <span className="score-ticker-intro__reveal-text">MATCH LIVE</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

function PointsTableOverlay({ allMatches, allTeams }: {
  allMatches: Record<string, { setup: MatchSetup; final?: MatchScore }>;
  allTeams?: { id: string; name: string; logoUrl?: string }[];
}) {
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

  // Add ALL tournament teams from auction (even those without matches yet)
  if (allTeams) {
    for (const team of allTeams) {
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

// ── Match Intro Overlay (shown before innings starts) ──

function MatchIntroOverlay({ match, config, lineups, playerImages, impactPlayers }: {
  match: MatchSetup;
  config: ScoringOverlayConfig;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  playerImages: Record<string, string>;
  impactPlayers?: { teamA: ImpactPlayer[]; teamB: ImpactPlayer[] };
}) {
  const [phase, setPhase] = useState(0); // 0=matchup, 1=teamA, 2=teamB, 3=ready
  const lineupsLoadedRef = useRef(false);

  useEffect(() => {
    const hasTeamA = lineups.teamA && lineups.teamA.players.length > 0;
    const hasTeamB = lineups.teamB && lineups.teamB.players.length > 0;

    // If lineups arrived late, restart the sequence from the beginning
    if ((hasTeamA || hasTeamB) && !lineupsLoadedRef.current) {
      lineupsLoadedRef.current = true;
      setPhase(0);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    if (hasTeamA && hasTeamB) {
      // Full sequence: matchup(4s) → teamA(4s) → teamB(4s) → ready
      timers.push(setTimeout(() => setPhase(1), 4000));
      timers.push(setTimeout(() => setPhase(2), 8000));
      timers.push(setTimeout(() => setPhase(3), 12000));
    } else if (hasTeamA) {
      timers.push(setTimeout(() => setPhase(1), 4000));
      timers.push(setTimeout(() => setPhase(3), 8000));
    } else if (hasTeamB) {
      timers.push(setTimeout(() => setPhase(2), 4000));
      timers.push(setTimeout(() => setPhase(3), 8000));
    } else {
      // No lineups yet — just show matchup for now, will restart when lineups arrive
      timers.push(setTimeout(() => setPhase(3), 6000));
    }
    return () => timers.forEach(clearTimeout);
  }, [lineups.teamA, lineups.teamB]);

  // Build player image map
  const imgMap: Record<string, string> = { ...playerImages };
  [lineups.teamA, lineups.teamB].forEach(l => {
    l?.players?.forEach(p => { if (p.imageUrl) imgMap[p.playerId] = p.imageUrl; });
  });

  return (
    <div className="score-obs__match-intro">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div
            key="matchup"
            className="score-obs__intro-matchup"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <div className="score-obs__intro-team">
              {match.teamA.logoUrl && <img src={match.teamA.logoUrl} alt="" className="score-obs__intro-logo" />}
              <span className="score-obs__intro-team-name" style={{ color: match.teamA.primaryColor || '#3b82f6' }}>
                {match.teamA.name}
              </span>
            </div>
            <div className="score-obs__intro-vs">
              <span>VS</span>
            </div>
            <div className="score-obs__intro-team">
              {match.teamB.logoUrl && <img src={match.teamB.logoUrl} alt="" className="score-obs__intro-logo" />}
              <span className="score-obs__intro-team-name" style={{ color: match.teamB.primaryColor || '#ef4444' }}>
                {match.teamB.name}
              </span>
            </div>
            <div className="score-obs__intro-venue">
              <span>{match.venue}</span>
              <span>{new Date(match.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </motion.div>
        )}

        {phase === 1 && lineups.teamA && (
          <motion.div
            key="teamA"
            className="score-obs__squad-reveal"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          >
            {/* Header */}
            <div className="score-obs__squad-header" style={{ background: `linear-gradient(90deg, #08082f, ${match.teamA.primaryColor || '#004be2'}80, #08082f)` }}>
              {match.teamA.logoUrl && <img src={match.teamA.logoUrl} alt="" className="score-obs__squad-header-logo score-obs__squad-header-logo--left" />}
              <div className="score-obs__squad-header-center">
                <h1 className="score-obs__squad-team-name">{match.teamA.name}</h1>
                {config.tournamentName && (
                  <div className="score-obs__squad-tournament-badge">
                    <span>{config.tournamentName}</span>
                  </div>
                )}
              </div>
              {config.broadcastPartnerLogo && <img src={config.broadcastPartnerLogo} alt="" className="score-obs__squad-header-logo score-obs__squad-header-logo--right" />}
            </div>

            {/* Players Grid + Impact Subs */}
            <div className="score-obs__squad-body">
              <div className="score-obs__squad-grid-container">
                {/* Top Row (up to 6) */}
                <div className="score-obs__squad-grid score-obs__squad-grid--top">
                  {lineups.teamA.players.slice(0, 6).map((p, i) => (
                    <motion.div
                      key={p.playerId}
                      className={`score-obs__squad-card ${p.isCaptain ? 'score-obs__squad-card--captain' : ''}`}
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
                    >
                      {p.isCaptain && <div className="score-obs__squad-captain-badge">C</div>}
                      {p.isWicketKeeper && <div className="score-obs__squad-wk-badge">WK</div>}
                      <div className="score-obs__squad-card-img">
                        {imgMap[p.playerId]
                          ? <img src={imgMap[p.playerId]} alt={p.playerName} />
                          : <span className="score-obs__squad-card-placeholder">{p.playerName.charAt(0)}</span>
                        }
                      </div>
                      <div className="score-obs__squad-card-name">
                        <span>{p.playerName}</span>
                      </div>
                      <div className="score-obs__squad-card-role">
                        <span>{p.role}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {/* Bottom Row (remaining, centered) */}
                {lineups.teamA.players.length > 6 && (
                  <div className="score-obs__squad-grid score-obs__squad-grid--bottom">
                    {lineups.teamA.players.slice(6, 11).map((p, i) => (
                      <motion.div
                        key={p.playerId}
                        className={`score-obs__squad-card ${p.isCaptain ? 'score-obs__squad-card--captain' : ''}`}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: (i + 6) * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
                      >
                        {p.isCaptain && <div className="score-obs__squad-captain-badge">C</div>}
                        {p.isWicketKeeper && <div className="score-obs__squad-wk-badge">WK</div>}
                        <div className="score-obs__squad-card-img">
                          {imgMap[p.playerId]
                            ? <img src={imgMap[p.playerId]} alt={p.playerName} />
                            : <span className="score-obs__squad-card-placeholder">{p.playerName.charAt(0)}</span>
                          }
                        </div>
                        <div className="score-obs__squad-card-name">
                          <span>{p.playerName}</span>
                        </div>
                        <div className="score-obs__squad-card-role">
                          <span>{p.role}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Impact Subs Panel */}
              {impactPlayers?.teamA && impactPlayers.teamA.length > 0 && (
                <motion.div
                  className="score-obs__impact-subs-panel"
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.6, type: 'spring', stiffness: 180, damping: 22 }}
                >
                  <div className="score-obs__impact-subs-header">
                    <span>⚡ IMPACT SUBS</span>
                  </div>
                  <div className="score-obs__impact-subs-list">
                    {impactPlayers.teamA.map((p, i) => (
                      <motion.div
                        key={p.playerId}
                        className="score-obs__impact-sub-item"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + i * 0.12 }}
                      >
                        <span className="score-obs__impact-sub-name">{p.playerName}</span>
                        <span className="score-obs__impact-sub-role">{p.role}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {config.titleSponsorName && (
              <div className="score-obs__squad-footer">
                {config.titleSponsorLogo && <img src={config.titleSponsorLogo} alt="" className="score-obs__squad-footer-sponsor" />}
                <span className="score-obs__squad-footer-text">{config.titleSponsorName}</span>
              </div>
            )}
          </motion.div>
        )}

        {phase === 2 && lineups.teamB && (
          <motion.div
            key="teamB"
            className="score-obs__squad-reveal"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          >
            {/* Header */}
            <div className="score-obs__squad-header" style={{ background: `linear-gradient(90deg, #08082f, ${match.teamB.primaryColor || '#ef4444'}80, #08082f)` }}>
              {match.teamB.logoUrl && <img src={match.teamB.logoUrl} alt="" className="score-obs__squad-header-logo score-obs__squad-header-logo--left" />}
              <div className="score-obs__squad-header-center">
                <h1 className="score-obs__squad-team-name">{match.teamB.name}</h1>
                {config.tournamentName && (
                  <div className="score-obs__squad-tournament-badge">
                    <span>{config.tournamentName}</span>
                  </div>
                )}
              </div>
              {config.broadcastPartnerLogo && <img src={config.broadcastPartnerLogo} alt="" className="score-obs__squad-header-logo score-obs__squad-header-logo--right" />}
            </div>

            {/* Players Grid + Impact Subs */}
            <div className="score-obs__squad-body">
              <div className="score-obs__squad-grid-container">
                {/* Top Row (up to 6) */}
                <div className="score-obs__squad-grid score-obs__squad-grid--top">
                  {lineups.teamB.players.slice(0, 6).map((p, i) => (
                    <motion.div
                      key={p.playerId}
                      className={`score-obs__squad-card ${p.isCaptain ? 'score-obs__squad-card--captain' : ''}`}
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
                    >
                      {p.isCaptain && <div className="score-obs__squad-captain-badge">C</div>}
                      {p.isWicketKeeper && <div className="score-obs__squad-wk-badge">WK</div>}
                      <div className="score-obs__squad-card-img">
                        {imgMap[p.playerId]
                          ? <img src={imgMap[p.playerId]} alt={p.playerName} />
                          : <span className="score-obs__squad-card-placeholder">{p.playerName.charAt(0)}</span>
                        }
                      </div>
                      <div className="score-obs__squad-card-name">
                        <span>{p.playerName}</span>
                      </div>
                      <div className="score-obs__squad-card-role">
                        <span>{p.role}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {/* Bottom Row (remaining, centered) */}
                {lineups.teamB.players.length > 6 && (
                  <div className="score-obs__squad-grid score-obs__squad-grid--bottom">
                    {lineups.teamB.players.slice(6, 11).map((p, i) => (
                      <motion.div
                        key={p.playerId}
                        className={`score-obs__squad-card ${p.isCaptain ? 'score-obs__squad-card--captain' : ''}`}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: (i + 6) * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
                      >
                        {p.isCaptain && <div className="score-obs__squad-captain-badge">C</div>}
                        {p.isWicketKeeper && <div className="score-obs__squad-wk-badge">WK</div>}
                        <div className="score-obs__squad-card-img">
                          {imgMap[p.playerId]
                            ? <img src={imgMap[p.playerId]} alt={p.playerName} />
                            : <span className="score-obs__squad-card-placeholder">{p.playerName.charAt(0)}</span>
                          }
                        </div>
                        <div className="score-obs__squad-card-name">
                          <span>{p.playerName}</span>
                        </div>
                        <div className="score-obs__squad-card-role">
                          <span>{p.role}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Impact Subs Panel */}
              {impactPlayers?.teamB && impactPlayers.teamB.length > 0 && (
                <motion.div
                  className="score-obs__impact-subs-panel"
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.6, type: 'spring', stiffness: 180, damping: 22 }}
                >
                  <div className="score-obs__impact-subs-header">
                    <span>⚡ IMPACT SUBS</span>
                  </div>
                  <div className="score-obs__impact-subs-list">
                    {impactPlayers.teamB.map((p, i) => (
                      <motion.div
                        key={p.playerId}
                        className="score-obs__impact-sub-item"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + i * 0.12 }}
                      >
                        <span className="score-obs__impact-sub-name">{p.playerName}</span>
                        <span className="score-obs__impact-sub-role">{p.role}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {config.titleSponsorName && (
              <div className="score-obs__squad-footer">
                {config.titleSponsorLogo && <img src={config.titleSponsorLogo} alt="" className="score-obs__squad-footer-sponsor" />}
                <span className="score-obs__squad-footer-text">{config.titleSponsorName}</span>
              </div>
            )}
          </motion.div>
        )}

        {phase === 3 && (
          <motion.div
            key="ready"
            className="score-obs__intro-ready"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          >
            {config.tournamentLogo && <img src={config.tournamentLogo} alt="" className="score-obs__intro-tournament-logo" />}
            <span className="score-obs__intro-ready-text">MATCH DAY</span>
            <span className="score-obs__intro-ready-teams">
              {match.teamA.name} vs {match.teamB.name}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Innings Intro Card (batsmen/bowler with images at start of innings) ──

function InningsIntroCard({ type, live, match, playerImages, lineups }: {
  type: 'batsmen' | 'bowler';
  live: LiveScore;
  match: MatchSetup;
  playerImages: Record<string, string>;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
}) {
  const imgMap: Record<string, string> = { ...playerImages };
  [lineups.teamA, lineups.teamB].forEach(l => {
    l?.players?.forEach(p => { if (p.imageUrl) imgMap[p.playerId] = p.imageUrl; });
  });

  const battingTeamName = live.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name;
  const bowlingTeamName = live.bowlingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name;

  if (type === 'batsmen') {
    return (
      <motion.div
        className="score-obs__innings-intro score-obs__innings-intro--bat"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      >
        <div className="score-obs__innings-intro-header">
          <span className="score-obs__innings-intro-label">OPENING BATSMEN</span>
          <span className="score-obs__innings-intro-team">{battingTeamName}</span>
        </div>
        <div className="score-obs__innings-intro-players">
          {(live.currentBatsmen || []).map(b => (
            <div key={b.playerId} className="score-obs__innings-intro-player">
              <div className="score-obs__innings-intro-img">
                {imgMap[b.playerId]
                  ? <img src={imgMap[b.playerId]} alt={b.playerName} />
                  : <span className="score-obs__innings-intro-placeholder">{b.playerName.charAt(0)}</span>
                }
              </div>
              <div className="score-obs__innings-intro-info">
                <span className="score-obs__innings-intro-name">{b.playerName}</span>
                {b.isOnStrike && <span className="score-obs__innings-intro-strike">🏏 On Strike</span>}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="score-obs__innings-intro score-obs__innings-intro--bowl"
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
    >
      <div className="score-obs__innings-intro-header">
        <span className="score-obs__innings-intro-label">OPENING BOWLER</span>
        <span className="score-obs__innings-intro-team">{bowlingTeamName}</span>
      </div>
      <div className="score-obs__innings-intro-players">
        <div className="score-obs__innings-intro-player">
          <div className="score-obs__innings-intro-img">
            {imgMap[live.currentBowler.playerId]
              ? <img src={imgMap[live.currentBowler.playerId]} alt={live.currentBowler.playerName} />
              : <span className="score-obs__innings-intro-placeholder">{live.currentBowler.playerName.charAt(0)}</span>
            }
          </div>
          <div className="score-obs__innings-intro-info">
            <span className="score-obs__innings-intro-name">{live.currentBowler.playerName}</span>
            <span className="score-obs__innings-intro-stats">
              {live.currentBowler.overs} ov · {live.currentBowler.wickets}/{live.currentBowler.runs}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Field Placement Overlay (full-screen triggered via overlay button) ─────

function FieldPlacementOverlay({ placement }: { placement: FieldPlacement }) {
  return (
    <motion.div
      className="score-obs__field-overlay-full"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.7, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 160, damping: 20 }}
    >
      <div className="score-obs__field-overlay-ground">
        <div className="score-obs__field-pitch" />
        <div className="score-obs__field-inner-circle" />
        {placement.positions.map(pos => (
          <div
            key={pos.id}
            className="score-obs__field-overlay-dot"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div className="score-obs__field-overlay-dot-inner" />
            <span className="score-obs__field-overlay-dot-label">{pos.label}</span>
          </div>
        ))}
      </div>
      <div className="score-obs__field-overlay-title">{placement.name}</div>
    </motion.div>
  );
}
