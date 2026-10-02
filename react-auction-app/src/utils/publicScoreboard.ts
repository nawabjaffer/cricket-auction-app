import type { Innings, MatchScore, MatchSetup } from '../types/scoring';

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
