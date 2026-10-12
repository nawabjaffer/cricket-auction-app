// ============================================================================
// SCORECARD DATA BINDING — resolves a widget's live content
// Single source of truth used by BOTH the DOM overlay renderer and the canvas
// renderer (camera recorder), so the OBS overlay and the burned-in-video
// scorecard always show identical values.
// ============================================================================

import { computeMatchMinute, FOOTBALL_HALF_LABELS } from '../types/football';
import type { FootballLiveState, FootballMatchSetup, FootballPlayer } from '../types/football';
import { computeKabaddiClock, KABADDI_HALF_LABELS, raidSecondsRemaining, DEFAULT_KABADDI_RULES } from '../types/kabaddi';
import type { KabaddiLiveState, KabaddiMatchSetup, KabaddiRulesConfig, KabaddiPlayer, KabaddiOverlayControl } from '../types/kabaddi';
import {
  CARROMMEN_PER_SIDE, CARROM_PHASE_LABELS, DEFAULT_CARROM_RULES, carromStrokeSecondsRemaining, coinColorFor, currentCarromGame,
} from '../types/carrom';
import type { CarromLiveState, CarromMatchSetup, CarromOverlayControl, CarromRulesConfig, CarromSide } from '../types/carrom';
import type { LiveScore, MatchSetup, MatchLineup, MatchStatsSnapshot, TournamentStats } from '../types/scoring';
import type { ScorecardWidgetInstance, WidgetKind } from '../types/scorecardDesigner';

export interface ScorecardBranding {
  tournamentLogo?: string;
  partnerLogo?: string;
  doOrDieFlagUrl?: string;
  superRaidFlagUrl?: string;
  superTackleFlagUrl?: string;
  allOutFlagUrl?: string;
  bonusPointFlagUrl?: string;
}

export interface ScorecardListItem {
  text: string;
  imageUrl?: string;
}

export type ScorecardDataContext =
  | {
      sport: 'cricket'; match: MatchSetup | null; live: LiveScore | null; branding?: ScorecardBranding;
      lineups?: { teamA: MatchLineup | null; teamB: MatchLineup | null };
      matchStats?: MatchStatsSnapshot | null;
      tournamentStats?: TournamentStats | null;
    }
  | {
      sport: 'football'; match: FootballMatchSetup | null; live: FootballLiveState | null; branding?: ScorecardBranding;
      players?: FootballPlayer[];
    }
  | {
      sport: 'kabaddi'; match: KabaddiMatchSetup | null; live: KabaddiLiveState | null; rules?: KabaddiRulesConfig; branding?: ScorecardBranding;
      players?: KabaddiPlayer[]; overlay?: KabaddiOverlayControl | null;
    }
  | {
      sport: 'carrom'; match: CarromMatchSetup | null; live: CarromLiveState | null; rules?: CarromRulesConfig; branding?: ScorecardBranding;
      overlay?: CarromOverlayControl | null;
    };

