// ============================================================================
// SCORECARD DATA BINDING — resolves a widget's live content
// Single source of truth used by BOTH the DOM overlay renderer and the canvas
// renderer (camera recorder), so the OBS overlay and the burned-in-video
// scorecard always show identical values.
// ============================================================================

import { computeMatchMinute, FOOTBALL_HALF_LABELS } from '../types/football';
import type { FootballLiveState, FootballMatchSetup } from '../types/football';
import { computeKabaddiClock, KABADDI_HALF_LABELS, raidSecondsRemaining, DEFAULT_KABADDI_RULES } from '../types/kabaddi';
import type { KabaddiLiveState, KabaddiMatchSetup, KabaddiRulesConfig } from '../types/kabaddi';
import type { LiveScore, MatchSetup } from '../types/scoring';
import type { ScorecardWidgetInstance, WidgetKind } from '../types/scorecardDesigner';

export interface ScorecardBranding {
  tournamentLogo?: string;
  partnerLogo?: string;
}

export type ScorecardDataContext =
  | { sport: 'cricket'; match: MatchSetup | null; live: LiveScore | null; branding?: ScorecardBranding }
  | { sport: 'football'; match: FootballMatchSetup | null; live: FootballLiveState | null; branding?: ScorecardBranding }
  | { sport: 'kabaddi'; match: KabaddiMatchSetup | null; live: KabaddiLiveState | null; rules?: KabaddiRulesConfig; branding?: ScorecardBranding };

export interface ResolvedWidgetContent {
  text?: string;
  imageUrl?: string;
  /** Widgets that have nothing to show right now (e.g. LIVE badge pre-match) should be hidden, not blank. */
  hidden?: boolean;
}

const EMPTY: ResolvedWidgetContent = { hidden: true };

