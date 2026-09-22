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
import { useBroadcastOverlaySurface } from '../hooks/useBroadcastOverlaySurface';
import { ResolvedImage } from '../components/ResolvedImage';
import { ScorecardLayoutView } from '../components/ScorecardCanvas';
import { overlayMediaPreload, getPreloadedMediaUrl } from '../services/overlayMediaPreload';
import { scorecardLayoutService } from '../services/scorecardLayoutService';
import type { ScorecardLayout, WidgetKind } from '../types/scorecardDesigner';
import type { ScorecardDataContext } from '../utils/scorecardDataBinding';
import {
  computeKabaddiClock, raidSecondsRemaining, KABADDI_HALF_LABELS,
  DEFAULT_KABADDI_OVERLAY_CONFIG, DEFAULT_KABADDI_RULES, playerMatchPoints,
} from '../types/kabaddi';
import type {
  KabaddiMatchSetup, KabaddiLiveState, KabaddiOverlayConfig,
  KabaddiOverlayControl, KabaddiAnimationConfig, KabaddiRulesConfig, KabaddiTeamState,
  KabaddiTeam, KabaddiTeamRef, KabaddiPlayer,
} from '../types/kabaddi';
import type { Team } from '../types';
import type { SoldPlayerRecord } from '../services/auctionPersistence';
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

function mergeKabaddiOverlayConfig(raw: Partial<KabaddiOverlayConfig> | null): KabaddiOverlayConfig {
  const value = raw ?? {};
  const mergeAnimation = (fallback: KabaddiAnimationConfig | undefined, override: KabaddiAnimationConfig | undefined): KabaddiAnimationConfig => ({
    enabled: override?.enabled ?? fallback?.enabled ?? true,
    durationMs: override?.durationMs ?? fallback?.durationMs ?? 8000,
    mediaUrl: override?.mediaUrl ?? fallback?.mediaUrl,
    soundUrl: override?.soundUrl ?? fallback?.soundUrl,
    text: override?.text ?? fallback?.text,
    color: override?.color ?? fallback?.color,
  });
  return {
    ...DEFAULT_KABADDI_OVERLAY_CONFIG,
    ...value,
    superRaidAnimation: mergeAnimation(DEFAULT_KABADDI_OVERLAY_CONFIG.superRaidAnimation, value.superRaidAnimation),
    superTackleAnimation: mergeAnimation(DEFAULT_KABADDI_OVERLAY_CONFIG.superTackleAnimation, value.superTackleAnimation),
    allOutAnimation: mergeAnimation(DEFAULT_KABADDI_OVERLAY_CONFIG.allOutAnimation, value.allOutAnimation),
    bonusAnimation: mergeAnimation(DEFAULT_KABADDI_OVERLAY_CONFIG.bonusAnimation, value.bonusAnimation),
    doOrDieAnimation: mergeAnimation(DEFAULT_KABADDI_OVERLAY_CONFIG.doOrDieAnimation, value.doOrDieAnimation),
  };
}

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

function celebrationWidgetKind(type: KabaddiOverlayControl['activeOverlay']): WidgetKind | null {
  switch (type) {
    case 'do_or_die': return 'kabaddi_do_or_die_flag';
    case 'super_raid': return 'kabaddi_super_raid_flag';
    case 'super_tackle': return 'kabaddi_super_tackle_flag';
    case 'all_out': return 'kabaddi_all_out_flag';
    case 'bonus_point': return 'kabaddi_bonus_point_flag';
    default: return null;
  }
}

