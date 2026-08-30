// ============================================================================
// KABADDI OBS OVERLAY — /:tenantSlug/kabaddi/scorer/obs-overlay?matchId=xxx
//
// Transparent browser source for OBS + mobile telecast. Reuses the football
// overlay's structure but anchors the scorecard along the BOTTOM of frame and
// adds kabaddi furniture: 30-second raid clock, players-on-mat indicators,
// do-or-die flag, and super raid / super tackle / all-out celebrations that are
// configured from the Kabaddi Admin › Overlay tab.
//
// DATA: dedicated named Firebase app "kabaddi-obs" for zero-delay reads.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import {
  computeKabaddiClock, raidSecondsRemaining, KABADDI_HALF_LABELS,
  DEFAULT_KABADDI_OVERLAY_CONFIG, DEFAULT_KABADDI_RULES,
} from '../types/kabaddi';
import type {
  KabaddiMatchSetup, KabaddiLiveState, KabaddiOverlayConfig,
  KabaddiOverlayControl, KabaddiAnimationConfig, KabaddiRulesConfig, KabaddiTeamState,
} from '../types/kabaddi';
import './KabaddiOBSOverlayPage.css';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const FB_APP = 'kabaddi-obs';
const fbApp = getApps().find(a => a.name === FB_APP) ?? initializeApp(FB_CONFIG, FB_APP);
const fbDb = getDatabase(fbApp);

/** Animation config + enable flag for each celebration type. */
function celebFor(type: KabaddiOverlayControl['activeOverlay'], config: KabaddiOverlayConfig): {
  anim?: KabaddiAnimationConfig; enabled: boolean; fallback: string; color: string;
} {
  switch (type) {
    case 'super_raid':
      return { anim: config.superRaidAnimation, enabled: config.enableSuperRaidAnimation, fallback: 'SUPER RAID!', color: config.superRaidAnimation?.color || '#f59e0b' };
    case 'super_tackle':
      return { anim: config.superTackleAnimation, enabled: config.enableSuperTackleAnimation, fallback: 'SUPER TACKLE!', color: config.superTackleAnimation?.color || '#3b82f6' };
    case 'all_out':
      return { anim: config.allOutAnimation, enabled: config.enableAllOutAnimation, fallback: 'ALL OUT!', color: config.allOutAnimation?.color || '#ef4444' };
    case 'bonus_point':
      return { anim: config.bonusAnimation, enabled: config.enableBonusAnimation, fallback: 'BONUS!', color: config.bonusAnimation?.color || '#22c55e' };
    case 'do_or_die':
      return { anim: config.doOrDieAnimation, enabled: config.enableDoOrDieAnimation, fallback: 'DO OR DIE RAID', color: config.doOrDieAnimation?.color || '#a855f7' };
    default:
      return { enabled: true, fallback: '', color: config.accentColor };
  }
}