function fmtClock(minute: number, second: number): string {
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

/** Resolves a single WidgetKind's live value against the active match data context. */
export function resolveWidgetKind(kind: WidgetKind, ctx: ScorecardDataContext): ResolvedWidgetContent {
  const { match } = ctx;

  switch (kind) {
    case 'team_a_logo':
      return match?.teamA.logoUrl ? { imageUrl: match.teamA.logoUrl } : EMPTY;
    case 'team_b_logo':
      return match?.teamB.logoUrl ? { imageUrl: match.teamB.logoUrl } : EMPTY;
    case 'team_a_name':
      return match ? { text: match.teamA.name } : EMPTY;
    case 'team_b_name':
      return match ? { text: match.teamB.name } : EMPTY;
    case 'match_venue':
      return match?.venue ? { text: match.venue } : EMPTY;
    case 'live_badge':
      return match?.status === 'live' ? { text: 'LIVE' } : EMPTY;
    case 'tournament_logo':
      return ctx.branding?.tournamentLogo ? { imageUrl: ctx.branding.tournamentLogo } : EMPTY;
    case 'partner_logo':
      return ctx.branding?.partnerLogo ? { imageUrl: ctx.branding.partnerLogo } : EMPTY;
    case 'match_clock':
      return resolveClock(ctx);
    default:
      break;
  }

  if (ctx.sport === 'cricket') return resolveCricket(kind, ctx.live);
  if (ctx.sport === 'football') return resolveFootball(kind, ctx.live);
  if (ctx.sport === 'kabaddi') return resolveKabaddi(kind, ctx.live, ctx.rules ?? DEFAULT_KABADDI_RULES);
  return EMPTY;
}

function resolveClock(ctx: ScorecardDataContext): ResolvedWidgetContent {
  if (ctx.sport === 'football' && ctx.live) {
    const { minute, second } = computeMatchMinute(ctx.live);
    return { text: fmtClock(minute, second) };
  }
  if (ctx.sport === 'kabaddi' && ctx.live) {
    const { minute, second } = computeKabaddiClock(ctx.live);
    return { text: fmtClock(minute, second) };
  }
  if (ctx.sport === 'cricket' && ctx.live) {
    return { text: `${ctx.live.overs.toFixed(1)} ov` };
  }
  return EMPTY;
}

function resolveCricket(kind: WidgetKind, live: LiveScore | null): ResolvedWidgetContent {
  if (!live) return EMPTY;
  switch (kind) {
    case 'cricket_score':
      return { text: `${live.runs}/${live.wickets}` };
    case 'cricket_overs':
      return { text: `${live.overs.toFixed(1)} ov` };
    case 'cricket_run_rate':
      return { text: `RR ${(live.runRate ?? 0).toFixed(2)}` };
    case 'cricket_striker': {
      const s = live.currentBatsmen?.[0];
      return s ? { text: `${s.playerName} ${s.runs}(${s.balls})` } : EMPTY;
    }
    case 'cricket_non_striker': {
      const s = live.currentBatsmen?.[1];
      return s ? { text: `${s.playerName} ${s.runs}(${s.balls})` } : EMPTY;
    }
    case 'cricket_bowler': {
      const b = live.currentBowler;
      return b ? { text: `${b.playerName} ${b.wickets}/${b.runs}` } : EMPTY;
    }
    case 'cricket_current_over':
      return live.currentOverBalls?.length ? { text: live.currentOverBalls.join(' ') } : EMPTY;
    case 'cricket_target':
      return live.target ? { text: `Target ${live.target}` } : EMPTY;
    case 'cricket_partnership':
      return live.partnership ? { text: `${live.partnership.runs} (${live.partnership.balls})` } : EMPTY;
    default:
      return EMPTY;
  }
}

function resolveFootball(kind: WidgetKind, live: FootballLiveState | null): ResolvedWidgetContent {
  if (!live) return EMPTY;
  switch (kind) {
    case 'football_score':
      return { text: `${live.homeScore} - ${live.awayScore}` };
    case 'football_half_label':
      return { text: FOOTBALL_HALF_LABELS[live.half] };
    case 'football_added_time':
      return live.addedTimeMin ? { text: `+${live.addedTimeMin}'` } : EMPTY;
    default:
      return EMPTY;
  }
}

function resolveKabaddi(kind: WidgetKind, live: KabaddiLiveState | null, rules: KabaddiRulesConfig): ResolvedWidgetContent {
  if (!live) return EMPTY;
  switch (kind) {
    case 'kabaddi_score':
      return { text: `${live.teamA.score} - ${live.teamB.score}` };
    case 'kabaddi_half_label':
      return { text: KABADDI_HALF_LABELS[live.half] };
    case 'kabaddi_raid_clock': {
      const secs = raidSecondsRemaining(live, rules);
      return secs !== null ? { text: `${secs}s` } : EMPTY;
    }
    case 'kabaddi_players_on_mat':
      return { text: `${live.teamA.playersOnCourt} - ${live.teamB.playersOnCourt}` };
    case 'kabaddi_raider_name':
      return live.raiderName ? { text: live.raiderName } : EMPTY;
    case 'kabaddi_do_or_die_flag':
      return live.isDoOrDie ? { text: 'DO OR DIE' } : EMPTY;
    default:
      return EMPTY;
  }
}

/** Resolves a full widget instance — handles custom text/image/timer overrides before falling back to `kind`. */
export function resolveWidgetContent(widget: ScorecardWidgetInstance, ctx: ScorecardDataContext): ResolvedWidgetContent {
  if (widget.kind === 'custom_text') return { text: widget.staticText || widget.label };
  if (widget.kind === 'custom_image') return widget.staticImageUrl ? { imageUrl: widget.staticImageUrl } : EMPTY;
  if (widget.kind === 'custom_timer') {
    const clock = resolveClock(ctx);
    if (clock.hidden) return clock;
    return { text: widget.timerLabel ? `${widget.timerLabel} ${clock.text}` : clock.text };
  }
  return resolveWidgetKind(widget.kind, ctx);
}