export interface ResolvedWidgetContent {
  text?: string;
  imageUrl?: string;
  urgent?: boolean;
  /** List-type content (squad rosters, MVP leaderboards) — rendered as a stacked list of rows. */
  items?: ScorecardListItem[];
  playerSlots?: { active: boolean; icon: string }[];
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
    case 'team_a_logo': {
      const team = match?.teamA;
      const imageUrl = team && (('brandLogoUrl' in team ? team.brandLogoUrl : undefined) || team.logoUrl);
      return imageUrl ? { imageUrl } : EMPTY;
    }
    case 'team_b_logo': {
      const team = match?.teamB;
      const imageUrl = team && (('brandLogoUrl' in team ? team.brandLogoUrl : undefined) || team.logoUrl);
      return imageUrl ? { imageUrl } : EMPTY;
    }
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
    case 'kabaddi_do_or_die_flag':
      return resolveKabaddiOverlay('do_or_die', ctx, 'DO OR DIE', ctx.branding?.doOrDieFlagUrl);
    case 'kabaddi_super_raid_flag':
      return resolveKabaddiOverlay('super_raid', ctx, 'SUPER RAID!', ctx.branding?.superRaidFlagUrl);
    case 'kabaddi_super_tackle_flag':
      return resolveKabaddiOverlay('super_tackle', ctx, 'SUPER TACKLE!', ctx.branding?.superTackleFlagUrl);
    case 'kabaddi_all_out_flag':
      return resolveKabaddiOverlay('all_out', ctx, 'ALL OUT!', ctx.branding?.allOutFlagUrl);
    case 'kabaddi_bonus_point_flag':
      return resolveKabaddiOverlay('bonus_point', ctx, 'BONUS!', ctx.branding?.bonusPointFlagUrl);
    case 'team_a_score':
      return resolveTeamScore('a', ctx);
    case 'team_b_score':
      return resolveTeamScore('b', ctx);
    case 'match_clock':
      return resolveClock(ctx);
    case 'squad_team_a_players':
    case 'squad_team_b_players':
      return resolveSquadList(kind, ctx);
    case 'squad_toss_result':
      return resolveTossResult(ctx);
    default:
      break;
  }

  if (ctx.sport === 'cricket') return resolveCricket(kind, ctx.live, ctx.matchStats, ctx.tournamentStats);
  if (ctx.sport === 'football') return resolveFootball(kind, ctx.live, ctx.players);
  if (ctx.sport === 'kabaddi') return resolveKabaddi(kind, ctx.live, ctx.rules ?? DEFAULT_KABADDI_RULES, ctx.players);
  if (ctx.sport === 'carrom') return resolveCarrom(kind, ctx.match, ctx.live, ctx.rules ?? DEFAULT_CARROM_RULES, ctx.overlay ?? null);
  return EMPTY;
}

function carromName(match: CarromMatchSetup | null, side: CarromSide): string {
  if (!match) return side === 'A' ? 'Team A' : 'Team B';
  const team = side === 'A' ? match.teamA : match.teamB;
  return team.shortName || team.name;
}

function carromCoins(remaining: number): string {
  const left = Math.max(0, Math.min(CARROMMEN_PER_SIDE, remaining));
  return `${'●'.repeat(left)}${'○'.repeat(CARROMMEN_PER_SIDE - left)}`;
}

function resolveCarrom(
  kind: WidgetKind, match: CarromMatchSetup | null, live: CarromLiveState | null,
  rules: CarromRulesConfig, overlay: CarromOverlayControl | null,
): ResolvedWidgetContent {
  const game = currentCarromGame(live);
  const board = live?.board ?? null;
  switch (kind) {
    case 'carrom_board_score':
      return { text: `${game?.score.A ?? 0} - ${game?.score.B ?? 0}` };
    case 'carrom_games_won':
      return { text: `Games ${live?.gamesWon.A ?? 0} - ${live?.gamesWon.B ?? 0}` };
    case 'carrom_team_a_games':
      return { text: String(live?.gamesWon.A ?? 0) };
    case 'carrom_team_b_games':
      return { text: String(live?.gamesWon.B ?? 0) };
    case 'carrom_game_label':
      if (!live || live.phase === 'not_started') return { text: 'Pre-match' };
      if (live.phase === 'completed') return { text: CARROM_PHASE_LABELS.completed };
      if (live.phase === 'game_break') return { text: 'Game break' };
      return { text: `Game ${live.currentGame}` };
    case 'carrom_board_label':
      return board ? { text: board.number > rules.boardsPerGame ? `Extra board` : `Board ${board.number}/${rules.boardsPerGame}` } : EMPTY;
    case 'carrom_turn': {
      if (!board || live?.phase !== 'in_progress') return EMPTY;
      const colour = coinColorFor(board, board.turn);
      return { text: `${colour === 'white' ? '⚪' : '⚫'} ${carromName(match, board.turn)} to strike` };
    }
    case 'carrom_stroke_clock': {
      const secs = carromStrokeSecondsRemaining(live, rules);
      return secs === null ? EMPTY : { text: `${secs}s`, urgent: secs <= 5 };
    }
    case 'carrom_team_a_coins':
    case 'carrom_team_b_coins': {
      if (!board) return EMPTY;
      const side: CarromSide = kind === 'carrom_team_a_coins' ? 'A' : 'B';
      const colour = coinColorFor(board, side);
      return { text: `${carromCoins(board.remaining[side])} ${board.remaining[side]} ${colour}` };
    }
    case 'carrom_queen_status': {
      if (!board) return EMPTY;
      if (board.queen === 'covered') return { text: `👑 Covered · ${carromName(match, board.queenBy ?? 'A')}` };
      if (board.queen === 'pending_cover') return { text: `👑 Cover pending · ${carromName(match, board.queenBy ?? 'A')}`, urgent: true };
      return { text: '👑 Queen on board' };
    }
    case 'carrom_last_board': {
      const last = game?.boards.at(-1) ?? live?.games.at(-1)?.boards.at(-1);
      return last ? { text: `B${last.board}: ${carromName(match, last.winner)} +${last.points}${last.queenCredited ? ' 👑' : ''}` } : EMPTY;
    }
    case 'carrom_board_history': {
      const boards = game?.boards ?? [];
      return boards.length ? { items: boards.map(b => ({ text: `Board ${b.board} · ${carromName(match, b.winner)} +${b.points}${b.queenCredited ? ' 👑' : ''}` })) } : EMPTY;
    }
    case 'carrom_queen_flag':
      return overlay?.activeOverlay === 'queen_covered' ? { text: '👑 QUEEN COVERED' } : EMPTY;
    case 'carrom_board_won_flag': {
      const type = overlay?.activeOverlay;
      if (type !== 'board_won' && type !== 'game_won' && type !== 'match_won') return EMPTY;
      const side = overlay?.activeEvent?.side;
      const who = side ? carromName(match, side) : '';
      if (type === 'match_won') return { text: `${who} wins the match!` };
      if (type === 'game_won') return { text: `Game to ${who}` };
      return { text: `Board to ${who}${overlay?.activeEvent?.points ? ` +${overlay.activeEvent.points}` : ''}` };
    }
    default:
      return EMPTY;
  }
}

