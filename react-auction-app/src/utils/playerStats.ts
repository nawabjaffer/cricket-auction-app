import type { Player } from '../types';
import { getKabaddiRoleLabel, getKabaddiRoleBadgeClass } from './kabaddiRoles';
import { getFootballRoleLabel, getFootballRoleBadgeClass } from './footballRoles';

export interface StatItem {
  label: string;
  value: string;
  category: 'batting' | 'bowling' | 'general';
}

function toStatText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Returns role-appropriate stats for a player.
 * - Batsman / Wicket-Keeper: batting stats
 * - Bowler: bowling stats
 * - All-Rounder: mixed batting + bowling
 * - Player / unknown: general stats
 */
export function getRoleBasedStats(player: Player, maxStats: number = 6): StatItem[] {
  const role = typeof player.role === 'string' ? player.role.toLowerCase() : '';
  const isBatsman = role.includes('batsman') || role.includes('bat') || role.includes('wicket');
  const isBowler = role.includes('bowler') || role.includes('bowl');
  const isAllRounder = role.includes('all-rounder') || role.includes('all rounder') || role.includes('allrounder');

  let stats: StatItem[] = [];

  if (isAllRounder) {
    const battingHalf = Math.ceil(maxStats / 2);
    const bowlingHalf = maxStats - battingHalf;
    stats = [
      ...getBattingStats(player).slice(0, battingHalf),
      ...getBowlingStats(player).slice(0, bowlingHalf),
    ];
  } else if (isBowler) {
    stats = getBowlingStats(player);
  } else if (isBatsman) {
    stats = getBattingStats(player);
  } else {
    // Generic / Player role: show general + mix
    stats = getGeneralStats(player);
  }

  return stats
    .slice(0, maxStats)
    .map((stat) => ({
      ...stat,
      value: toStatText(stat.value),
    }));
}

function getBattingStats(player: Player): StatItem[] {
  const bs = player.battingStats;
  const stats: StatItem[] = [];

  // Prefer detailed battingStats if available, fallback to top-level fields
  const matches = bs?.matches || player.matches || '';
  const runs = bs?.runs || player.runs || '';

  if (matches && matches !== '0') stats.push({ label: 'Matches', value: matches, category: 'batting' });
  if (runs && runs !== '0') stats.push({ label: 'Runs', value: runs, category: 'batting' });
  if (bs?.highestScore && bs.highestScore !== '0') stats.push({ label: 'Highest', value: bs.highestScore, category: 'batting' });
  if (bs?.average && bs.average !== '0.00' && bs.average !== '0') stats.push({ label: 'Average', value: bs.average, category: 'batting' });
  if (bs?.strikeRate && bs.strikeRate !== '0.00' && bs.strikeRate !== '0') stats.push({ label: 'Strike Rate', value: bs.strikeRate, category: 'batting' });
  if (bs?.fifties && bs.fifties !== '0') stats.push({ label: '50s', value: bs.fifties, category: 'batting' });
  if (bs?.hundreds && bs.hundreds !== '0') stats.push({ label: '100s', value: bs.hundreds, category: 'batting' });
  if (bs?.sixes && bs.sixes !== '0') stats.push({ label: '6s', value: bs.sixes, category: 'batting' });
  if (bs?.fours && bs.fours !== '0') stats.push({ label: '4s', value: bs.fours, category: 'batting' });
  if (player.battingBestFigures) stats.push({ label: 'Best', value: player.battingBestFigures, category: 'batting' });

  // If no detailed stats, use top-level fields
  if (stats.length === 0) {
    if (player.matches) stats.push({ label: 'Matches', value: player.matches, category: 'batting' });
    if (player.runs) stats.push({ label: 'Runs', value: player.runs, category: 'batting' });
    if (player.wickets) stats.push({ label: 'Wickets', value: player.wickets, category: 'general' });
  }

  return stats;
}

