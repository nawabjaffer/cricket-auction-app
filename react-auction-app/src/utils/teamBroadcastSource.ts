// Shared plumbing for the camera recorder / multi-camera host: builds the mutable
// broadcast state for the team sports (football, kabaddi, carrom), keeps it in sync
// with RTDB, and adapts it to the Scorecard Designer data context.

import { onValue, ref, type Database } from 'firebase/database';
import { DEFAULT_FOOTBALL_OVERLAY_CONFIG } from '../types/football';
import { DEFAULT_KABADDI_OVERLAY_CONFIG, DEFAULT_KABADDI_RULES } from '../types/kabaddi';
import {
  DEFAULT_CARROM_OVERLAY_CONFIG, DEFAULT_CARROM_RULES, normalizeCarromLive, normalizeCarromRules,
} from '../types/carrom';
import type { CarromOverlayControl } from '../types/carrom';
import type { ScorecardDataContext } from './scorecardDataBinding';
import type { TeamBroadcastState } from './teamScoreboard';

export type TeamSport = TeamBroadcastState['sport'];

export function isTeamSport(sport: string): sport is TeamSport {
  return sport === 'football' || sport === 'kabaddi' || sport === 'carrom';
}

export function createTeamBroadcastState(sport: TeamSport): TeamBroadcastState {
  switch (sport) {
    case 'football':
      return { sport, match: null, live: null, config: DEFAULT_FOOTBALL_OVERLAY_CONFIG };
    case 'kabaddi':
      return { sport, match: null, live: null, config: DEFAULT_KABADDI_OVERLAY_CONFIG, rules: DEFAULT_KABADDI_RULES };
    case 'carrom':
      return { sport, match: null, live: null, config: DEFAULT_CARROM_OVERLAY_CONFIG, rules: DEFAULT_CARROM_RULES, overlay: null };
  }
}

interface SubscribeHandlers {
  onMatch?: (match: TeamBroadcastState['match']) => void;
  onError?: () => void;
}

/**
 * Subscribes `state` (mutated in place so rAF draw loops always read fresh values)
 * to the match nodes under `base` (the sport namespace, e.g. `tenants/x/carrom`).
 */
export function subscribeTeamBroadcast(
  db: Database, base: string, matchId: string, state: TeamBroadcastState, handlers: SubscribeHandlers = {},
): () => void {
  const { onMatch, onError } = handlers;
  const unsubs: Array<() => void> = [
    onValue(ref(db, `${base}/matches/${matchId}/setup`), snap => {
      state.match = snap.exists() ? snap.val() : null;
      onMatch?.(state.match);
    }, onError),
    onValue(ref(db, `${base}/matches/${matchId}/live`), snap => {
      if (state.sport === 'carrom') state.live = snap.exists() ? normalizeCarromLive(snap.val(), matchId) : null;
      else state.live = snap.exists() ? snap.val() : null;
    }, onError),
    onValue(ref(db, `${base}/overlayConfig`), snap => {
      const value = snap.val() ?? {};
      if (state.sport === 'football') state.config = { ...DEFAULT_FOOTBALL_OVERLAY_CONFIG, ...value };
      else if (state.sport === 'kabaddi') state.config = { ...DEFAULT_KABADDI_OVERLAY_CONFIG, ...value };
      else state.config = { ...DEFAULT_CARROM_OVERLAY_CONFIG, ...value };
    }, onError),
  ];
  if (state.sport === 'kabaddi') {
    unsubs.push(onValue(ref(db, `${base}/rules`), snap => {
      if (state.sport === 'kabaddi') state.rules = { ...DEFAULT_KABADDI_RULES, ...snap.val() };
    }, onError));
  }
  if (state.sport === 'carrom') {
    unsubs.push(
      onValue(ref(db, `${base}/rules`), snap => {
        if (state.sport === 'carrom') state.rules = normalizeCarromRules(snap.exists() ? snap.val() : null);
      }, onError),
      onValue(ref(db, `${base}/matches/${matchId}/overlay`), snap => {
        if (state.sport === 'carrom') state.overlay = snap.exists() ? (snap.val() as CarromOverlayControl) : null;
      }, onError),
    );
  }
  return () => unsubs.forEach(unsubscribe => unsubscribe());
}

/** Adapts the live team-sport state to the data context the Scorecard Designer renderer binds widgets to. */
export function teamLayoutContext(broadcast: TeamBroadcastState): ScorecardDataContext {
  const branding = { tournamentLogo: broadcast.config.tournamentLogo, partnerLogo: broadcast.config.broadcastPartnerLogo };
  switch (broadcast.sport) {
    case 'football':
      return { sport: 'football', match: broadcast.match, live: broadcast.live, branding };
    case 'kabaddi':
      return { sport: 'kabaddi', match: broadcast.match, live: broadcast.live, rules: broadcast.rules, branding };
    case 'carrom':
      return { sport: 'carrom', match: broadcast.match, live: broadcast.live, rules: broadcast.rules, overlay: broadcast.overlay ?? null, branding };
  }
}
