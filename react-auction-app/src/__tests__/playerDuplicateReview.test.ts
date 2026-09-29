import { describe, expect, it } from 'vitest';
import type { Player } from '../types';
import { playerDuplicateMatch, playerDuplicateMatchById } from '../utils/playerDuplicateReview';

const player = (overrides: Partial<Player> = {}): Player => ({
  id: 'player-1',
  name: 'Alex Player',
  imageUrl: '',
  role: 'Player',
  age: 24,
  matches: '0',
  runs: '0',
  wickets: '0',
  battingBestFigures: 'N/A',
  bowlingBestFigures: 'N/A',
  basePrice: 0,
  ...overrides,
});

describe('playerDuplicateMatch', () => {
  it('uses matching age and team to strengthen a same-name candidate', () => {
    const match = playerDuplicateMatch(player(), [player({ id: 'existing' })], {
      incomingTeam: { id: 'team-a', name: 'Wolves' },
      getExistingTeam: () => ({ id: 'team-a', name: 'Wolves' }),
    });
    expect(match?.existing.id).toBe('existing');
    expect(match?.confidence).toBe('high');
    expect(match?.reasons).toContain('age matches');
    expect(match?.reasons).toContain('team matches (Wolves)');
  });

  it('keeps same-name players with different ages in manual review', () => {
    const match = playerDuplicateMatch(player(), [player({ id: 'existing', age: 31 })], {
      incomingTeam: { id: 'team-a', name: 'Wolves' },
      getExistingTeam: () => ({ id: 'team-a', name: 'Wolves' }),
    });
    expect(match?.confidence).toBe('review');
    expect(match?.reasons).toContain('age differs (24 vs 31)');
  });

  it('keeps a player on another team in manual review rather than linking automatically', () => {
    const match = playerDuplicateMatch(player(), [player({ id: 'existing' })], {
      incomingTeam: { id: 'team-a', name: 'Wolves' },
      getExistingTeam: () => ({ id: 'team-b', name: 'Titans' }),
    });
    expect(match?.confidence).toBe('review');
    expect(match?.reasons).toContain('team differs (Wolves vs Titans)');
  });

  it('matches duplicate-name bulk-edit rows by their exported ID', () => {
    const first = player({ id: 'player-a', age: 24 });
    const second = player({ id: 'player-b', age: 31 });
    const incoming = player({ id: 'player-b', age: 32 });

    expect(playerDuplicateMatchById(incoming, [first, second])?.existing.id).toBe('player-b');
    expect(playerDuplicateMatch(incoming, [first, second])?.existing.id).toBe('player-a');
  });
});
