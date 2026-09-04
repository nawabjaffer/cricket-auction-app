// ============================================================================
// FOOTBALL ROLE HELPERS (auction screen)
//
// Detects football positions and roles from player records and maps them
// to badge categories, display labels, and theme styling.
// ============================================================================

export type FootballAuctionRole = 'Forward' | 'Midfielder' | 'Defender' | 'Goalkeeper';

/**
 * Map a raw roster role to a football role, or null when not a football role.
 */
export function getFootballRoleCategory(role: string | undefined | null): FootballAuctionRole | null {
  if (!role || typeof role !== 'string') return null;
  const key = role.trim().toLowerCase();
  if (!key) return null;

  // Ignore cricket and kabaddi role terms
  if (/wicket|batting|bowling|\bbat\b|\bbowl\b|\ball[\s_-]*round/.test(key)) {
    return null;
  }
  if (/raider|raiding|\braid\b|bonus|baulk/.test(key)) {
    return null;
  }

  if (/\b(gk|goalkeeper|goal[\s_-]*keeper|goalie)\b/.test(key)) {
    return 'Goalkeeper';
  }
  if (/\b(defender|defence|defense|centre[\s_-]*back|center[\s_-]*back|cb|full[\s_-]*back|left[\s_-]*back|right[\s_-]*back|lb|rb|wing[\s_-]*back|lwb|rwb|sweeper)\b/.test(key)) {
    return 'Defender';
  }
  if (/\b(midfielder|midfield|central[\s_-]*mid|attacking[\s_-]*mid|cam|defensive[\s_-]*mid|cdm|winger|left[\s_-]*wing|right[\s_-]*wing|lw|rw|left[\s_-]*mid|right[\s_-]*mid|lm|rm)\b/.test(key)) {
    return 'Midfielder';
  }
  if (/\b(forward|striker|center[\s_-]*forward|centre[\s_-]*forward|cf|attacker|second[\s_-]*striker|fwd)\b/.test(key)) {
    return 'Forward';
  }

  return null;
}

export function isFootballRole(role: string | undefined | null): boolean {
  return getFootballRoleCategory(role) !== null;
}

export function getFootballRoleLabel(role: string | undefined | null): string | null {
  return getFootballRoleCategory(role);
}

export function getFootballRoleBadgeClass(role: string | undefined | null): string | null {
  switch (getFootballRoleCategory(role)) {
    case 'Forward': return 'role-forward';
    case 'Midfielder': return 'role-midfielder';
    case 'Defender': return 'role-football-defender';
    case 'Goalkeeper': return 'role-goalkeeper';
    default: return null;
  }
}
