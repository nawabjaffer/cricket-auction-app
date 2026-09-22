import type { Player } from '../types';

export interface PlayerDuplicateMatch {
  incoming: Player;
  existing: Player;
  confidence: 'high' | 'review';
  reasons: string[];
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function digits(value: unknown): string {
  return normalize(value).replace(/\D/g, '');
}

export function playerDuplicateMatch(incoming: Player, existingPlayers: Player[]): PlayerDuplicateMatch | null {
  const name = normalize(incoming.name);
  const phone = digits(incoming.phone || incoming.whatsappNumber);
  const dob = normalize(incoming.dateOfBirth);
  const place = normalize(incoming.place);
  const role = normalize(incoming.role);

  let best: PlayerDuplicateMatch | null = null;
  for (const existing of existingPlayers) {
    const existingName = normalize(existing.name);
    const existingPhone = digits(existing.phone || existing.whatsappNumber);
    const samePhone = !!phone && !!existingPhone && phone === existingPhone;
    const sameName = !!name && name === existingName;
    if (!samePhone && !sameName) continue;

    const reasons: string[] = [];
    if (samePhone) reasons.push('phone number matches');
    if (sameName) reasons.push('player name matches');
    if (dob && normalize(existing.dateOfBirth) === dob) reasons.push('date of birth matches');
    if (place && normalize(existing.place) === place) reasons.push('place matches');
    if (role && normalize(existing.role) === role) reasons.push('role matches');

    const confidence = samePhone || (sameName && reasons.length >= 2) ? 'high' : 'review';
    if (!best || (confidence === 'high' && best.confidence !== 'high') || reasons.length > best.reasons.length) {
      best = { incoming, existing, confidence, reasons };
    }
  }
  return best;
}

export function uniqueImportedPlayerId(baseId: string, usedIds: Set<string>): string {
  const base = normalize(baseId).replace(/[^a-z0-9_-]+/g, '_') || `csv_${Date.now()}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}_${suffix++}`;
  return id;
}
