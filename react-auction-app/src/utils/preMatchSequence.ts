import type { MatchSquadOverlayDesign } from '../types/matchSquadOverlay';
import type { PreMatchPhase } from '../types/scoring';

export interface PreMatchSequenceStep {
  phase: PreMatchPhase;
  atMs: number;
}

export function buildPreMatchSequence(
  design: MatchSquadOverlayDesign,
  options: { hasToss: boolean; hasImpactPlayers: boolean; playerCount?: number; playerRevealIntervalMs?: number },
): PreMatchSequenceStep[] {
  const phases: Array<{ phase: PreMatchPhase; durationMs: number }> = [];
  if (design.showSquadDisplay) phases.push({ phase: 'squad_display', durationMs: design.squadDisplayDurationMs });
  if (options.hasToss) {
    if (design.showTossAnimation) phases.push({ phase: 'toss_animation', durationMs: design.tossAnimationDurationMs });
    if (design.showTossResult) phases.push({ phase: 'toss_result', durationMs: design.tossResultDurationMs + design.delayAfterTossMs });
  }
  if (design.showSquadReveal) {
    const revealDuration = Math.max(
      design.squadRevealDurationMs,
      options.playerRevealIntervalMs
        ? (options.playerCount || 11) * options.playerRevealIntervalMs
        : 0,
    ) + design.squadRevealHoldDurationMs;
    phases.push({ phase: 'squad_reveal_teamA', durationMs: revealDuration });
    phases.push({ phase: 'squad_reveal_teamB', durationMs: revealDuration });
  }
  if (options.hasImpactPlayers && design.showImpactPlayers) {
    phases.push({ phase: 'impact_players', durationMs: design.impactPlayersDurationMs });
  }
  if (design.showMatchReady) phases.push({ phase: 'match_ready', durationMs: design.matchReadyDurationMs });
  if (phases.length === 0) phases.push({ phase: 'match_ready', durationMs: design.matchReadyDurationMs });

  let atMs = 0;
  return phases.map(({ phase, durationMs }, index) => {
    const step = { phase, atMs };
    if (index < phases.length - 1) atMs += durationMs;
    return step;
  });
}