export default function KabaddiOBSOverlayPage() {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<KabaddiMatchSetup | null>(null);
  const [live, setLive] = useState<KabaddiLiveState | null>(null);
  const [config, setConfig] = useState<KabaddiOverlayConfig>(DEFAULT_KABADDI_OVERLAY_CONFIG);
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [control, setControl] = useState<KabaddiOverlayControl | null>(null);
  const [celeb, setCeleb] = useState<KabaddiOverlayControl | null>(null);
  const [, force] = useState(0);
  const lastCelebTs = useRef(0);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('matchId');
    if (id) setMatchId(id);
  }, []);

  useEffect(() => {
    if (!matchId) return;
    const base = tenantPath('kabaddi');
    const unsubs = [
      onValue(ref(fbDb, `${base}/matches/${matchId}/setup`), s => s.exists() && setMatch(s.val())),
      onValue(ref(fbDb, `${base}/matches/${matchId}/live`), s => {
        if (!s.exists()) return;
        setLive(s.val() as KabaddiLiveState);
      }),
      onValue(ref(fbDb, `${base}/overlayConfig`), s =>
        setConfig(s.exists() ? { ...DEFAULT_KABADDI_OVERLAY_CONFIG, ...s.val() } : DEFAULT_KABADDI_OVERLAY_CONFIG)),
      onValue(ref(fbDb, `${base}/rules`), s =>
        setRules(s.exists() ? { ...DEFAULT_KABADDI_RULES, ...s.val() } : DEFAULT_KABADDI_RULES)),
      onValue(ref(fbDb, `${base}/matches/${matchId}/overlay`), s => setControl(s.exists() ? s.val() : null)),
    ];
    return () => unsubs.forEach(u => u());
  }, [matchId]);

  // 1 Hz re-render drives both the match clock and the raid countdown.
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!control || control.activeOverlay === 'none') return;
    const ts = control.lastUpdated || 0;
    if (ts === lastCelebTs.current || Date.now() - ts > 15000) { lastCelebTs.current = ts; return; }
    lastCelebTs.current = ts;
    const { anim, enabled } = celebFor(control.activeOverlay, config);
    if (!enabled) return;
    setCeleb(control);
    const t = setTimeout(() => setCeleb(null), anim?.durationMs ?? 3500);
    return () => clearTimeout(t);
  }, [control, config]);

  if (!matchId || !match || !live) return <div className="kbo" data-empty="true" />;

  const { minute, second } = computeKabaddiClock(live);
  const clock = `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const raidLeft = config.showRaidClock ? raidSecondsRemaining(live, rules) : null;
  const raidingA = live.raidingTeamId === match.teamA.id;
  const raidingB = live.raidingTeamId === match.teamB.id;

  const theme = {
    '--kb-primary': config.primaryColor,
    '--kb-secondary': config.secondaryColor,
    '--kb-accent': config.accentColor,
    '--kb-text': config.textColor,
  } as React.CSSProperties;

  return (
    <div className={`kbo kbo--${config.scoreboardPosition}`} style={theme}>
      <div className="kbo__scoreboard">
        {config.tournamentLogo && (
          <div className="kbo__tourn-logo"><img src={config.tournamentLogo} alt="" crossOrigin="anonymous" /></div>
        )}

        <div className="kbo__strip">
          <TeamBlock
            side="home"
            name={match.teamA.shortName}
            logoUrl={match.teamA.logoUrl}
            color={match.teamA.primaryColor}
            state={live.teamA}
            raiding={raidingA}
            playersPerSide={rules.playersPerSide}
          />

          <div className="kbo__score">
            <span className="kbo__score-num">{live.teamA.score}</span>
            <span className="kbo__score-sep">:</span>
            <span className="kbo__score-num">{live.teamB.score}</span>
          </div>

          <TeamBlock
            side="away"
            name={match.teamB.shortName}
            logoUrl={match.teamB.logoUrl}
            color={match.teamB.primaryColor}
            state={live.teamB}
            raiding={raidingB}
            playersPerSide={rules.playersPerSide}
          />
        </div>

        <div className="kbo__status">
          {config.showLiveBadge && live.half !== 'full_time' && live.half !== 'not_started' && (
            <span className="kbo__live"><span className="kbo__live-dot" />LIVE</span>
          )}
          {config.showTimer && <span className="kbo__clock">{clock}</span>}
          <span className="kbo__half">{KABADDI_HALF_LABELS[live.half]}</span>

          {live.raiderName && (
            <span className="kbo__raider">
              <span className="kbo__raider-label">RAIDER</span>
              {live.raiderName}
            </span>
          )}

          {live.isDoOrDie && <span className="kbo__dod">DO OR DIE</span>}

          {raidLeft !== null && (
            <span className={`kbo__raid-clock ${raidLeft <= 5 ? 'kbo__raid-clock--urgent' : ''}`}>
              <span className="kbo__raid-clock-num">{raidLeft}</span>
              <span className="kbo__raid-clock-unit">s</span>
            </span>
          )}
        </div>
      </div>

      {config.broadcastPartnerLogo && (
        <div className="kbo__partner"><img src={config.broadcastPartnerLogo} alt="" crossOrigin="anonymous" /></div>
      )}

      <AnimatePresence>
        {celeb && <KabaddiCelebration control={celeb} config={config} />}
      </AnimatePresence>
    </div>
  );
}

// ── Team block: logo, code, players still on the mat ─────────────────────────

function TeamBlock({ side, name, logoUrl, color, state, raiding, playersPerSide }: Readonly<{
  side: 'home' | 'away';
  name: string;
  logoUrl?: string;
  color?: string;
  state: KabaddiTeamState;
  raiding: boolean;
  playersPerSide: number;
}>) {
  const dots = Array.from({ length: playersPerSide }, (_, i) => i < state.playersOnCourt);
  const logo = (
    <div className="kbo__team-logo" style={{ background: color }}>
      {logoUrl ? <img src={logoUrl} alt="" crossOrigin="anonymous" /> : <span>{name}</span>}
    </div>
  );
  const info = (
    <div className="kbo__team-info">
      <span className="kbo__team-name">{name}</span>
      <span className="kbo__mat" title={`${state.playersOnCourt} on the mat`}>
        {dots.map((on, i) => (
          <i key={i} className={`kbo__mat-dot ${on ? 'is-on' : ''}`} />
        ))}
      </span>
    </div>
  );

  return (
    <div className={`kbo__team kbo__team--${side} ${raiding ? 'is-raiding' : ''}`}>
      {side === 'home' ? <>{logo}{info}</> : <>{info}{logo}</>}
      {raiding && <span className="kbo__raid-flag">RAID</span>}
    </div>
  );
}

// ── Celebrations ─────────────────────────────────────────────────────────────

function KabaddiCelebration({ control, config }: Readonly<{
  control: KabaddiOverlayControl; config: KabaddiOverlayConfig;
}>) {
  const type = control.activeOverlay;
  const ev = control.activeEvent;
  const { anim, fallback, color } = celebFor(type, config);
  const text = anim?.text || fallback;

  if (anim?.mediaUrl) {
    return (
      <motion.div className="kbo__celeb"
        initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}>
        <img src={anim.mediaUrl} alt="" className="kbo__celeb-media" crossOrigin="anonymous" />
      </motion.div>
    );
  }

  if (type === 'all_out') {
    return (
      <motion.div className="kbo__celeb kbo__celeb--allout"
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
        <motion.div className="kbo__celeb-big" style={{ color }}
          animate={{ scale: [1, 1.14, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
          {text}
        </motion.div>
        <div className="kbo__celeb-sub">+{ev?.points ?? 2} POINTS · FULL REVIVAL</div>
      </motion.div>
    );
  }

  if (type === 'do_or_die') {
    return (
      <motion.div className="kbo__celeb kbo__celeb--dod"
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <motion.div className="kbo__dod-banner" style={{ background: color }}
          animate={{ opacity: [1, 0.65, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}>
          {text}
        </motion.div>
      </motion.div>
    );
  }

  const isRaid = type === 'super_raid';
  return (
    <motion.div className={`kbo__celeb ${isRaid ? 'kbo__celeb--raid' : 'kbo__celeb--tackle'}`}
      initial={{ opacity: 0, scale: 0.7, rotate: isRaid ? -6 : 6 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
      <motion.div className="kbo__celeb-big" style={{ color }}
        animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}>
        {text}
      </motion.div>
      {ev?.playerName && (
        <div className="kbo__celeb-player" style={{ borderColor: color }}>
          <span className="kbo__celeb-min">{ev.minute}&apos;</span>
          <span className="kbo__celeb-name">{ev.playerName}</span>
          {ev.points > 0 && <span className="kbo__celeb-pts">+{ev.points}</span>}
        </div>
      )}
    </motion.div>
  );
}
