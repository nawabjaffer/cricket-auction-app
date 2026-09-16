import { computeMatchMinute, FOOTBALL_HALF_LABELS } from '../types/football';
import type { FootballLiveState, FootballMatchSetup, FootballOverlayConfig } from '../types/football';
import { computeKabaddiClock, KABADDI_HALF_LABELS, raidSecondsRemaining } from '../types/kabaddi';
import type { KabaddiLiveState, KabaddiMatchSetup, KabaddiOverlayConfig, KabaddiRulesConfig } from '../types/kabaddi';

export type TeamBroadcastState =
  | { sport: 'football'; match: FootballMatchSetup | null; live: FootballLiveState | null; config: FootballOverlayConfig }
  | { sport: 'kabaddi'; match: KabaddiMatchSetup | null; live: KabaddiLiveState | null; config: KabaddiOverlayConfig; rules: KabaddiRulesConfig };

export function teamScoreboard(state: TeamBroadcastState) {
  if (!state.match || !state.live) return null;
  const clock = state.sport === 'football' ? computeMatchMinute(state.live) : computeKabaddiClock(state.live);
  const phase = state.sport === 'football' ? FOOTBALL_HALF_LABELS[state.live.half] : KABADDI_HALF_LABELS[state.live.half];
  const details: string[] = [];
  if (state.sport === 'kabaddi') {
    if (state.config.showMatDiagram) details.push(`On mat ${state.live.teamA.playersOnCourt} - ${state.live.teamB.playersOnCourt}`);
    if (state.live.raidClockStartedAt) {
      if (state.live.raiderName) details.push(state.live.raiderName);
      if (state.config.showRaidClock) details.push(`Raid ${raidSecondsRemaining(state.live, state.rules)}s`);
      if (state.live.isDoOrDie) details.push('DO OR DIE');
    }
  } else {
    if (state.live.addedTimeMin) details.push(`+${state.live.addedTimeMin} min`);
    if (state.live.half === 'penalties') details.push(`Penalties ${state.live.homePenalties ?? 0} - ${state.live.awayPenalties ?? 0}`);
  }
  return {
    home: state.match.teamA,
    away: state.match.teamB,
    homeScore: state.sport === 'football' ? state.live.homeScore : state.live.teamA.score,
    awayScore: state.sport === 'football' ? state.live.awayScore : state.live.teamB.score,
    clock: `${String(clock.minute).padStart(2, '0')}:${String(clock.second).padStart(2, '0')}`,
    phase,
    details: details.join(' | '),
    isLive: state.match.status === 'live' && state.live.half !== 'not_started' && state.live.half !== 'full_time',
  };
}