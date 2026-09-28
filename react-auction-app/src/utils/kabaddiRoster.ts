import type { Player, Team } from '../types';
import type { KabaddiMatchSetup, KabaddiPlayer } from '../types/kabaddi';

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function roleForAuctionPlayer(role?: string): Pick<KabaddiPlayer, 'position' | 'defenderRole'> {
  const normalizedRole = role?.toLowerCase() || '';
  if (normalizedRole.includes('raider') || normalizedRole.includes('attacker')) return { position: 'RAIDER' };
  if (normalizedRole.includes('defend') || normalizedRole.includes('corner')) return { position: 'DEFENDER', defenderRole: 'left_corner' };
  return { position: 'ALL_ROUNDER' };
}

/** Adds captain/icon players assigned in Auction Admin to each Kabaddi match roster. */
export function mergeIconicKabaddiPlayers(
  roster: KabaddiPlayer[], auctionTeams: Team[], auctionPlayers: Player[], match: KabaddiMatchSetup | null,
): KabaddiPlayer[] {
  if (!match) return roster;
  const result = [...roster];
  auctionTeams.forEach(team => {
    const matchTeam = [match.teamA, match.teamB].find(candidate =>
      candidate.id === team.id || normalizeName(candidate.name) === normalizeName(team.name));
    if (!matchTeam) return;
    const iconicNames = team.iconicPlayers?.length ? team.iconicPlayers : team.captain ? [team.captain] : [];
    iconicNames.forEach(iconicName => {
      const existingIndex = result.findIndex(player =>
        player.teamId === matchTeam.id && normalizeName(player.name) === normalizeName(iconicName));
      const source = auctionPlayers.find(player => normalizeName(player.name) === normalizeName(iconicName));
      const role = roleForAuctionPlayer(source?.role);
      const photoUrl = source?.processedImageUrl || source?.imageUrl || undefined;
      if (existingIndex >= 0) {
        const existing = result[existingIndex];
        result[existingIndex] = {
          ...existing,
          photoUrl: existing.photoUrl || photoUrl,
          isCaptain: true,
          sourcePlayerId: existing.sourcePlayerId || source?.id,
        };
        return;
      }
      const id = source?.id || `iconic-${matchTeam.id}-${normalizeName(iconicName).replace(/[^a-z0-9]+/g, '-')}`;
      result.push({
        id,
        teamId: matchTeam.id,
        name: source?.name || iconicName,
        photoUrl,
        ...role,
        isCaptain: true,
        isStarter: true,
        sourcePlayerId: source?.id,
        createdAt: source ? Date.now() : 0,
        updatedAt: source ? Date.now() : 0,
      });
    });
  });
  return result;
}