function layoutHandlesCelebration(layout: ScorecardLayout | null, control: KabaddiOverlayControl | null, match: KabaddiMatchSetup, live: KabaddiLiveState): boolean {
  const kind = control ? celebrationWidgetKind(control.activeOverlay) : null;
  if (!kind) return false;
  const eventTeamId = control?.activeEvent?.teamId || live.raidingTeamId;
  return !!layout?.widgets.some(widget => {
    // Presence in the saved canvas owns this overlay, including when the
    // widget is hidden. Deleting the layer is the explicit default fallback.
    if (widget.kind !== kind) return false;
    if (!widget.previewTeamSide || widget.previewTeamSide === 'common') return true;
    if (!eventTeamId) return false;
    return widget.previewTeamSide === 'team_a'
      ? eventTeamId === match.teamA.id || eventTeamId === live.teamAId
      : eventTeamId === match.teamB.id || eventTeamId === live.teamBId;
  });
}

/**
 * Merges the match's saved team ref with the latest kabaddi team record, then
 * prefers the linked Auction Admin team's logo — that's the single place
 * teams manage their crest, and the kabaddi copy can otherwise go stale.
 */
function enrichTeam(team: KabaddiTeamRef, teams: KabaddiTeam[], auctionTeams: Team[]): KabaddiTeamRef {
  const latest = teams.find(candidate => candidate.id === team.id)
    ?? teams.find(candidate => candidate.name.trim().toLowerCase() === team.name.trim().toLowerCase());
  const merged: KabaddiTeamRef = latest ? {
    ...team,
    name: latest.name || team.name,
    shortName: latest.shortName || team.shortName,
    logoUrl: latest.logoUrl || team.logoUrl,
    animationUrl: latest.animationUrl || team.animationUrl,
    primaryColor: latest.primaryColor || team.primaryColor,
  } : team;
  const auctionMatch = auctionTeams.find(at =>
    (latest?.sourceTeamId && at.id === latest.sourceTeamId)
    || at.name.trim().toLowerCase() === merged.name.trim().toLowerCase());
  const auctionLogo = auctionMatch?.brandLogoUrl || auctionMatch?.logoUrl;
  return auctionLogo ? { ...merged, logoUrl: auctionLogo } : merged;
}

interface MatRosterEntry { player: KabaddiPlayer; onCourt: boolean }

/**
 * Kabaddi Admin's own player list, plus any Auction Admin sold player not
 * already represented there — teams that only imported the team (and never
 * ran "Import players" in Kabaddi Admin) still get real photos on the mat
 * instead of falling back to plain dots.
 */
function mergedRosterPlayers(
  players: KabaddiPlayer[], soldPlayers: SoldPlayerRecord[], match: KabaddiMatchSetup | null,
): KabaddiPlayer[] {
  if (!match) return players;
  const knownIds = new Set(players.flatMap(p => [p.id, p.sourcePlayerId].filter((v): v is string => !!v)));
  const teamForSoldPlayer = (sp: SoldPlayerRecord): string | null => {
    const teamName = sp.teamName?.trim().toLowerCase();
    if (sp.teamId === match.teamA.id || teamName === match.teamA.name.trim().toLowerCase()) return match.teamA.id;
    if (sp.teamId === match.teamB.id || teamName === match.teamB.name.trim().toLowerCase()) return match.teamB.id;
    return null;
  };
  const extras = soldPlayers.flatMap((sp): KabaddiPlayer[] => {
    if (knownIds.has(sp.id)) return [];
    const teamId = teamForSoldPlayer(sp);
    if (!teamId) return [];
    return [{
      id: sp.id,
      teamId,
      name: sp.playerName,
      photoUrl: sp.imageUrl || undefined,
      position: 'ALL_ROUNDER',
      isStarter: true,
      sourcePlayerId: sp.id,
      createdAt: sp.timestamp || Date.now(),
      updatedAt: sp.timestamp || Date.now(),
    }];
  });
  return [...players, ...extras];
}

/** The starting lineup for a team with each player's current on-mat status. */
function matchRosterFor(
  teamId: string, players: KabaddiPlayer[], state: KabaddiTeamState, playersPerSide: number,
): MatRosterEntry[] {
  const roster = players.filter(p => p.teamId === teamId);
  if (roster.length === 0) return [];
  const startingIds = state.startingIds?.length
    ? state.startingIds
    : roster.filter(p => p.isStarter !== false).slice(0, playersPerSide).map(p => p.id);
  const onCourt = new Set(state.onCourtIds?.length ? state.onCourtIds : startingIds);
  return startingIds
    .map(id => roster.find(p => p.id === id))
    .filter((p): p is KabaddiPlayer => !!p)
    .map(player => ({ player, onCourt: onCourt.has(player.id) }));
}

