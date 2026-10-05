import type { Innings, LiveScore, MatchScore, MatchSetup } from '../types/scoring';
import type { PointsTableMatch } from './pointsTable';

export type PublicMatchFilter = 'all' | 'live' | 'upcoming' | 'completed';

export interface SuperAdminMobileCredentials {
  superAdminUsername?: string;
  superAdminPassword?: string;
}

export function verifySuperAdminMobileCredentials(
  configured: SuperAdminMobileCredentials | null | undefined,
  username: string,
  password: string,
): boolean {
  const expectedUsername = configured?.superAdminUsername?.trim();
  const expectedPassword = configured?.superAdminPassword;
  return Boolean(expectedUsername && expectedPassword
    && username.trim() === expectedUsername
    && password === expectedPassword);
}

export function filterPublicMatches(matches: MatchSetup[], filter: PublicMatchFilter): MatchSetup[] {
  const filtered = filter === 'all' ? matches : matches.filter(match => {
    if (filter === 'upcoming') return match.status === 'scheduled';
    if (filter === 'completed') return match.status === 'completed' || match.status === 'abandoned';
    return match.status === filter;
  });
  return [...filtered].sort((left, right) => {
    const leftDate = new Date(left.date).getTime();
    const rightDate = new Date(right.date).getTime();
    if (filter === 'all') {
      const priority = (status: MatchSetup['status']) => status === 'live' ? 0 : status === 'scheduled' ? 1 : status === 'completed' ? 2 : 3;
      const priorityDifference = priority(left.status) - priority(right.status);
      if (priorityDifference) return priorityDifference;
    }
    return filter === 'completed' ? rightDate - leftDate : leftDate - rightDate;
  });
}

export function publicMatchResult(match: MatchSetup, final?: MatchScore): string {
  if (match.interruption) return `Match ${match.interruption.kind}: ${match.interruption.reason}`;
  const result = final?.result;
  if (result?.winner) {
    const winner = [match.teamA, match.teamB].find(team => team.id === result.winner)?.name || result.winner;
    return `${winner} won by ${result.margin}${result.method ? ` (${result.method})` : ''}`;
  }
  if (result?.margin) return result.margin;
  return match.status === 'live' ? 'Match in progress' : match.status === 'completed' ? 'Match completed'
    : match.status === 'abandoned' ? 'Match abandoned' : 'Upcoming';
}

export function getMatchNumbers(matches: MatchSetup[]): Map<string, number> {
  const used = new Set(matches.flatMap(match => match.matchNumber ? [match.matchNumber] : []));
  const numbers = new Map<string, number>();
  let next = 1;
  for (const match of [...matches].sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))) {
    while (used.has(next)) next++;
    const number = match.matchNumber || next++;
    used.add(number);
    numbers.set(match.id, number);
  }
  return numbers;
}

export interface PublicTournamentPlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  matches: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  maidens: number;
  dots: number;
  bowlingBalls: number;
  conceded: number;
  strikeRate: number;
  economy: number;
}

export function buildPublicTournamentPlayers(records: (PointsTableMatch & { live?: LiveScore })[]): PublicTournamentPlayer[] {
  const players = new Map<string, PublicTournamentPlayer>();
  const played = new Map<string, Set<string>>();
  for (const record of records) {
    const scores = new Map((record.final?.innings || []).map(innings => [innings.number, innings]));
    for (const innings of Object.values(record.innings || {})) if (innings) scores.set(innings.number, innings);
    const live = record.live;
    if (live && record.setup.status === 'live') {
      const existing = scores.get(live.currentInnings as 1 | 2);
      scores.set(live.currentInnings as 1 | 2, {
        ...existing,
        number: live.currentInnings,
        battingTeamId: live.battingTeamId,
        bowlingTeamId: live.bowlingTeamId,
        batsmen: live.allBatsmen?.length ? live.allBatsmen : existing?.batsmen || [],
        bowlers: live.allBowlers?.length ? live.allBowlers : existing?.bowlers || [],
      } as Innings);
    }
    const entry = (playerId: string, playerName: string, teamId: string) => {
      const key = `${teamId}:${playerId}`;
      if (!players.has(key)) players.set(key, {
        playerId, playerName, teamId, teamName: [record.setup.teamA, record.setup.teamB].find(team => team.id === teamId)?.name || teamId,
        matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, dots: 0, bowlingBalls: 0, conceded: 0, strikeRate: 0, economy: 0,
      });
      const player = players.get(key)!;
      const appearances = played.get(key) || new Set<string>();
      appearances.add(record.setup.id);
      played.set(key, appearances);
      player.matches = appearances.size;
      return player;
    };
    for (const innings of scores.values()) {
      for (const batter of innings.batsmen || []) {
        const player = entry(batter.playerId, batter.playerName, innings.battingTeamId);
        player.runs += batter.runs || 0; player.balls += batter.balls || 0;
        player.fours += batter.fours || 0; player.sixes += batter.sixes || 0;
      }
      for (const bowler of innings.bowlers || []) {
        const player = entry(bowler.playerId, bowler.playerName, innings.bowlingTeamId);
        player.wickets += bowler.wickets || 0; player.maidens += bowler.maidens || 0;
        player.dots += bowler.dots || 0; player.conceded += bowler.runs || 0;
        player.bowlingBalls += Math.floor(bowler.overs || 0) * 6 + Math.round(((bowler.overs || 0) % 1) * 10);
      }
    }
  }
  return [...players.values()].map(player => ({ ...player,
    strikeRate: player.balls ? player.runs / player.balls * 100 : 0,
    economy: player.bowlingBalls ? player.conceded / player.bowlingBalls * 6 : 0,
  }));
}

function asScoreNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function validOvers(value: number, maxOvers: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > maxOvers) return false;
  const balls = Math.round((value - Math.floor(value)) * 10);
  return balls >= 0 && balls <= 5;
}

export function validatePublicInningsCorrection(innings: Innings): string[] {
  const issues: string[] = [];
  const extrasTotal = asScoreNumber(innings.extras.wides) + asScoreNumber(innings.extras.noBalls)
    + asScoreNumber(innings.extras.byes) + asScoreNumber(innings.extras.legByes)
    + asScoreNumber(innings.extras.penalty);
  if (extrasTotal !== asScoreNumber(innings.extras.total)) {
    issues.push(`Innings ${innings.number}: extras total must equal the extras breakdown.`);
  }
  if (!validOvers(asScoreNumber(innings.totalOvers), asScoreNumber(innings.maxOvers))) {
    issues.push(`Innings ${innings.number}: total overs are invalid.`);
  }
  if (innings.totalWickets < 0 || innings.totalWickets > 10) {
    issues.push(`Innings ${innings.number}: wickets must be between 0 and 10.`);
  }
  const batsmanRuns = innings.batsmen.reduce((sum, batter) => sum + asScoreNumber(batter.runs), 0);
  if (batsmanRuns + extrasTotal !== asScoreNumber(innings.totalRuns)) {
    issues.push(`Innings ${innings.number}: total runs must equal batter runs plus extras.`);
  }
  if (innings.batsmen.filter(batter => batter.isOut).length < innings.totalWickets) {
    issues.push(`Innings ${innings.number}: dismissed batters cannot be fewer than wickets.`);
  }
  const playerIds = new Set<string>();
  for (const batter of innings.batsmen) {
    if (!batter.playerId.trim() || playerIds.has(batter.playerId)) {
      issues.push(`Innings ${innings.number}: batter IDs must be present and unique.`);
      break;
    }
    playerIds.add(batter.playerId);
    if (batter.runs < 0 || batter.balls < 0 || batter.fours < 0 || batter.sixes < 0) {
      issues.push(`Innings ${innings.number}: batter figures cannot be negative.`);
      break;
    }
  }
  const bowlerIds = new Set<string>();
  for (const bowler of innings.bowlers) {
    if (!bowler.playerId.trim() || bowlerIds.has(bowler.playerId)) {
      issues.push(`Innings ${innings.number}: bowler IDs must be present and unique.`);
      break;
    }
    bowlerIds.add(bowler.playerId);
    if (!validOvers(asScoreNumber(bowler.overs), asScoreNumber(innings.maxOvers))
      || bowler.runs < 0 || bowler.wickets < 0) {
      issues.push(`Innings ${innings.number}: bowler figures are invalid.`);
      break;
    }
  }
  return issues;
}

export function buildCorrectedFinalScore(final: MatchScore, innings: Innings[]): MatchScore {
  const first = innings.find(entry => entry.number === 1);
  const second = innings.find(entry => entry.number === 2);
  if (!first || !second) return { ...final, innings };
  let result: MatchScore['result'];
  if (first.totalRuns === second.totalRuns) {
    result = { winner: '', margin: 'Match Tied' };
  } else if (first.totalRuns > second.totalRuns) {
    result = { winner: first.battingTeamId, margin: `${first.totalRuns - second.totalRuns} runs` };
  } else {
    result = { winner: second.battingTeamId, margin: `${Math.max(0, 10 - second.totalWickets)} wickets` };
  }
  return {
    ...final,
    innings,
    teams: innings.map(entry => ({ batting: entry.battingTeamId, bowling: entry.bowlingTeamId })),
    result,
  };
}
