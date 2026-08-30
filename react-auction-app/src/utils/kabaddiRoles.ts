// ============================================================================
// KABADDI ROLE HELPERS (auction screen)
//
// The auction screen is shared across sports. Kabaddi squads use a different
// role vocabulary — Raider / Defender / All-Rounder, with defenders further
// split into corners and covers — so these helpers detect those roles from the
// raw roster string and let the existing auction UI badge and icon them
// correctly without a separate screen.
// ============================================================================

export type KabaddiAuctionRole = 'Raider' | 'Defender' | 'All-Rounder';

/** Court positions that imply a defender. */
const DEFENDER_HINTS = [
  'defender', 'defence', 'defense',
  'left corner', 'right corner', 'corner',
  'left cover', 'right cover', 'cover',
  'left in', 'right in',
];

/**
 * Map a raw roster role to a kabaddi role, or null when the string is not a
 * kabaddi role (so cricket handling stays untouched).
 *
 * Note: a bare "All-Rounder" is shared with cricket and intentionally does NOT
 * match here — only explicitly kabaddi-flavoured all-rounders do.
 */
export function getKabaddiRoleCategory(role: string | undefined | null): KabaddiAuctionRole | null {
  if (!role || typeof role !== 'string') return null;
  const key = role.trim().toLowerCase();
  if (!key) return null;

  const mentionsKabaddi = key.includes('kabaddi');
  const isAllRounder = /all[\s_-]*round/.test(key);

  if (/raider|raiding|\braid\b/.test(key)) {
    return isAllRounder ? 'All-Rounder' : 'Raider';
  }
  if (DEFENDER_HINTS.some(h => key.includes(h))) {
    return isAllRounder ? 'All-Rounder' : 'Defender';
  }
  if (mentionsKabaddi && isAllRounder) return 'All-Rounder';

  return null;
}

export function isKabaddiRole(role: string | undefined | null): boolean {
  return getKabaddiRoleCategory(role) !== null;
}

/** Short label shown on auction badges. */
export function getKabaddiRoleLabel(role: string | undefined | null): string | null {
  return getKabaddiRoleCategory(role);
}

/** Badge colour class, matching the auction role-badge convention. */
export function getKabaddiRoleBadgeClass(role: string | undefined | null): string | null {
  switch (getKabaddiRoleCategory(role)) {
    case 'Raider': return 'role-raider';
    case 'Defender': return 'role-defender';
    case 'All-Rounder': return 'role-allrounder';
    default: return null;
  }
}