export default function KabaddiOBSOverlayPage() {
  useBroadcastOverlaySurface();
  const [urlMatchId, setUrlMatchId] = useState<string | null>(null);
  const [urlPinned, setUrlPinned] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [liveFallbackMatchId, setLiveFallbackMatchId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  const [match, setMatch] = useState<KabaddiMatchSetup | null>(null);
  const [live, setLive] = useState<KabaddiLiveState | null>(null);
  const [teams, setTeams] = useState<KabaddiTeam[]>([]);
  const [auctionTeams, setAuctionTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<KabaddiPlayer[]>([]);
  const [soldPlayers, setSoldPlayers] = useState<SoldPlayerRecord[]>([]);
  const [config, setConfig] = useState<KabaddiOverlayConfig>(DEFAULT_KABADDI_OVERLAY_CONFIG);
  const [tenantTournamentLogo, setTenantTournamentLogo] = useState<string | undefined>();
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [control, setControl] = useState<KabaddiOverlayControl | null>(null);
  const [celeb, setCeleb] = useState<KabaddiOverlayControl | null>(null);
  const [, force] = useState(0);
  const lastCelebKey = useRef('');
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customLayout, setCustomLayout] = useState<ScorecardLayout | null>(null);
  const [squadLayout, setSquadLayout] = useState<ScorecardLayout | null>(null);
  const [statsLayout, setStatsLayout] = useState<ScorecardLayout | null>(null);

  // Custom Scorecard Designer — same layout the Camera Recorder burns into video
  useEffect(() => {
    scorecardLayoutService.initialize(fbDb);
    const unsubs = [
      scorecardLayoutService.subscribeEffectiveLayout('kabaddi', setCustomLayout),
      scorecardLayoutService.subscribeEffectiveLayout('kabaddi', setSquadLayout, 'team_squad'),
      scorecardLayoutService.subscribeEffectiveLayout('kabaddi', setStatsLayout, 'match_stats'),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Parse URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('matchId');
    const pinned = params.get('pin') === '1';
    setUrlPinned(pinned);
    if (id) setUrlMatchId(id);
  }, []);

  // Shared tenant listeners: overlay config, rules, active match pointer, teams, players
  useEffect(() => {
    const base = tenantPath('kabaddi');
    const unsubs = [
      // Overlay configuration (branding, colors, single overlay mode)
      onValue(ref(fbDb, `${base}/overlayConfig`), s =>
        setConfig(mergeKabaddiOverlayConfig(s.exists() ? s.val() as Partial<KabaddiOverlayConfig> : null))),
      onValue(ref(fbDb, tenantPath('auction/adminSettings')), s => {
        const settings = s.val() as { organizerLogo?: string } | null;
        setTenantTournamentLogo(settings?.organizerLogo || undefined);
      }),
      // Rules configuration
      onValue(ref(fbDb, `${base}/rules`), s =>
        setRules(s.exists() ? { ...DEFAULT_KABADDI_RULES, ...s.val() } : DEFAULT_KABADDI_RULES)),
      // Active match pointer (Single Overlay Mode)
      onValue(ref(fbDb, `${base}/activeMatch/matchId`), s =>
        setActiveMatchId(s.exists() ? (s.val() as string) : null)),
      // Fallback: listen to all matches to find live match if no explicit active match pointer
      onValue(ref(fbDb, `${base}/matches`), s => {
        if (!s.exists()) { setLiveFallbackMatchId(null); return; }
        const val = s.val() as Record<string, { setup?: KabaddiMatchSetup }>;
        const setups = Object.values(val).map(m => m.setup).filter((m): m is KabaddiMatchSetup => !!m);
        const liveMatch = setups.find(m => m.status === 'live');
        if (liveMatch) {
          setLiveFallbackMatchId(liveMatch.id);
        } else if (setups.length > 0) {
          const sorted = [...setups].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setLiveFallbackMatchId(sorted[0].id);
        } else {
          setLiveFallbackMatchId(null);
        }
      }),
      // Teams
      onValue(ref(fbDb, `${base}/teams`), s => {
        const val = (s.val() as Record<string, KabaddiTeam>) ?? {};
        setTeams(Object.values(val).filter(t => !!t?.id));
      }),
      // Auction teams (brand crest logos)
      onValue(ref(fbDb, tenantPath('auction/teams')), s => {
        const val = s.val() as Team[] | Record<string, Team> | null;
        setAuctionTeams(val ? Object.values(val).filter((t): t is Team => !!t?.id) : []);
      }),
      // Players
      onValue(ref(fbDb, `${base}/players`), s => {
        const val = (s.val() as Record<string, KabaddiPlayer>) ?? {};
        setPlayers(Object.values(val).filter(p => !!p?.id));
      }),
      // Sold players
      onValue(ref(fbDb, tenantPath('auction/soldPlayers')), s => {
        const val = s.val() as SoldPlayerRecord[] | Record<string, SoldPlayerRecord> | null;
        setSoldPlayers(val ? Object.values(val).filter((p): p is SoldPlayerRecord => !!p?.id) : []);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Resolve the effective match:
  // When singleOverlayMode is enabled OR when no matchId is specified in URL,
  // actively follow the activeMatchId (or live fallback match).
  // If pin=1 is in URL, explicit matchId takes priority.
  useEffect(() => {
    if (config.singleOverlayMode || !urlMatchId) {
      setMatchId(urlPinned ? (urlMatchId || activeMatchId || liveFallbackMatchId || null) : (activeMatchId || liveFallbackMatchId || urlMatchId || null));
      return;
    }
    setMatchId(urlMatchId || null);
  }, [urlMatchId, urlPinned, activeMatchId, liveFallbackMatchId, config.singleOverlayMode]);

  // Reset match data when matchId changes to avoid stale scoreboard flashing
  useEffect(() => {
    setMatch(null);
    setLive(null);
    setControl(null);
    setCeleb(null);
  }, [matchId]);

  // Match-specific subscriptions: setup, live state, and overlay controls
  useEffect(() => {
    if (!matchId) return;
    const base = tenantPath('kabaddi');
    const unsubs = [
      onValue(ref(fbDb, `${base}/matches/${matchId}/setup`), s => {
        if (s.exists()) setMatch(s.val() as KabaddiMatchSetup);
      }),
      onValue(ref(fbDb, `${base}/matches/${matchId}/live`), s => {
        if (s.exists()) setLive(s.val() as KabaddiLiveState);
      }),
      onValue(ref(fbDb, `${base}/matches/${matchId}/overlay`), s => {
        setControl(s.exists() ? (s.val() as KabaddiOverlayControl) : null);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [matchId]);

  // Preload celebration media (video / gif / images / audio) into local memory
  useEffect(() => {
    const urls: (string | undefined)[] = [
      config.superRaidAnimation?.mediaUrl,
      config.superRaidAnimation?.soundUrl,
      config.superTackleAnimation?.mediaUrl,
      config.superTackleAnimation?.soundUrl,
      config.allOutAnimation?.mediaUrl,
      config.allOutAnimation?.soundUrl,
      config.bonusAnimation?.mediaUrl,
      config.bonusAnimation?.soundUrl,
      config.doOrDieAnimation?.mediaUrl,
      config.doOrDieAnimation?.soundUrl,
      config.tournamentLogo,
      config.broadcastPartnerLogo,
      match?.teamA?.animationUrl,
      match?.teamB?.animationUrl,
      match?.teamA?.logoUrl,
      match?.teamB?.logoUrl,
    ];
    void overlayMediaPreload.preloadBatch(urls);
  }, [config, match]);

  // 1 Hz re-render drives both the match clock and the raid countdown.
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts for manual overlay testing and quick director triggers
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const trigger = (type: KabaddiOverlayControl['activeOverlay']) => {
        const { anim, enabled } = celebFor(type, config);
        if (!enabled) return;
        if (anim?.soundUrl) {
          const aud = overlayMediaPreload.getAudio(anim.soundUrl);
          if (aud) {
            aud.currentTime = 0;
            aud.play().catch(() => {});
          }
        }
        setCeleb({ activeOverlay: type, lastUpdated: Date.now() });
        const duration = anim?.durationMs && anim.durationMs > 0 ? anim.durationMs : 8000;
        setTimeout(() => setCeleb(null), duration);
      };

      if (key === 'r') trigger('super_raid');
      else if (key === 't') trigger('super_tackle');
      else if (key === 'a') trigger('all_out');
      else if (key === 'b') trigger('bonus_point');
      else if (key === 'd') trigger('do_or_die');
      else if (key === 'escape') setCeleb(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [config]);

  // Instant celebration display with preloaded media and sound (<10ms playback)
  useEffect(() => {
    if (!control || control.activeOverlay === 'none') {
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      celebTimerRef.current = null;
      setCeleb(null);
      return;
    }
    const rawTimestamp = control.lastUpdated || 0;
    const timestamp = rawTimestamp > 0 && rawTimestamp < 100000000000 ? rawTimestamp * 1000 : rawTimestamp;
    const eventKey = control.activeEvent?.id || `${control.activeEvent?.type || ''}:${control.activeEvent?.teamId || ''}:${control.activeEvent?.timestamp || ''}`;
    const celebKey = `${control.activeOverlay}:${timestamp}:${eventKey}`;
    if (celebKey === lastCelebKey.current) return;
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    celebTimerRef.current = null;
    lastCelebKey.current = celebKey;
    if (timestamp > 0 && Date.now() - timestamp > 15000) return;
    const { anim, enabled } = celebFor(control.activeOverlay, config);
    if (!enabled) return;

    // Trigger audio immediately from pre-warmed audio cache
    if (anim?.soundUrl) {
      const aud = overlayMediaPreload.getAudio(anim.soundUrl);
      if (aud) {
        try {
          aud.currentTime = 0;
          aud.play().catch(() => {});
        } catch { /* audio */ }
      } else {
        try {
          const a = new Audio(anim.soundUrl);
          a.play().catch(() => {});
        } catch { /* audio */ }
      }
    }

    setCeleb(control);
    // Disappear after configured duration (defaults to 8 seconds / 8000ms for special moments)
    const duration = anim?.durationMs && anim.durationMs > 0 ? anim.durationMs : 8000;
    celebTimerRef.current = setTimeout(() => {
      setCeleb(null);
      celebTimerRef.current = null;
    }, duration);
    return () => {
      if (celebTimerRef.current) {
        clearTimeout(celebTimerRef.current);
        celebTimerRef.current = null;
      }
    };
  }, [control, config]);

  if (!matchId || !match || !live) return <div className="kbo" data-empty="true" />;

  const { minute, second } = computeKabaddiClock(live);
  const clock = `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const raidLeft = config.showRaidClock ? raidSecondsRemaining(live, rules) : null;
  const teamA = enrichTeam(match.teamA, teams, auctionTeams);
  const teamB = enrichTeam(match.teamB, teams, auctionTeams);
  const rosterPlayers = mergedRosterPlayers(players, soldPlayers, match);
  const raidingA = live.raidingTeamId === teamA.id;
  const raidingB = live.raidingTeamId === teamB.id;

  const theme = {
    '--kb-primary': config.primaryColor,
    '--kb-secondary': config.secondaryColor,
    '--kb-accent': config.accentColor,
    '--kb-text': config.textColor,
  } as React.CSSProperties;

  // Custom Scorecard Designer template takes over the scoreboard region when
  // one has been set Active — celebrations keep working underneath/above it.
  if (control?.activeOverlay === 'lineup' && squadLayout && squadLayout.widgets.length > 0) {
    return (
      <div className="kbo kbo--custom" style={theme}>
        <ScorecardLayoutView layout={squadLayout} ctx={{ sport: 'kabaddi', match, live, rules, players: rosterPlayers }} />
        <AnimatePresence>
          {celeb && !layoutHandlesCelebration(squadLayout, control, match, live) && <KabaddiCelebration control={celeb} config={config} />}
        </AnimatePresence>
      </div>
    );
  }

  if (control?.activeOverlay === 'match_stats' && statsLayout && statsLayout.widgets.length > 0) {
    return (
      <div className="kbo kbo--custom" style={theme}>
        <ScorecardLayoutView layout={statsLayout} ctx={{ sport: 'kabaddi', match, live, rules, players: rosterPlayers }} />
        <AnimatePresence>
          {celeb && !layoutHandlesCelebration(statsLayout, control, match, live) && <KabaddiCelebration control={celeb} config={config} />}
        </AnimatePresence>
      </div>
    );
  }

  if (customLayout && customLayout.widgets.length > 0) {
    const dataCtx: ScorecardDataContext = {
      sport: 'kabaddi', match, live, rules,
      players: rosterPlayers,
      branding: {
        tournamentLogo: config.tournamentLogo || tenantTournamentLogo,
        partnerLogo: config.broadcastPartnerLogo,
        doOrDieFlagUrl: config.doOrDieAnimation?.mediaUrl,
        superRaidFlagUrl: config.superRaidAnimation?.mediaUrl,
        superTackleFlagUrl: config.superTackleAnimation?.mediaUrl,
        allOutFlagUrl: config.allOutAnimation?.mediaUrl,
        bonusPointFlagUrl: config.bonusAnimation?.mediaUrl,
      },
      overlay: control,
    };
    return (
      <div className={`kbo kbo--custom`} style={theme}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <ScorecardLayoutView layout={customLayout} ctx={dataCtx} />
        </div>
        <AnimatePresence>
          {celeb && !layoutHandlesCelebration(customLayout, control, match, live) && <KabaddiCelebration control={celeb} config={config} />}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`kbo kbo--${config.scoreboardPosition}`} style={theme}>
      <div className="kbo__scoreboard">
        {config.tournamentLogo && (
          <div className="kbo__tourn-logo"><ResolvedImage src={config.tournamentLogo} size={192} /></div>
        )}

        <div className="kbo__strip">
          <span className="kbo__glow-line kbo__glow-line--1" />
          <span className="kbo__glow-line kbo__glow-line--2" />

          {raidLeft !== null && (
            <span className={`kbo__raid-clock-float ${raidLeft <= 5 ? 'kbo__raid-clock-float--urgent' : ''}`}>
              <span className="kbo__raid-clock-num">{raidLeft}</span>
              <span className="kbo__raid-clock-unit">s</span>
            </span>
          )}

          <TeamBlock
            side="home"
            name={teamA.shortName}
            fullName={teamA.name}
            logoUrl={teamA.logoUrl}
            animationUrl={teamA.animationUrl}
            color={teamA.primaryColor}
            state={live.teamA}
            roster={matchRosterFor(teamA.id, rosterPlayers, live.teamA, rules.playersPerSide)}
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
            name={teamB.shortName}
            fullName={teamB.name}
            logoUrl={teamB.logoUrl}
            animationUrl={teamB.animationUrl}
            color={teamB.primaryColor}
            state={live.teamB}
            roster={matchRosterFor(teamB.id, rosterPlayers, live.teamB, rules.playersPerSide)}
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

          {config.showRaiderInfo && live.raiderName && (
            <span className="kbo__raider">
              {live.raiderPhotoUrl && (
                <span className="kbo__raider-photo"><ResolvedImage src={live.raiderPhotoUrl} size={96} /></span>
              )}
              <span className="kbo__raider-label">RAIDER</span>
              <span className="kbo__raider-name">{live.raiderName}</span>
              <span className="kbo__raider-pts">{playerMatchPoints(live, live.raiderId)} PTS</span>
            </span>
          )}

          {live.isDoOrDie && <span className="kbo__dod">DO OR DIE</span>}
        </div>
      </div>

      {config.broadcastPartnerLogo && (
        <div className="kbo__partner"><ResolvedImage src={config.broadcastPartnerLogo} size={192} /></div>
      )}

      <AnimatePresence>
        {celeb && <KabaddiCelebration control={celeb} config={config} />}
      </AnimatePresence>
    </div>
  );
}

// ── Team block: logo, full name, players still on the mat ────────────────────

function TeamBlock({ side, name, fullName, logoUrl, animationUrl, color, state, roster, raiding, playersPerSide }: Readonly<{
  side: 'home' | 'away';
  name: string;
  fullName: string;
  logoUrl?: string;
  animationUrl?: string;
  color?: string;
  state: KabaddiTeamState;
  roster: MatRosterEntry[];
  raiding: boolean;
  playersPerSide: number;
}>) {
  const dots = Array.from({ length: playersPerSide }, (_, i) => i < state.playersOnCourt);
  const logo = (
    <div className="kbo__team-logo-wrap">
      {animationUrl && (
        <ResolvedImage className="kbo__team-anim" src={animationUrl} size={240} />
      )}
      <div className="kbo__team-logo" style={{ color: color }}>
        <ResolvedImage src={logoUrl} size={220} fallback={<span>{name}</span>} />
      </div>
    </div>
  );
  const info = (
    <div className="kbo__team-info">
      <span className="kbo__team-name">{fullName}</span>
      {roster.length > 0 ? (
        <span className="kbo__mat kbo__mat--players" title={`${roster.filter(r => r.onCourt).length} on the mat`}>
          {roster.map(({ player, onCourt }) => (
            <span key={player.id} className={`kbo__mat-player ${onCourt ? 'is-on' : 'is-out'}`} title={player.name}>
              <ResolvedImage src={player.photoUrl} size={64} fallback={<span>{player.name.charAt(0)}</span>} />
              {!onCourt && <span className="kbo__mat-out-icon" aria-hidden="true" />}
            </span>
          ))}
        </span>
      ) : (
        <span className="kbo__mat" title={`${state.playersOnCourt} on the mat`}>
          {dots.map((on, i) => (
            <i key={i} className={`kbo__mat-dot ${on ? 'is-on' : ''}`} />
          ))}
        </span>
      )}
    </div>
  );

  return (
    <div className={`kbo__team kbo__team--${side} ${raiding ? 'is-raiding' : ''}`}>
      {side === 'home' ? <>{logo}{info}</> : <>{info}{logo}</>}
      {raiding && <span className="kbo__raid-flag">RAID</span>}
    </div>
  );
}

function AutoPlayKabaddiVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        setTimeout(() => { video.play().catch(() => {}); }, 20);
      });
    }
  }, [src]);

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

// ── Celebrations ─────────────────────────────────────────────────────────────

function KabaddiCelebration({ control, config }: Readonly<{
  control: KabaddiOverlayControl; config: KabaddiOverlayConfig;
}>) {
  const type = control.activeOverlay;
  const ev = control.activeEvent;
  const { anim, fallback, color } = celebFor(type, config);
  const text = anim?.text || fallback;

  if (anim?.mediaUrl) {
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(anim.mediaUrl);
    const mediaSrc = getPreloadedMediaUrl(anim.mediaUrl);
    return (
      <motion.div className="kbo__celeb"
        initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}>
        {isVideo ? (
          <AutoPlayKabaddiVideo
            src={mediaSrc}
            className="kbo__celeb-media"
          />
        ) : (
          <img src={mediaSrc} alt={text} className="kbo__celeb-media" />
        )}
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
