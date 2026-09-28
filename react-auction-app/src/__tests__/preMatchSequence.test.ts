import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN } from '../types/matchSquadOverlay';
import { buildPreMatchSequence } from '../utils/preMatchSequence';

describe('buildPreMatchSequence', () => {
  it('uses configured phase visibility and cumulative durations', () => {
    const design = {
      ...DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN,
      squadDisplayDurationMs: 2000,
      tossAnimationDurationMs: 3000,
      tossResultDurationMs: 1500,
      delayAfterTossMs: 500,
      showSquadReveal: false,
      showImpactPlayers: false,
    };
    expect(buildPreMatchSequence(design, { hasToss: true, hasImpactPlayers: true })).toEqual([
      { phase: 'squad_display', atMs: 0 },
      { phase: 'toss_animation', atMs: 2000 },
      { phase: 'toss_result', atMs: 5000 },
      { phase: 'match_ready', atMs: 7000 },
    ]);
  });

  it('holds each full team lineup for the configured duration after the reveal', () => {
    const design = {
      ...DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN,
      squadRevealDurationMs: 2000,
      squadRevealHoldDurationMs: 5000,
    };
    const sequence = buildPreMatchSequence(design, {
      hasToss: false,
      hasImpactPlayers: true,
      playerCount: 11,
      playerRevealIntervalMs: 600,
    });
    expect(sequence.find(step => step.phase === 'squad_reveal_teamB')?.atMs).toBe(19600);
    expect(sequence.find(step => step.phase === 'impact_players')?.atMs).toBe(31200);
    expect(sequence.some(step => step.phase === 'impact_players')).toBe(true);
  });
});