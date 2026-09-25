import { describe, expect, it } from 'vitest';
import { interpretCricHeroesTextEvent } from '../hooks/useCricHeroesSyncAdapter';

describe('CricHeroes commentary interpreter', () => {
  it.each([
    ['SIX!', '6'],
    ['FOUR to deep cover', '4'],
    ['WIDE down leg side', 'WD'],
    ['NO BALL, above waist', 'NB'],
    ['Batter OUT caught at mid-on', 'W'],
    ['2 runs', '2'],
    ['1 run completed', '1'],
    ['3 runs', '3'],
    ['5 runs', '5'],
  ])('interprets %s', (text, outcome) => {
    expect(interpretCricHeroesTextEvent(text)).toBe(outcome);
  });

  it('ignores commentary without a recognized ball result', () => {
    expect(interpretCricHeroesTextEvent('Drinks break')).toBeNull();
  });
});