function resolveKabaddiOverlay(type: NonNullable<KabaddiOverlayControl>['activeOverlay'], ctx: ScorecardDataContext, text: string, imageUrl?: string): ResolvedWidgetContent {
  if (ctx.sport !== 'kabaddi') return EMPTY;
  const explicitlyCleared = ctx.overlay?.activeOverlay === 'none';
  const active = type === 'do_or_die'
    ? !explicitlyCleared && (ctx.live?.isDoOrDie || ctx.overlay?.activeOverlay === type)
    : ctx.overlay?.activeOverlay === type;
  if (!active) return EMPTY;
  return imageUrl ? { imageUrl } : { text };
}

function overlayTeamMatches(widget: ScorecardWidgetInstance, ctx: ScorecardDataContext): boolean {
  if (widget.previewTeamSide === 'common' || !widget.previewTeamSide) return true;
  if (ctx.sport !== 'kabaddi' || !ctx.match) return false;
  const teamId = ctx.overlay?.activeEvent?.teamId || ctx.live?.raidingTeamId;
  if (!teamId) return false;
  const teamAIds = new Set([ctx.match.teamA.id, ctx.live?.teamAId].filter((id): id is string => !!id));
  const teamBIds = new Set([ctx.match.teamB.id, ctx.live?.teamBId].filter((id): id is string => !!id));
  return widget.previewTeamSide === 'team_a' ? teamAIds.has(teamId) : teamBIds.has(teamId);
}

function resolveSquadList(kind: 'squad_team_a_players' | 'squad_team_b_players', ctx: ScorecardDataContext): ResolvedWidgetContent {
  const side = kind === 'squad_team_a_players' ? 'teamA' : 'teamB';
  if (ctx.sport === 'cricket') {
    const players = ctx.lineups?.[side]?.players ?? [];
    if (!players.length) return EMPTY;
    return { items: players.map(p => ({ text: p.playerName, imageUrl: p.imageUrl })) };
  }
  if (!ctx.match) return EMPTY;
  if (ctx.sport === 'carrom') {
    const team = side === 'teamA' ? ctx.match.teamA : ctx.match.teamB;
    const members = team.members?.length ? team.members : [team.name];
    return { items: members.map(name => ({ text: name, imageUrl: team.photoUrl })) };
  }
  const teamId = side === 'teamA' ? ctx.match.teamA.id : ctx.match.teamB.id;
  const players = (ctx.players ?? []).filter(p => p.teamId === teamId);
  if (!players.length) return EMPTY;
  return { items: players.map(p => ({ text: p.name, imageUrl: p.photoUrl })) };
}

