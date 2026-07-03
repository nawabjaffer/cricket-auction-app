// ============================================================================
// FOOTBALL OBS OVERLAY — /:tenantSlug/football/scorer/obs-overlay?matchId=xxx
// Transparent browser source for OBS + mobile live telecast. Shows a broadcast
// scoreboard (top-left by default) with team logos, score, match timer, half /
// added / extra time, LIVE badge, and goal / card celebration animations.
//
// Theme defaults to the requested red / yellow / black palette (configurable
// from the Football Admin › Overlay tab).
//
// DATA: dedicated named Firebase app "football-obs" for zero-delay reads.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import {
  computeMatchMinute, FOOTBALL_HALF_LABELS, DEFAULT_FOOTBALL_OVERLAY_CONFIG,
} from '../types/football';
import type {
  FootballMatchSetup, FootballLiveState, FootballOverlayConfig, FootballOverlayControl,
} from '../types/football';
import './FootballOBSOverlayPage.css';

// ── Dedicated Firebase app (module-level, zero-delay) ────────────────────────
const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const FB_APP = 'football-obs';
const fbApp = getApps().find((a) => a.name === FB_APP) ?? initializeApp(FB_CONFIG, FB_APP);
const fbDb = getDatabase(fbApp);

export default function FootballOBSOverlayPage() {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<FootballMatchSetup | null>(null);
  const [live, setLive] = useState<FootballLiveState | null>(null);
  const [config, setConfig] = useState<FootballOverlayConfig>(DEFAULT_FOOTBALL_OVERLAY_CONFIG);
  const [control, setControl] = useState<FootballOverlayControl | null>(null);
  const [, force] = useState(0); // 1 Hz clock re-render
  const lastCelebTs = useRef<number>(0);
  const [celeb, setCeleb] = useState<FootballOverlayControl | null>(null);

  // matchId from URL
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('matchId');
    if (id) setMatchId(id);
  }, []);

  // Subscriptions
  useEffect(() => {
    if (!matchId) return;
    const base = tenantPath('football');
    const unsubs = [
      onValue(ref(fbDb, `${base}/matches/${matchId}/setup`), (s) => s.exists() && setMatch(s.val())),
      onValue(ref(fbDb, `${base}/matches/${matchId}/live`), (s) => s.exists() && setLive(s.val())),
      onValue(ref(fbDb, `${base}/overlayConfig`), (s) => setConfig(s.exists() ? { ...DEFAULT_FOOTBALL_OVERLAY_CONFIG, ...s.val() } : DEFAULT_FOOTBALL_OVERLAY_CONFIG)),
      onValue(ref(fbDb, `${base}/matches/${matchId}/overlay`), (s) => setControl(s.exists() ? s.val() : null)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [matchId]);

  // Clock ticker
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Fire celebrations on new overlay control events
  useEffect(() => {
    if (!control || control.activeOverlay === 'none') return;
    const ts = control.lastUpdated || 0;
    if (ts === lastCelebTs.current || Date.now() - ts > 15000) { lastCelebTs.current = ts; return; }
    lastCelebTs.current = ts;
    const isGoal = control.activeOverlay === 'goal' || control.activeOverlay === 'penalty';
    const isCard = control.activeOverlay === 'red_card' || control.activeOverlay === 'yellow_card';
    if ((isGoal && config.enableGoalAnimation) || (isCard && config.enableCardAnimation) ||
        ['kickoff', 'half_time', 'full_time', 'substitution'].includes(control.activeOverlay)) {
      setCeleb(control);
      const dur = isGoal ? (config.goalAnimation?.durationMs ?? 5000) : isCard ? (config.redCardAnimation?.durationMs ?? 4000) : 3500;
      const t = setTimeout(() => setCeleb(null), dur);
      return () => clearTimeout(t);
    }
  }, [control, config]);

  if (!matchId || !match || !live) {
    return <div className="fbo" data-empty="true" />;
  }

  const { minute, second } = computeMatchMinute(live);
  const clock = `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const showAdded = live.addedTimeMin > 0 && (live.half === 'first_half' || live.half === 'second_half' || live.half === 'extra_first' || live.half === 'extra_second');

  const theme = {
    '--fb-primary': config.primaryColor,
    '--fb-secondary': config.secondaryColor,
    '--fb-accent': config.accentColor,
    '--fb-text': config.textColor,
  } as React.CSSProperties;

  return (
    <div className={`fbo fbo--${config.scoreboardPosition}`} style={theme}>
      {/* Broadcast scoreboard */}
      <div className="fbo__scoreboard">
        {config.tournamentLogo && (
          <div className="fbo__tourn-logo"><img src={config.tournamentLogo} alt="" crossOrigin="anonymous" /></div>
        )}

        <div className="fbo__strip">
          {/* Home */}
          <div className="fbo__team fbo__team--home">
            <div className="fbo__team-logo" style={{ background: match.teamA.primaryColor }}>
              {match.teamA.logoUrl ? <img src={match.teamA.logoUrl} alt="" crossOrigin="anonymous" /> : <span>{match.teamA.shortName}</span>}
            </div>
            <span className="fbo__team-name">{match.teamA.shortName}</span>
          </div>

          {/* Score */}
          <div className="fbo__score">
            <span className="fbo__score-num">{live.homeScore}</span>
            <span className="fbo__score-sep">-</span>
            <span className="fbo__score-num">{live.awayScore}</span>
          </div>

          {/* Away */}
          <div className="fbo__team fbo__team--away">
            <span className="fbo__team-name">{match.teamB.shortName}</span>
            <div className="fbo__team-logo" style={{ background: match.teamB.primaryColor }}>
              {match.teamB.logoUrl ? <img src={match.teamB.logoUrl} alt="" crossOrigin="anonymous" /> : <span>{match.teamB.shortName}</span>}
            </div>
          </div>
        </div>

        {/* Timer / status bar */}
        <div className="fbo__status">
          {config.showLiveBadge && live.half !== 'full_time' && live.half !== 'not_started' && (
            <span className="fbo__live"><span className="fbo__live-dot" />LIVE</span>
          )}
          {config.showTimer && (
            <span className="fbo__clock">
              {clock}{showAdded && <span className="fbo__added">+{live.addedTimeMin}</span>}
            </span>
          )}
          <span className="fbo__half">{FOOTBALL_HALF_LABELS[live.half]}</span>
          {(live.homePenalties != null || live.awayPenalties != null) && (
            <span className="fbo__pens">PEN {live.homePenalties ?? 0}-{live.awayPenalties ?? 0}</span>
          )}
        </div>
      </div>

      {config.broadcastPartnerLogo && (
        <div className="fbo__partner"><img src={config.broadcastPartnerLogo} alt="" crossOrigin="anonymous" /></div>
      )}

      {/* Celebration animations */}
      <AnimatePresence>
        {celeb && <Celebration control={celeb} config={config} match={match} />}
      </AnimatePresence>
    </div>
  );
}

function Celebration({ control, config, match }: Readonly<{
  control: FootballOverlayControl; config: FootballOverlayConfig; match: FootballMatchSetup;
}>) {
  const ev = control.activeEvent;
  const type = control.activeOverlay;
  const teamColor = ev && match.teamA.id === ev.teamId ? match.teamA.primaryColor : match.teamB.primaryColor;

  if (type === 'goal' || type === 'penalty') {
    const img = config.goalAnimation?.mediaUrl;
    return (
      <motion.div className="fbo__celeb fbo__celeb--goal"
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        {img ? <img src={img} alt="" className="fbo__celeb-media" crossOrigin="anonymous" /> : (
          <>
            <motion.div className="fbo__celeb-big" style={{ color: config.accentColor }}
              animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}>
              {config.goalAnimation?.text || 'GOAL!'}
            </motion.div>
            {ev?.playerName && (
              <div className="fbo__celeb-player" style={{ borderColor: teamColor }}>
                <span className="fbo__celeb-min">{ev.minute}'</span>
                <span className="fbo__celeb-name">{ev.playerName}</span>
                {ev.assistPlayerName && <span className="fbo__celeb-assist">assist · {ev.assistPlayerName}</span>}
              </div>
            )}
          </>
        )}
      </motion.div>
    );
  }

  if (type === 'red_card' || type === 'yellow_card') {
    const isRed = type === 'red_card';
    return (
      <motion.div className="fbo__celeb fbo__celeb--card"
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <motion.div className={`fbo__card ${isRed ? 'fbo__card--red' : 'fbo__card--yellow'}`}
          initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ duration: 0.4 }} />
        <div className="fbo__celeb-info">
          <div className="fbo__celeb-title">{isRed ? 'RED CARD' : 'YELLOW CARD'}</div>
          {ev?.playerName && <div className="fbo__celeb-sub">{ev.minute}' · {ev.playerName}</div>}
        </div>
      </motion.div>
    );
  }

  if (type === 'substitution') {
    return (
      <motion.div className="fbo__celeb fbo__celeb--sub"
        initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
        <div className="fbo__sub-icon">🔁</div>
        <div className="fbo__celeb-info">
          <div className="fbo__celeb-title">SUBSTITUTION</div>
          {ev?.playerName && <div className="fbo__celeb-sub"><span className="fbo__sub-in">▲ {ev.playerName}</span>{ev.subOutPlayerName && <span className="fbo__sub-out">▼ {ev.subOutPlayerName}</span>}</div>}
        </div>
      </motion.div>
    );
  }

  // kickoff / half_time / full_time banner
  const bannerText = type === 'kickoff' ? 'KICK OFF' : type === 'half_time' ? 'HALF TIME' : 'FULL TIME';
  return (
    <motion.div className="fbo__celeb fbo__celeb--banner"
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
      <div className="fbo__banner" style={{ background: config.secondaryColor }}>{bannerText}</div>
    </motion.div>
  );
}
