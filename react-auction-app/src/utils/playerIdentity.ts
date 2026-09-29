import type { Player } from '../types';
import { normalizePlayerName } from './playerName';

type IdentityFields = Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'age' | 'phone' | 'whatsappNumber'>>;

const nameKey = (name: string) => normalizePlayerName(name).trim().toLowerCase().replace(/\s+/g, ' ');
const phoneKey = (player: IdentityFields) => String(player.phone || player.whatsappNumber || '').replace(/\D/g, '').slice(-10);

function conflicts(candidate: IdentityFields, other: IdentityFields): boolean {
  const candidateAge = typeof candidate.age === 'number' ? candidate.age : null;
  const otherAge = typeof other.age === 'number' ? other.age : null;
  if (candidateAge !== null && otherAge !== null && candidateAge !== otherAge) return true;
  const candidatePhone = phoneKey(candidate);
  const otherPhone = phoneKey(other);
  return Boolean(candidatePhone && otherPhone && candidatePhone !== otherPhone);
}

/**
 * Builds a predicate for players that already sit in the sold/unsold lists.
 * Matches by ID, or by the same name with no conflicting age/phone, so re-imported
 * or duplicated rows with a different ID cannot re-enter the auction pool.
 */
export function createPlayerBlocker(settled: IdentityFields[]): (candidate: IdentityFields) => boolean {
  const ids = new Set(settled.map(player => player.id));
  const byName = new Map<string, IdentityFields[]>();
  for (const player of settled) {
    const key = nameKey(player.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), player]);
  }
  return candidate => {
    if (ids.has(candidate.id)) return true;
    const sameName = byName.get(nameKey(candidate.name));
    return Boolean(sameName?.some(player => !conflicts(candidate, player)));
  };
}