function resolveTossResult(ctx: ScorecardDataContext): ResolvedWidgetContent {
  if (ctx.sport === 'football' || !ctx.match) return EMPTY;
  if (ctx.sport === 'carrom') {
    const breaker = ctx.match.firstBreaker ?? ctx.live?.firstBreaker;
    if (!breaker) return EMPTY;
    const team = breaker === 'A' ? ctx.match.teamA : ctx.match.teamB;
    return { text: `${team.name} won the toss and breaks first (white)` };
  }
  const { tossWonBy, tossElected } = ctx.match;
  if (!tossWonBy || !tossElected) return EMPTY;
  const winner = tossWonBy === ctx.match.teamA.id ? ctx.match.teamA.name : ctx.match.teamB.name;
  const action = ctx.sport === 'cricket' ? (tossElected === 'bat' ? 'bat' : 'bowl') : (tossElected === 'raid' ? 'raid' : 'defend');
  return { text: `${winner} won the toss, elected to ${action} first` };
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
  if (ctx.sport === 'carrom') {
    const secs = carromStrokeSecondsRemaining(ctx.live, ctx.rules ?? DEFAULT_CARROM_RULES);
    return { text: secs === null ? '00:00' : `00:${String(secs).padStart(2, '0')}` };
  }
  return { text: '00:00' };
}

function resolveTeamScore(side: 'a' | 'b', ctx: ScorecardDataContext): ResolvedWidgetContent {
  if (ctx.sport === 'football') return { text: String(side === 'a' ? ctx.live?.homeScore ?? 0 : ctx.live?.awayScore ?? 0) };
  if (ctx.sport === 'kabaddi') return { text: String(side === 'a' ? ctx.live?.teamA.score ?? 0 : ctx.live?.teamB.score ?? 0) };
  if (ctx.sport === 'carrom') {
    const game = currentCarromGame(ctx.live);
    return { text: String(game?.score[side === 'a' ? 'A' : 'B'] ?? 0) };
  }
  if (ctx.sport === 'cricket' && ctx.live && ctx.match) {
    return { text: ctx.live.battingTeamId === ctx.match.teamA.id && side === 'a' || ctx.live.battingTeamId === ctx.match.teamB.id && side === 'b' ? `${ctx.live.runs}/${ctx.live.wickets}` : '0/0' };
  }
  return { text: '0' };
}

function resolveCricket(
  kind: WidgetKind, live: LiveScore | null,
  matchStats?: MatchStatsSnapshot | null, tournamentStats?: TournamentStats | null,
): ResolvedWidgetContent {
  switch (kind) {
    case 'stats_top_run_scorer': {
      const s = matchStats?.topRunScorers?.[0];
      return s ? { text: `${s.playerName} — ${s.runs} runs`, imageUrl: s.imageUrl } : EMPTY;
    }
    case 'stats_top_wicket_taker': {
      const b = matchStats?.topWicketTakers?.[0];
      return b ? { text: `${b.playerName} — ${b.wickets} wkts`, imageUrl: b.imageUrl } : EMPTY;
    }
    case 'stats_orange_cap': {
      const s = tournamentStats?.orangeCap;
      return s ? { text: `${s.playerName} — ${s.runs} runs`, imageUrl: s.imageUrl } : EMPTY;
    }
    case 'stats_purple_cap': {
      const b = tournamentStats?.purpleCap;
      return b ? { text: `${b.playerName} — ${b.wickets} wkts`, imageUrl: b.imageUrl } : EMPTY;
    }
    case 'stats_mvp_leaderboard': {
      const top = (matchStats?.mvpLeaderboard ?? []).slice(0, 3);
      return top.length ? { items: top.map(p => ({ text: `${p.playerName} — ${p.total.toFixed(0)} pts` })) } : EMPTY;
    }
    default:
      break;
  }
  if (!live) {
    if (kind === 'cricket_score') return { text: '0/0' };
    return EMPTY;
  }
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

function resolveFootball(kind: WidgetKind, live: FootballLiveState | null, players?: FootballPlayer[]): ResolvedWidgetContent {
  if (kind === 'stats_top_goal_scorer') {
    const top = [...(players ?? [])].sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0];
    return top && (top.goals ?? 0) > 0 ? { text: `${top.name} — ${top.goals} goals`, imageUrl: top.photoUrl } : EMPTY;
  }
  if (kind === 'stats_top_assist') {
    const top = [...(players ?? [])].sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0];
    return top && (top.assists ?? 0) > 0 ? { text: `${top.name} — ${top.assists} assists`, imageUrl: top.photoUrl } : EMPTY;
  }
  if (!live) {
    if (kind === 'football_score') return { text: '0 - 0' };
    return EMPTY;
  }
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

