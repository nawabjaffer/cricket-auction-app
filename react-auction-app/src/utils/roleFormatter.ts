// ============================================================================
// ROLE FORMATTER UTILITY
// Normalizes inconsistent player role strings into clean, readable labels
// and maps roles to canonical auction categories for ordering.
// ============================================================================

import type { PlayerRole, AuctionRoleCategory, Player } from '../types';

// ---------------------------------------------------------------------------
// Canonical category mapping
// ---------------------------------------------------------------------------

const ROLE_TO_CATEGORY: Record<string, AuctionRoleCategory> = {
  'batsman': 'Batsman',
  'bowler': 'Bowler',
  'all-rounder': 'All-Rounder',
  'allrounder': 'All-Rounder',
  'all rounder': 'All-Rounder',
  'all_rounder': 'All-Rounder',
  'batting all_rounder': 'All-Rounder',
  'batting all-rounder': 'All-Rounder',
  'batting allrounder': 'All-Rounder',
  'bowling all_rounder': 'All-Rounder',
  'bowling all-rounder': 'All-Rounder',
  'bowling allrounder': 'All-Rounder',
  'wicket-keeper': 'Wicket Keeper Batsman',
  'wicket keeper': 'Wicket Keeper Batsman',
  'wicket keeper batsman': 'Wicket Keeper Batsman',
  'wk-batsman': 'Wicket Keeper Batsman',
  'wk batsman': 'Wicket Keeper Batsman',
  'wk - batsman': 'Wicket Keeper Batsman',
  'keeper': 'Wicket Keeper Batsman',
  'player': 'Batsman',
};

/**
 * Map any raw role string to a canonical AuctionRoleCategory.
 * Never returns 'Uncategorized' — always falls back to 'Batsman' so players
 * are grouped into a concrete cricket category.
 */
