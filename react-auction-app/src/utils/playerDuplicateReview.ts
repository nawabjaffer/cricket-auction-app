import type { Player } from '../types';

export interface PlayerDuplicateMatch {
  incoming: Player;
  existing: Player;
  confidence: 'high' | 'review';
  reasons: string[];
}

export interface PlayerDuplicateTeam {
  id?: string;
  name?: string;
}

export interface PlayerDuplicateMatchContext {
  incomingTeam?: PlayerDuplicateTeam;
  getExistingTeam?: (player: Player) => PlayerDuplicateTeam | undefined;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function digits(value: unknown): string {
  return normalize(value).replace(/\D/g, '');
}

export function playerDuplicateMatch(
  incoming: Player,
  existingPlayers: Player[],
  context: PlayerDuplicateMatchContext = {},
): PlayerDuplicateMatch | null {
  const name = normalize(incoming.name);
  const phone = digits(incoming.phone || incoming.whatsappNumber);
  const dob = normalize(incoming.dateOfBirth);
  const place = normalize(incoming.place);
  const role = normalize(incoming.role);
  const incomingAge = Number.isFinite(incoming.age) && incoming.age !== null ? incoming.age : null;

  let best: PlayerDuplicateMatch | null = null;
  for (const existing of existingPlayers) {
    const existingName = normalize(existing.name);
    const existingPhone = digits(existing.phone || existing.whatsappNumber);
    const samePhone = !!phone && !!existingPhone && phone === existingPhone;
    const sameName = !!name && name === existingName;
    if (!samePhone && !sameName) continue;

    const reasons: string[] = [];
    let ageConflict = false;
    let teamConflict = false;
    if (samePhone) reasons.push('phone number matches');
    if (sameName) reasons.push('player name matches');
    const existingAge = Number.isFinite(existing.age) && existing.age !== null ? existing.age : null;
    if (incomingAge !== null && existingAge !== null) {
      if (incomingAge === existingAge) reasons.push('age matches');
      else {
        ageConflict = true;
        reasons.push(`age differs (${incomingAge} vs ${existingAge})`);
      }
    }
    const existingTeam = context.getExistingTeam?.(existing);
    const incomingTeam = context.incomingTeam;
    if (incomingTeam && existingTeam) {
      const incomingTeamId = normalize(incomingTeam.id);
      const existingTeamId = normalize(existingTeam.id);
      const sameTeam = incomingTeamId && existingTeamId
        ? incomingTeamId === existingTeamId
        : normalize(incomingTeam.name) !== '' && normalize(incomingTeam.name) === normalize(existingTeam.name);
      if (sameTeam) reasons.push(`team matches${incomingTeam.name ? ` (${incomingTeam.name})` : ''}`);
      else {
        teamConflict = true;
        reasons.push(`team differs (${incomingTeam.name || incomingTeam.id} vs ${existingTeam.name || existingTeam.id})`);
      }
    }
    if (dob && normalize(existing.dateOfBirth) === dob) reasons.push('date of birth matches');
    if (place && normalize(existing.place) === place) reasons.push('place matches');
    if (role && normalize(existing.role) === role) reasons.push('role matches');

    const confidence = !ageConflict && !teamConflict && (samePhone || (sameName && reasons.length >= 2))
      ? 'high'
      : 'review';
    if (!best || (confidence === 'high' && best.confidence !== 'high') || reasons.length > best.reasons.length) {
      best = { incoming, existing, confidence, reasons };
    }
  }
  return best;
}

export function playerDuplicateMatchById(
  incoming: Player,
  existingPlayers: Player[],
  context: PlayerDuplicateMatchContext = {},
): PlayerDuplicateMatch | null {
  const incomingId = normalize(incoming.id);
  if (!incomingId) return playerDuplicateMatch(incoming, existingPlayers, context);
  const existing = existingPlayers.find(player => normalize(player.id) === incomingId);
  if (existing) {
    return { incoming, existing, confidence: 'high', reasons: ['player ID matches'] };
  }
  return playerDuplicateMatch(incoming, existingPlayers, context);
}

export function uniqueImportedPlayerId(baseId: string, usedIds: Set<string>): string {
  const base = normalize(baseId).replace(/[^a-z0-9_-]+/g, '_') || `csv_${Date.now()}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}_${suffix++}`;
  return id;
}