function resolveKabaddi(kind: WidgetKind, live: KabaddiLiveState | null, rules: KabaddiRulesConfig, players?: KabaddiPlayer[]): ResolvedWidgetContent {
  if (kind === 'stats_top_raider') {
    const top = [...(players ?? [])].sort((a, b) => (b.raidPoints ?? 0) - (a.raidPoints ?? 0))[0];
    return top && (top.raidPoints ?? 0) > 0 ? { text: `${top.name} — ${top.raidPoints} raid pts`, imageUrl: top.photoUrl } : EMPTY;
  }
  if (kind === 'stats_top_defender') {
    const top = [...(players ?? [])].sort((a, b) => (b.tacklePoints ?? 0) - (a.tacklePoints ?? 0))[0];
    return top && (top.tacklePoints ?? 0) > 0 ? { text: `${top.name} — ${top.tacklePoints} tackle pts`, imageUrl: top.photoUrl } : EMPTY;
  }
  if (!live) {
    if (kind === 'kabaddi_score' || kind === 'kabaddi_players_on_mat') return { text: kind === 'kabaddi_score' ? '0 - 0' : '0 - 0' };
    if (kind === 'kabaddi_team_a_players_on_mat' || kind === 'kabaddi_team_b_players_on_mat') return { text: '0' };
    if (kind === 'kabaddi_team_a_players' || kind === 'kabaddi_team_b_players') return { items: [] };
    return EMPTY;
  }
  switch (kind) {
    case 'kabaddi_score':
      return { text: `${live.teamA.score} - ${live.teamB.score}` };
    case 'kabaddi_half_label':
      return { text: KABADDI_HALF_LABELS[live.half] };
    case 'kabaddi_raid_clock': {
      const secs = raidSecondsRemaining(live, rules);
      return { text: `${secs ?? rules.raidDurationSec}s`, urgent: secs !== null && secs <= 10 };
    }
    case 'kabaddi_players_on_mat':
      return { text: `${live.teamA.playersOnCourt} - ${live.teamB.playersOnCourt}` };
    case 'kabaddi_team_a_players_on_mat':
      return { text: `${live.teamA.playersOnCourt}` };
    case 'kabaddi_team_b_players_on_mat':
      return { text: `${live.teamB.playersOnCourt}` };
    case 'kabaddi_team_a_players':
      return resolveKabaddiPlayers('a', live, players);
    case 'kabaddi_team_b_players':
      return resolveKabaddiPlayers('b', live, players);
    case 'kabaddi_raider_name':
      return live.raiderName ? { text: live.raiderName } : EMPTY;
    default:
      return EMPTY;
  }
}

function resolveKabaddiPlayers(side: 'a' | 'b', live: KabaddiLiveState, players?: KabaddiPlayer[]): ResolvedWidgetContent {
  const teamId = side === 'a' ? live.teamAId : live.teamBId;
  const state = side === 'a' ? live.teamA : live.teamB;
  const activeIds = new Set(state.onCourtIds ?? state.startingIds ?? []);
  const teamPlayers = (players ?? []).filter(player => player.teamId === teamId);
  if (!teamPlayers.length) return EMPTY;
  const visiblePlayers = activeIds.size ? teamPlayers.filter(player => activeIds.has(player.id)) : teamPlayers;
  return { items: visiblePlayers.map(player => ({
    text: player.name,
    imageUrl: player.photoUrl,
  })) };
}