function getBowlingStats(player: Player): StatItem[] {
  const bw = player.bowlingStats;
  const stats: StatItem[] = [];

  const matches = bw?.matches || player.matches || '';
  const wickets = bw?.wickets || player.wickets || '';

  if (matches && matches !== '0') stats.push({ label: 'Matches', value: matches, category: 'bowling' });
  if (wickets && wickets !== '0') stats.push({ label: 'Wickets', value: wickets, category: 'bowling' });
  if (bw?.bestBowling && bw.bestBowling !== 'N/A') stats.push({ label: 'Best', value: bw.bestBowling, category: 'bowling' });
  if (bw?.economy && bw.economy !== '0.00' && bw.economy !== '0') stats.push({ label: 'Economy', value: bw.economy, category: 'bowling' });
  if (bw?.average && bw.average !== '0.00' && bw.average !== '0') stats.push({ label: 'Avg', value: bw.average, category: 'bowling' });
  if (bw?.strikeRate && bw.strikeRate !== '0.00' && bw.strikeRate !== '0') stats.push({ label: 'SR', value: bw.strikeRate, category: 'bowling' });
  if (bw?.fiveWickets && bw.fiveWickets !== '0') stats.push({ label: '5W', value: bw.fiveWickets, category: 'bowling' });
  if (bw?.threeWickets && bw.threeWickets !== '0') stats.push({ label: '3W', value: bw.threeWickets, category: 'bowling' });
  if (bw?.maidens && bw.maidens !== '0') stats.push({ label: 'Maidens', value: bw.maidens, category: 'bowling' });
  if (player.bowlingBestFigures) stats.push({ label: 'Best Fig.', value: player.bowlingBestFigures, category: 'bowling' });

  // Fallback to top-level
  if (stats.length === 0) {
    if (player.matches) stats.push({ label: 'Matches', value: player.matches, category: 'general' });
    if (player.wickets) stats.push({ label: 'Wickets', value: player.wickets, category: 'bowling' });
    if (player.runs) stats.push({ label: 'Runs', value: player.runs, category: 'general' });
  }

  return stats;
}

function getGeneralStats(player: Player): StatItem[] {
  const stats: StatItem[] = [];
  if (player.matches) stats.push({ label: 'Matches', value: player.matches, category: 'general' });
  if (player.runs) stats.push({ label: 'Runs', value: player.runs, category: 'general' });
  if (player.wickets) stats.push({ label: 'Wickets', value: player.wickets, category: 'general' });
  if (player.battingBestFigures) stats.push({ label: 'Bat Best', value: player.battingBestFigures, category: 'batting' });
  if (player.bowlingBestFigures) stats.push({ label: 'Bowl Best', value: player.bowlingBestFigures, category: 'bowling' });
  // Fill from detailed stats if available
  if (player.battingStats?.average && player.battingStats.average !== '0.00') {
    stats.push({ label: 'Bat Avg', value: player.battingStats.average, category: 'batting' });
  }
  if (player.bowlingStats?.economy && player.bowlingStats.economy !== '0.00') {
    stats.push({ label: 'Economy', value: player.bowlingStats.economy, category: 'bowling' });
  }
  return stats;
}

/**
 * Get a short role label with icon hint
 */
export function getRoleLabel(role: string): string {
  const kabaddi = getKabaddiRoleLabel(role);
  if (kabaddi) return kabaddi;
  const football = getFootballRoleLabel(role);
  if (football) return football;
  const r = typeof role === 'string' ? role.toLowerCase() : '';
  if (r.includes('all-rounder') || r.includes('all rounder')) return 'All-Rounder';
  if (r.includes('wicket') && r.includes('bat')) return 'WK-Batsman';
  if (r.includes('wicket')) return 'Wicket-Keeper';
  if (r.includes('bat')) return 'Batsman';
  if (r.includes('bowl')) return 'Bowler';
  return role || 'Player';
}

/**
 * Get role badge color class
 */
export function getRoleBadgeClass(role: string): string {
  const kabaddi = getKabaddiRoleBadgeClass(role);
  if (kabaddi) return kabaddi;
  const football = getFootballRoleBadgeClass(role);
  if (football) return football;
  const r = typeof role === 'string' ? role.toLowerCase() : '';
  if (r.includes('all-rounder') || r.includes('all rounder')) return 'role-allrounder';
  if (r.includes('wicket')) return 'role-keeper';
  if (r.includes('bat')) return 'role-batsman';
  if (r.includes('bowl')) return 'role-bowler';
  return 'role-default';
}
