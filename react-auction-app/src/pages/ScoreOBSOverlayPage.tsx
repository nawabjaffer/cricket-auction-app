// ============================================================================
// SCORE OBS OVERLAY PAGE — /:tenantSlug/score/obs-overlay
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
import { getDatabase, ref, onValue } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import type {
  LiveScore, OverlayControlState, OverlayType,
  ScoringOverlayConfig, ScoringAd, MatchSetup, LiveQuestion,
  PreMatchState, MatchLineup,
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
  const [overlay, setOverlay] = useState<OverlayControlState | null>(null);
  const [config, setConfig] = useState<ScoringOverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [ads, setAds] = useState<ScoringAd[]>([]);
  const [preMatch, setPreMatch] = useState<PreMatchState | null>(null);
  const [lineups, setLineups] = useState<{ teamA: MatchLineup | null; teamB: MatchLineup | null }>({ teamA: null, teamB: null });

  // Local overlay state (for keyboard-triggered overlays)
  const [localOverlay, setLocalOverlay] = useState<OverlayType>('none');
  const [showAd, setShowAd] = useState(false);
  const adIndexRef = useRef(0);
  const questionIndexRef = useRef(0);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>();

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
        if (ctrl.activeOverlay !== 'none') setLocalOverlay(ctrl.activeOverlay);
        else setLocalOverlay('none');
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

    // Lineups (team A & B)
    unsubs.push(onValue(ref(obsDb, `${basePath}/matches/${matchId}/lineups`), snap => {
      if (snap.exists()) {
        const data = snap.val() as Record<string, MatchLineup>;
        const values = Object.values(data);
        setLineups({
          teamA: values[0] || null,
          teamB: values[1] || null,
        });
      }
    }));

    return () => unsubs.forEach(u => u());
  }, [matchId]);

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
      else if (key === '4') triggerOverlay('boundary_four', 4000);
      else if (key === '6') triggerOverlay('boundary_six', 5000);
      else if (key === 'w' || key === 'W') triggerOverlay('wicket', 5000);
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
      <div className="score-obs__top-bar">
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
      </div>

      {/* ── Score Strip (always visible) ───────────────────────────── */}
      <div className="score-obs__score-strip">
        <div className="score-obs__team-box">
          {match?.teamA.logoUrl && <img src={match.teamA.logoUrl} alt="" className="score-obs__team-logo" />}
          <span className="score-obs__team-short">{battingTeamName}</span>
        </div>
        <div className="score-obs__score-main">
          <span className="score-obs__score-runs">{live.runs}/{live.wickets}</span>
          <span className="score-obs__score-overs">({live.overs})</span>
        </div>
        <div className="score-obs__score-meta">
          <span>CRR {live.runRate}</span>
          {live.requiredRate !== undefined && <span>RRR {live.requiredRate}</span>}
          {live.target !== undefined && <span>Target {live.target}</span>}
        </div>
        <div className="score-obs__batsmen-mini">
          {live.currentBatsmen.map(b => (
            <span key={b.playerId} className={`score-obs__bat-mini ${b.isOnStrike ? 'score-obs__bat-mini--strike' : ''}`}>
              {b.playerName.split(' ').pop()} {b.runs}({b.balls})
            </span>
          ))}
        </div>
        <div className="score-obs__over-balls">
          {live.currentOverBalls.map((ball, i) => (
            <span key={i} className={`score-obs__ball ${getBallClass(ball)}`}>{ball}</span>
          ))}
        </div>
      </div>

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
        {effectiveOverlay === 'batsman_striker' && (
          <BatsmanStatsOverlay key="striker" batsman={live.currentBatsmen[0]} />
        )}
        {effectiveOverlay === 'batsman_nonstriker' && (
          <BatsmanStatsOverlay key="non-striker" batsman={live.currentBatsmen[1]} />
        )}
        {effectiveOverlay === 'bowler' && (
          <BowlerStatsOverlay bowler={live.currentBowler} />
        )}
        {effectiveOverlay === 'full_scorecard' && (
          <FullScorecardOverlay live={live} battingTeam={battingTeamName} bowlingTeam={bowlingTeamName} />
        )}
        {effectiveOverlay === 'boundary_four' && config.enableBoundaryAnimation && (
          <BoundaryOverlay type="four" />
        )}
        {effectiveOverlay === 'boundary_six' && config.enableSixerAnimation && (
          <BoundaryOverlay type="six" />
        )}
        {effectiveOverlay === 'wicket' && config.enableWicketAnimation && (
          <WicketOverlay imageUrl={config.wicketImageUrl} />
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

function FullScorecardOverlay({ live, battingTeam, bowlingTeam }: {
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
        {live.currentBatsmen.map(b => (
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
        <div className="score-obs__scorecard-row">
          <span>{live.currentBowler.playerName}</span>
          <span>{live.currentBowler.overs}</span><span>{live.currentBowler.maidens}</span>
          <span>{live.currentBowler.runs}</span><span>{live.currentBowler.wickets}</span>
          <span>{live.currentBowler.economy}</span>
        </div>
      </div>

      <div className="score-obs__scorecard-footer">
        <span>CRR: {live.runRate}</span>
        {live.requiredRate !== undefined && <span>RRR: {live.requiredRate}</span>}
        <span>P'ship: {live.partnership.runs}({live.partnership.balls})</span>
      </div>
    </motion.div>
  );
}

function BoundaryOverlay({ type }: { type: 'four' | 'six' }) {
  const isSix = type === 'six';
  return (
    <motion.div
      className={`score-obs__celebration score-obs__celebration--${type}`}
      initial={{ scale: 0, rotate: -15 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span className="score-obs__celebration-num">{isSix ? '6' : '4'}</span>
      <span className="score-obs__celebration-text">{isSix ? 'MAXIMUM!' : 'FOUR!'}</span>
    </motion.div>
  );
}

function WicketOverlay({ imageUrl }: { imageUrl?: string }) {
  return (
    <motion.div
      className="score-obs__celebration score-obs__celebration--wicket"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 50, opacity: 0 }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="Wicket" className="score-obs__celebration-img" />
      ) : (
        <>
          <span className="score-obs__celebration-num">W</span>
          <span className="score-obs__celebration-text">WICKET!</span>
        </>
      )}
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
