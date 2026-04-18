// ============================================================================
// ROLE FORMATTER UTILITY
// Normalizes inconsistent player role strings into clean, readable labels
// and maps roles to canonical auction categories for ordering.
// ============================================================================

import type { PlayerRole, AuctionRoleCategory } from '../types';

// ---------------------------------------------------------------------------
// Canonical category mapping
// ---------------------------------------------------------------------------

const ROLE_TO_CATEGORY: Record<string, AuctionRoleCategory> = {
  'batsman': 'Batsman',
  'bowler': 'Bowler',
  'all-rounder': 'All-Rounder',
  'allrounder': 'All-Rounder',
  'all rounder': 'All-Rounder',
  'wicket-keeper': 'Wicket Keeper Batsman',
  'wicket keeper': 'Wicket Keeper Batsman',
  'wicket keeper batsman': 'Wicket Keeper Batsman',
  'wk-batsman': 'Wicket Keeper Batsman',
  'wk batsman': 'Wicket Keeper Batsman',
  'wk - batsman': 'Wicket Keeper Batsman',
  'keeper': 'Wicket Keeper Batsman',
  'player': 'Uncategorized',
};

/**
 * Map any raw role string to a canonical AuctionRoleCategory.
 */
export function getRoleCategory(role: string): AuctionRoleCategory {
  const key = role.trim().toLowerCase();

  // Direct match
  if (ROLE_TO_CATEGORY[key]) return ROLE_TO_CATEGORY[key];

  // Partial match heuristics
  if (/wicket[\s-]*keep/i.test(key) || /^wk/i.test(key)) return 'Wicket Keeper Batsman';
  if (/all[\s-]*round/i.test(key)) return 'All-Rounder';
  if (/bowl/i.test(key)) return 'Bowler';
  if (/bat/i.test(key)) return 'Batsman';

  return 'Uncategorized';
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
export function formatRoleDisplay(rawRole: string | PlayerRole | undefined): string {
  if (!rawRole) return 'Player';

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
    .replace(/All[\s-]*Rounder/gi, 'All-Rounder')
    .replace(/WK[\s-]*Batsman/gi, 'WK-Batsman')
    .replace(/Wicket[\s-]*Keep(?:er)?[\s-]*(?:Batsman)?/gi, 'WK-Batsman')
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
      const category = getRoleCategory(input);
      coreRole = category === 'Uncategorized' ? 'Player' : category;
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
 * Get a short badge label (1-3 chars) for compact role display.
 */
export function getRoleBadge(role: string): string {
  const category = getRoleCategory(role);
  switch (category) {
    case 'Wicket Keeper Batsman': return 'WK';
    case 'Batsman': return 'BAT';
    case 'Bowler': return 'BOWL';
    case 'All-Rounder': return 'AR';
    default: return 'PLR';
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
  if (!rawRole || !rawRole.trim()) {
    return { coreRole: 'Player', category: 'Uncategorized', battingHand: null, bowlingStyle: null, badge: 'PLR' };
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
      const category = getRoleCategory(input);
      coreRole = category === 'Uncategorized' ? 'Player' : category;
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
export function getRoleBadgeColor(role: string): string {
  const category = getRoleCategory(role);
  switch (category) {
    case 'Wicket Keeper Batsman': return '#8b5cf6';
    case 'Batsman': return '#3b82f6';
    case 'Bowler': return '#ef4444';
    case 'All-Rounder': return '#10b981';
    default: return '#6b7280';
  }
}
