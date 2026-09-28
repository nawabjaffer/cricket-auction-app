import { describe, expect, it } from 'vitest';
import {
  cricHeroesPlayerAliasKey,
  normalizeCricHeroesAliasName,
  normalizeCricHeroesMappings,
  resolveCricHeroesPlayerAlias,
} from '../utils/cricHeroesMappings';

describe('CricHeroes manual name mappings', () => {
  it('normalizes names consistently while retaining punctuation', () => {
    expect(normalizeCricHeroesAliasName('  A. Player  ')).toBe('a. player');
  });

  it('creates team-scoped keys to allow duplicate player names across teams', () => {
    expect(cricHeroesPlayerAliasKey('Sam Smith', 'team-a')).toBe('team-a::sam smith');
    const mappings = normalizeCricHeroesMappings({ playerAliases: {
      'team-a::sam smith': 'player-a',
      'team-b::sam smith': 'player-b',
    } });
    expect(resolveCricHeroesPlayerAlias(mappings, 'Sam Smith', 'team-a')).toBe('player-a');
    expect(resolveCricHeroesPlayerAlias(mappings, 'Sam Smith', 'team-b')).toBe('player-b');
  });

  it('continues to resolve unscoped aliases saved by older versions', () => {
    const mappings = normalizeCricHeroesMappings({ playerAliases: { 'sam smith': 'player-legacy' } });
    expect(resolveCricHeroesPlayerAlias(mappings, 'Sam Smith', 'team-a')).toBe('player-legacy');
  });
});