function resolvePlayerCountSlots(count: number, teamSize: number, icon: string): ResolvedWidgetContent {
  return { playerSlots: Array.from({ length: Math.max(teamSize, count) }, (_, index) => ({ active: index < count, icon })) };
}

/** Resolves a full widget instance — handles custom text/image/timer overrides before falling back to `kind`. */
export function resolveWidgetContent(widget: ScorecardWidgetInstance, ctx: ScorecardDataContext, preview = false): ResolvedWidgetContent {
  if (preview && widget.previewItems) return { items: widget.previewItems };
  const celebrationKinds: WidgetKind[] = ['kabaddi_do_or_die_flag', 'kabaddi_super_raid_flag', 'kabaddi_super_tackle_flag', 'kabaddi_all_out_flag', 'kabaddi_bonus_point_flag'];
  if (celebrationKinds.includes(widget.kind) && !preview && !overlayTeamMatches(widget, ctx)) return EMPTY;
  const isTeamACount = widget.kind === 'kabaddi_team_a_players_on_mat';
  const isTeamBCount = widget.kind === 'kabaddi_team_b_players_on_mat';
  if (isTeamACount || isTeamBCount) {
    const teamSize = ctx.sport === 'kabaddi' ? (ctx.rules?.playersPerSide ?? DEFAULT_KABADDI_RULES.playersPerSide) : 7;
    const count = preview
      ? Number(widget.previewText || 5)
      : ctx.sport === 'kabaddi' && ctx.live ? (isTeamACount ? ctx.live.teamA.playersOnCourt : ctx.live.teamB.playersOnCourt) : 0;
    return resolvePlayerCountSlots(Math.max(0, count), teamSize, widget.previewIcon || 'people');
  }
  const previewFlagMedia: Partial<Record<WidgetKind, string | undefined>> = {
    kabaddi_do_or_die_flag: ctx.branding?.doOrDieFlagUrl,
    kabaddi_super_raid_flag: ctx.branding?.superRaidFlagUrl,
    kabaddi_super_tackle_flag: ctx.branding?.superTackleFlagUrl,
    kabaddi_all_out_flag: ctx.branding?.allOutFlagUrl,
    kabaddi_bonus_point_flag: ctx.branding?.bonusPointFlagUrl,
  };
  if (preview && widget.kind in previewFlagMedia) {
    const mediaUrl = previewFlagMedia[widget.kind];
    return mediaUrl || widget.previewImageUrl
      ? { imageUrl: widget.previewImageUrl || mediaUrl }
      : { text: widget.previewText || widget.label };
  }
  if (preview && widget.previewImageUrl) return { imageUrl: widget.previewImageUrl };
  if (preview && widget.previewText !== undefined) return { text: widget.previewText };
  if (widget.kind === 'live_badge' && widget.staticImageUrl) return { imageUrl: widget.staticImageUrl };
  if (widget.kind === 'custom_text') return { text: widget.staticText || widget.label };
  if (widget.kind === 'custom_image') return widget.staticImageUrl ? { imageUrl: widget.staticImageUrl } : EMPTY;
  if ((widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo') && widget.staticImageUrl) return { imageUrl: widget.staticImageUrl };
  if (widget.kind === 'custom_timer') {
    const clock = resolveClock(ctx);
    if (clock.hidden) return clock;
    return { text: widget.timerLabel ? `${widget.timerLabel} ${clock.text}` : clock.text };
  }
  return resolveWidgetKind(widget.kind, ctx);
}

/** Selects a saved team-specific celebration snapshot for live rendering. */
export function resolveWidgetVariant(widget: ScorecardWidgetInstance, ctx: ScorecardDataContext, interactive = false): ScorecardWidgetInstance {
  if (interactive || !widget.teamVariants || ctx.sport !== 'kabaddi') return widget;
  const teamId = ctx.overlay?.activeEvent?.teamId || ctx.live?.raidingTeamId;
  if (!teamId || !ctx.match) return widget;
  const side = teamId === ctx.match.teamA.id || teamId === ctx.live?.teamAId ? 'team_a' : teamId === ctx.match.teamB.id || teamId === ctx.live?.teamBId ? 'team_b' : null;
  if (!side) return widget;
  const variant = widget.teamVariants[side];
  return variant ? { ...widget, ...variant, previewTeamSide: side } : widget;
}
