// ============================================================================
// CRICHEROES ADAPTER — Stub for CricHeroes scoring API integration
// Ready for API key configuration. Falls back to manual when unconfigured.
// ============================================================================

import type { IScoringAdapter, MatchScore, PlayerMatchStats, LiveScore } from '../../types/scoring';

interface CricHeroesConfig {
  apiKey?: string;
  baseUrl?: string;
  pollIntervalMs?: number;
}

export class CricHeroesAdapter implements IScoringAdapter {
  readonly provider = 'cricheroes' as const;

  private apiKey: string;
  private baseUrl: string;
  private pollIntervalMs: number;

  constructor(config: CricHeroesConfig = {}) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.cricheroes.com/v1';
    this.pollIntervalMs = config.pollIntervalMs || 30000;
  }

  async fetchMatchScore(externalMatchId: string): Promise<MatchScore> {
    if (!this.isConfigured()) {
      throw new Error('CricHeroes API key not configured');
    }
    // Future: GET {baseUrl}/matches/{externalMatchId}/scorecard
    // Transform CricHeroes response → MatchScore
    throw new Error(`CricHeroes fetchMatchScore not yet implemented for match ${externalMatchId}`);
  }

  async fetchPlayerMatchStats(externalMatchId: string, _playerId: string): Promise<PlayerMatchStats> {
    if (!this.isConfigured()) {
      throw new Error('CricHeroes API key not configured');
    }
    throw new Error(`CricHeroes fetchPlayerMatchStats not yet implemented for match ${externalMatchId}`);
  }

  syncLiveScore(externalMatchId: string, callback: (score: LiveScore) => void): () => void {
    if (!this.isConfigured()) {
      console.warn('[CricHeroes] Not configured — live sync not available');
      return () => {};
    }

    // Poll the CricHeroes API at configured interval
    const interval = setInterval(async () => {
      try {
        // Future: const response = await fetch(`${this.baseUrl}/matches/${externalMatchId}/live`, {
        //   headers: { 'Authorization': `Bearer ${this.apiKey}` }
        // });
        // const data = await response.json();
        // callback(transformToLiveScore(data));
        console.debug(`[CricHeroes] Would poll match ${externalMatchId}`);
      } catch (err) {
        console.error('[CricHeroes] Live score fetch failed:', err);
      }
    }, this.pollIntervalMs);

    return () => clearInterval(interval);
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getProviderName(): string {
    return 'CricHeroes';
  }

  /** Update API key at runtime (from admin config) */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /** Update base URL at runtime */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }
}