export function getRoleCategory(role: string | undefined | null): AuctionRoleCategory {
  if (!role || typeof role !== 'string') return 'Batsman';
  const key = role.trim().toLowerCase();

  // Direct match
  if (ROLE_TO_CATEGORY[key]) return ROLE_TO_CATEGORY[key];

  // Partial match heuristics
  if (/wicket[\s_-]*keep/i.test(key) || /^wk/i.test(key)) return 'Wicket Keeper Batsman';
  if (/all[\s_-]*round/i.test(key)) return 'All-Rounder';
  if (/bowl/i.test(key)) return 'Bowler';
  if (/bat/i.test(key)) return 'Batsman';

  return 'Batsman';
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasNonEmptyStat(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== '0.0' && normalized !== '0.00' && normalized !== 'n/a';
}

/**
 * Infer a canonical role category from full player data.
 * This avoids dumping generic "Player" records into "Uncategorized"
 * when batting/bowling fields already indicate a natural role.
 */
export function inferRoleCategoryFromPlayer(player: Partial<Player> | null | undefined): AuctionRoleCategory {
  // First try role string — getRoleCategory now always returns a concrete category
  const direct = getRoleCategory(player?.role as string | undefined);

  // If role string gave us 'Batsman' as a generic fallback, try to refine using stats
  const roleText = typeof player?.role === 'string' ? player.role.trim().toLowerCase() : '';
  const isGenericRole = !roleText || roleText === 'player' || roleText === 'unknown';

  if (!isGenericRole) return direct;

  // For generic roles, infer from stats
  if (/wicket[\s-]*keep|^wk\b/.test(roleText)) return 'Wicket Keeper Batsman';

  const runs = toNumber(player?.runs);
  const wickets = toNumber(player?.wickets);
  const battingRuns = toNumber(player?.battingStats?.runs);
  const bowlingWickets = toNumber(player?.bowlingStats?.wickets);

  const battingSignal = runs > 0
    || battingRuns > 0
    || hasNonEmptyStat(player?.battingBestFigures)
    || hasNonEmptyStat(player?.battingStats?.strikeRate)
    || hasNonEmptyStat(player?.battingStats?.average);

  const bowlingSignal = wickets > 0
    || bowlingWickets > 0
    || hasNonEmptyStat(player?.bowlingBestFigures)
    || hasNonEmptyStat(player?.bowlingStats?.economy)
    || hasNonEmptyStat(player?.bowlingStats?.average)
    || hasNonEmptyStat(player?.bowlingStats?.overs);

  if (battingSignal && bowlingSignal) return 'All-Rounder';
  if (bowlingSignal) return 'Bowler';
  return 'Batsman';
}

// ---------------------------------------------------------------------------
// Hand abbreviation expansion
// ---------------------------------------------------------------------------

const HAND_ABBREVIATIONS: Record<string, string> = {
  'RHB': 'Right-Hand Bat',
  'LHB': 'Left-Hand Bat',
};

// ---------------------------------------------------------------------------
// Bowling style normalization
// ---------------------------------------------------------------------------

const BOWLING_ABBREVIATIONS: [RegExp, string][] = [
  [/right[\s-]*arm\s+fast/i, 'Right-Arm Fast'],
  [/left[\s-]*arm\s+fast/i, 'Left-Arm Fast'],
  [/right[\s-]*arm\s+medium/i, 'Right-Arm Medium'],
  [/left[\s-]*arm\s+medium/i, 'Left-Arm Medium'],
  [/right[\s-]*arm\s+spin/i, 'Right-Arm Spin'],
  [/left[\s-]*arm\s+spin/i, 'Left-Arm Spin'],
  [/right[\s-]*arm\s+off[\s-]*spin/i, 'Right-Arm Off-Spin'],
  [/left[\s-]*arm\s+off[\s-]*spin/i, 'Left-Arm Off-Spin'],
  [/right[\s-]*arm\s+leg[\s-]*spin/i, 'Right-Arm Leg-Spin'],
  [/left[\s-]*arm\s+leg[\s-]*spin/i, 'Left-Arm Leg-Spin'],
];

function normalizeBowlingStyle(raw: string): string | null {
  for (const [pattern, label] of BOWLING_ABBREVIATIONS) {
    if (pattern.test(raw)) return label;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main display formatter
// ---------------------------------------------------------------------------

/**
 * Normalize a raw role string into a clean, human-readable display label.
 *
 * Examples:
 *   "WK - Batsman (RHB)"                        → "WK-Batsman · Right-Hand Bat"
 *   "Batsman RHB"                                → "Batsman · Right-Hand Bat"
 *   "(RHB) All- Rounder Right-Arm Fast Bowler"   → "All-Rounder · Right-Hand Bat · Right-Arm Fast"
 *   "(LHB) All- Rounder Right-Arm Fast Bowler"   → "All-Rounder · Left-Hand Bat · Right-Arm Fast"
 *   "Right-Arm Spin Bowler"                      → "Bowler · Right-Arm Spin"
 *   "Right-Arm Fast Bowler"                      → "Bowler · Right-Arm Fast"
 *   "All- Rounder (RHB)"                         → "All-Rounder · Right-Hand Bat"
 */
export function formatRoleDisplay(rawRole: string | PlayerRole | undefined | null): string {
  if (!rawRole || typeof rawRole !== 'string') return 'Player';

  const input = rawRole.trim();
  if (!input) return 'Player';

  // Extract hand abbreviation (RHB / LHB) — may appear in parentheses or standalone
  let hand: string | null = null;
  const handMatch = /\(?(RHB|LHB)\)?/i.exec(input);
  if (handMatch) {
    hand = HAND_ABBREVIATIONS[handMatch[1].toUpperCase()] || null;
  }

  // Strip the hand token from the string for further parsing
  let cleaned = input.replace(/\(?(RHB|LHB)\)?/gi, '').trim();

  // Normalize stray hyphens and double spaces
  cleaned = cleaned
    .replace(/All[\s_-]*Rounder/gi, 'All-Rounder')
    .replace(/Batting[\s_-]*All[\s_-]*Rounder/gi, 'All-Rounder')
    .replace(/Bowling[\s_-]*All[\s_-]*Rounder/gi, 'All-Rounder')
    .replace(/WK[\s_-]*Batsman/gi, 'WK-Batsman')
    .replace(/Wicket[\s_-]*Keep(?:er)?[\s_-]*(?:Batsman)?/gi, 'WK-Batsman')
    .replace(/\s+/g, ' ')
    .trim();

  // Detect bowling style inside the string
  const bowlingStyle = normalizeBowlingStyle(cleaned);

  // Remove "Bowler" suffix and bowling style tokens to get the core role
  let coreRole = cleaned;
  for (const [pattern] of BOWLING_ABBREVIATIONS) {
    coreRole = coreRole.replace(pattern, '').trim();
  }
  coreRole = coreRole.replace(/Bowler/gi, '').trim();

  // If nothing meaningful remains, infer from category
  if (!coreRole || coreRole.toLowerCase() === 'player') {
    if (bowlingStyle) {
      coreRole = 'Bowler';
    } else {
      coreRole = getRoleCategory(input);
    }
  }

  // Strip trailing punctuation and hyphens
  coreRole = coreRole.replace(/[-·,]+$/, '').trim();

  // Build parts
  const parts: string[] = [coreRole];
  if (hand) parts.push(hand);
  if (bowlingStyle) parts.push(bowlingStyle);

  return parts.join(' · ');
}

/**
 * Get a short badge label (1-4 chars) for compact role display.
 */
export function getRoleBadge(role: string | undefined | null): string {
  if (!role || typeof role !== 'string') return 'BAT';
  const r = role.trim().toLowerCase();

  // Kabaddi
  if (/raider|raiding|\braid\b/.test(r)) return 'RAID';
  if (/left corner|right corner|left cover|right cover|defender|defence|defense/.test(r)) return 'DEF';

  // Volleyball
  if (/attacker|spiker/.test(r)) return 'ATK';
  if (/setter/.test(r)) return 'SET';
  if (/blocker/.test(r)) return 'BLK';
  if (/libero/.test(r)) return 'LIB';

  // Football
  if (/striker|forward|fwd|\bst\b|\bcf\b/.test(r)) return 'FWD';
  if (/midfielder|midfield|winger|\bmid\b|\bcam\b|\bcdm\b|\bcm\b/.test(r)) return 'MID';
  if (/goalkeeper|goalie|\bgk\b/.test(r)) return 'GK';

  // Basketball
  if (/point guard|\bpg\b/.test(r)) return 'PG';
  if (/shooting guard|\bsg\b/.test(r)) return 'SG';
  if (/small forward|\bsf\b/.test(r)) return 'SF';
  if (/power forward|\bpf\b/.test(r)) return 'PF';
  if (/center|\bc\b/.test(r)) return 'C';

  // Badminton
  if (/singles/.test(r)) return 'SGL';
  if (/mixed/.test(r)) return 'MIX';
  if (/doubles/.test(r)) return 'DBL';

  const category = getRoleCategory(role);
  switch (category) {
    case 'Wicket Keeper Batsman': return 'WK';
    case 'Batsman': return 'BAT';
    case 'Bowler': return 'BOWL';
    case 'All-Rounder': return 'AR';
    default: return 'BAT';
  }
}

// ---------------------------------------------------------------------------
// Structured role parser — extracts core role, batting hand, bowling style
// ---------------------------------------------------------------------------

export interface ParsedRole {
  coreRole: string;          // e.g. "Batsman", "Bowler", "All-Rounder", "WK-Batsman"
  category: AuctionRoleCategory;
  battingHand: string | null; // e.g. "Right-Hand Bat", "Left-Hand Bat"
  bowlingStyle: string | null; // e.g. "Right-Arm Fast", "Left-Arm Spin"
  badge: string;             // short badge: "BAT", "BOWL", "AR", "WK"
}

/**
 * Parse a raw role string into structured parts for rich display.
 */
export function parseRoleDetails(rawRole: string | PlayerRole | undefined): ParsedRole {
  if (!rawRole || typeof rawRole !== 'string' || !rawRole.trim()) {
    return { coreRole: 'Batsman', category: 'Batsman', battingHand: null, bowlingStyle: null, badge: 'BAT' };
  }

  const input = rawRole.trim();

  // Extract hand abbreviation (RHB / LHB)
  let battingHand: string | null = null;
  const handMatch = /\(?(RHB|LHB)\)?/i.exec(input);
  if (handMatch) {
    battingHand = HAND_ABBREVIATIONS[handMatch[1].toUpperCase()] || null;
  }

  // Strip hand token
  let cleaned = input.replace(/\(?(RHB|LHB)\)?/gi, '').trim();

  // Normalize
  cleaned = cleaned
    .replace(/All[\s-]*Rounder/gi, 'All-Rounder')
    .replace(/WK[\s-]*Batsman/gi, 'WK-Batsman')
    .replace(/Wicket[\s-]*Keep(?:er)?[\s-]*(?:Batsman)?/gi, 'WK-Batsman')
    .replace(/\s+/g, ' ')
    .trim();

  // Detect bowling style
  const bowlingStyle = normalizeBowlingStyle(cleaned);

  // Get core role
  let coreRole = cleaned;
  for (const [pattern] of BOWLING_ABBREVIATIONS) {
    coreRole = coreRole.replace(pattern, '').trim();
  }
  coreRole = coreRole.replace(/Bowler/gi, '').trim();

  if (!coreRole || coreRole.toLowerCase() === 'player') {
    if (bowlingStyle) {
      coreRole = 'Bowler';
    } else {
      coreRole = getRoleCategory(input);
    }
  }
  coreRole = coreRole.replace(/[-·,]+$/, '').trim();

  const category = getRoleCategory(input);
  const badge = getRoleBadge(input);

  return { coreRole, category, battingHand, bowlingStyle, badge };
}

/**
 * Get theme color class for role badge.
 */
export function getRoleBadgeColor(role: string | undefined | null): string {
  if (!role || typeof role !== 'string') return '#3b82f6';
  const r = role.trim().toLowerCase();

  // Kabaddi
  if (/raider|raiding|\braid\b/.test(r)) return '#ea580c';
  if (/left corner|right corner|left cover|right cover|defender|defence|defense/.test(r)) return '#6366f1';

  // Volleyball
  if (/attacker|spiker/.test(r)) return '#f97316';
  if (/setter/.test(r)) return '#06b6d4';
  if (/blocker/.test(r)) return '#8b5cf6';
  if (/libero/.test(r)) return '#10b981';

  // Football
  if (/striker|forward|fwd|\bst\b|\bcf\b/.test(r)) return '#ef4444';
  if (/midfielder|midfield|winger|\bmid\b|\bcam\b|\bcdm\b|\bcm\b/.test(r)) return '#06b6d4';
  if (/goalkeeper|goalie|\bgk\b/.test(r)) return '#f59e0b';

  // Basketball
  if (/point guard|\bpg\b/.test(r)) return '#3b82f6';
  if (/shooting guard|\bsg\b/.test(r)) return '#f59e0b';
  if (/small forward|\bsf\b/.test(r)) return '#ef4444';
  if (/power forward|\bpf\b/.test(r)) return '#8b5cf6';
  if (/center|\bc\b/.test(r)) return '#10b981';

  // Badminton
  if (/singles/.test(r)) return '#3b82f6';
  if (/mixed/.test(r)) return '#ec4899';
  if (/doubles/.test(r)) return '#10b981';

  const category = getRoleCategory(role);
  switch (category) {
    case 'Wicket Keeper Batsman': return '#8b5cf6';
    case 'Batsman': return '#3b82f6';
    case 'Bowler': return '#ef4444';
    case 'All-Rounder': return '#10b981';
    default: return '#3b82f6';
  }
}
