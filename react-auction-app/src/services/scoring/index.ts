// ============================================================================
// SCORING SERVICES — Barrel Exports
// ============================================================================

export { ManualScoringAdapter } from './ManualScoringAdapter';
export type { BallInput } from './ManualScoringAdapter';
export { CricHeroesAdapter } from './CricHeroesAdapter';
export { cricHeroesReader, extractCricHeroesMatchId, isValidCricHeroesUrl } from './cricHeroesReader';
export type { CricHeroesSnapshot, CricHeroesInnings } from './cricHeroesReader';
export { ScoringService, scoringService } from './ScoringService';
export { StatsEngine, statsEngine } from './statsEngine';
export { OBSReplayService, obsReplayService } from './obsReplayService';
export type { IScoringAdapter, ScoringProvider } from './ScoringAdapter';
