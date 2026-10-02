import type { Innings, MatchScore, MatchSetup, TournamentPoolSettings } from '../types/scoring';

export interface PointsTableMatch {
  setup: MatchSetup;
  final?: MatchScore;
  innings?: Record<string, Innings>;
}

export interface PointsTableTeam {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface PointsTableStanding {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  nrr: number;
  points: number;
}

export type PointsTablePoolConfig = TournamentPoolSettings;

export interface PoolAssignmentResult {
  assignments: Record<string, string>;
  poolIds: string[];
  unassignedTeamIds: string[];
}

function legalBallsInOvers(overs: number): number {
  const value = Number.isFinite(overs) ? Math.max(0, overs) : 0;
  const whole = Math.floor(value);
  const balls = Math.round((value - whole) * 10);
  return whole * 6 + Math.min(5, Math.max(0, balls));
}

function creditedBalls(innings: Innings): number {
  const overs = innings.totalWickets >= 10 ? innings.maxOvers : innings.totalOvers;
  return legalBallsInOvers(overs);
}

export function calculateTeamNetRunRate(teamId: string, matches: PointsTableMatch[]): number {
  let runsScored = 0;
  let ballsFaced = 0;
  let runsConceded = 0;
  let ballsBowled = 0;

  for (const match of matches) {
    if (match.setup.status !== 'completed' || !match.final?.result) continue;
    const innings = match.final.innings?.length ? match.final.innings : Object.values(match.innings || {});
    const battingInnings = innings.find(item => item.battingTeamId === teamId);
    const bowlingInnings = innings.find(item => item.bowlingTeamId === teamId);
    if (battingInnings) {
      runsScored += battingInnings.totalRuns;
      ballsFaced += creditedBalls(battingInnings);
    }
    if (bowlingInnings) {
      runsConceded += bowlingInnings.totalRuns;
      ballsBowled += creditedBalls(bowlingInnings);
    }
  }

  if (ballsFaced === 0 || ballsBowled === 0) return 0;
  return Math.round(((runsScored / ballsFaced) - (runsConceded / ballsBowled)) * 6000) / 1000;
}

export function buildPointsTableStandings(
  matches: PointsTableMatch[],
  teams: readonly PointsTableTeam[] = [],
): PointsTableStanding[] {
  const standings: Record<string, PointsTableStanding> = {};
  const addTeam = (team: PointsTableTeam) => {
    if (!standings[team.id]) {
      standings[team.id] = { teamId: team.id, teamName: team.name, played: 0, won: 0, lost: 0, nrr: 0, points: 0 };
    }
  };

  for (const team of teams) addTeam(team);
  for (const match of matches) {
    const { teamA, teamB } = match.setup;
    addTeam(teamA);
    addTeam(teamB);
    if (match.setup.status !== 'completed' || !match.final?.result) continue;

    standings[teamA.id].played++;
    standings[teamB.id].played++;
    if (match.final.result.winner === teamA.id) {
      standings[teamA.id].won++;
      standings[teamA.id].points += 2;
      standings[teamB.id].lost++;
    } else if (match.final.result.winner === teamB.id) {
      standings[teamB.id].won++;
      standings[teamB.id].points += 2;
      standings[teamA.id].lost++;
    }
  }

  return Object.values(standings)
    .map(standing => ({ ...standing, nrr: calculateTeamNetRunRate(standing.teamId, matches) }))
    .sort((left, right) => right.points - left.points || right.nrr - left.nrr || right.won - left.won || left.lost - right.lost);
}

export function buildPoolAssignments(
  teams: readonly PointsTableTeam[],
  poolCountInput: number,
  teamsPerPoolInput: number,
  existingAssignments: Record<string, string> = {},
): PoolAssignmentResult {
  const poolCount = Math.max(1, Math.min(16, Math.floor(poolCountInput) || 1));
  const teamsPerPool = Math.max(2, Math.min(32, Math.floor(teamsPerPoolInput) || 4));
  const poolIds = Array.from({ length: poolCount }, (_, index) => `pool_${index + 1}`);
  const assignments: Record<string, string> = {};
  const loads = new Map(poolIds.map(poolId => [poolId, 0]));

  for (const team of teams) {
    const assigned = existingAssignments[team.id];
    if (assigned && loads.has(assigned) && (loads.get(assigned) || 0) < teamsPerPool) {
      assignments[team.id] = assigned;
      loads.set(assigned, (loads.get(assigned) || 0) + 1);
    }
  }

  const unassignedTeamIds: string[] = [];
  for (const team of teams) {
    if (assignments[team.id]) continue;
    const availablePool = poolIds.find(poolId => (loads.get(poolId) || 0) < teamsPerPool);
    if (!availablePool) {
      unassignedTeamIds.push(team.id);
      continue;
    }
    assignments[team.id] = availablePool;
    loads.set(availablePool, (loads.get(availablePool) || 0) + 1);
  }

  return { assignments, poolIds, unassignedTeamIds };
}