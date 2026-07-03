// ============================================================================
// FOOTBALL SERVICE — teams, players, matches, live timer/score, overlay config
// Singleton mirroring ScoringService. Initialize once with the Firebase db and
// the tenant football path (`tenants/{id}/football`).
//
// RTDB layout (all under basePath = tenantPath('football')):
//   /teams/{teamId}                     FootballTeam
//   /players/{playerId}                 FootballPlayer
//   /matches/{matchId}/setup            FootballMatchSetup
//   /matches/{matchId}/live             FootballLiveState
//   /matches/{matchId}/overlay          FootballOverlayControl
//   /overlayConfig                      FootballOverlayConfig
// ============================================================================

import { ref, get, set, update, onValue, remove, type Database } from 'firebase/database';
import type {
  FootballTeam, FootballPlayer, FootballMatchSetup, FootballLiveState,
  FootballOverlayConfig, FootballOverlayControl,
  FootballTopScorer,
} from '../../types/football';
import { createEmptyFootballLiveState } from '../../types/football';

class FootballService {
  private db: Database | null = null;
  private basePath = '';

  initialize(db: Database, tenantFootballPath: string): void {
    this.db = db;
    this.basePath = tenantFootballPath;
  }

  get isReady(): boolean {
    return !!this.db && !!this.basePath;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('FootballService not initialized');
    return this.db;
  }

  /** Firebase rejects `undefined`; strip it recursively before every write. */
  private clean<T>(value: T): T {
    if (Array.isArray(value)) return value.map((v) => this.clean(v)) as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue;
        out[k] = this.clean(v);
      }
      return out as T;
    }
    return value;
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  async saveTeam(team: FootballTeam): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/teams/${team.id}`), this.clean(team));
  }

  async getTeams(): Promise<FootballTeam[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/teams`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, FootballTeam>)
      .filter((t) => !!t && !!t.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  subscribeTeams(cb: (teams: FootballTeam[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/teams`), (snap) => {
      const val = (snap.val() as Record<string, FootballTeam>) ?? {};
      cb(Object.values(val).filter((t) => !!t && !!t.id).sort((a, b) => a.name.localeCompare(b.name)));
    });
  }

  async deleteTeam(teamId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/teams/${teamId}`));
    // Cascade: remove that team's players
    const players = await this.getPlayers();
    await Promise.all(
      players.filter((p) => p.teamId === teamId).map((p) => this.deletePlayer(p.id)),
    );
  }

  // ── Players ────────────────────────────────────────────────────────────────

  async savePlayer(player: FootballPlayer): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/players/${player.id}`), this.clean(player));
  }

  async getPlayers(): Promise<FootballPlayer[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/players`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, FootballPlayer>).filter((p) => !!p && !!p.id);
  }

  subscribePlayers(cb: (players: FootballPlayer[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/players`), (snap) => {
      const val = (snap.val() as Record<string, FootballPlayer>) ?? {};
      cb(Object.values(val).filter((p) => !!p && !!p.id));
    });
  }

  async deletePlayer(playerId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/players/${playerId}`));
  }

  // ── Matches ──────────────────────────────────────────────────────────────

  async saveMatch(match: FootballMatchSetup): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${match.id}/setup`), this.clean(match));
  }

  async getMatches(): Promise<FootballMatchSetup[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches`));
    if (!snap.exists()) return [];
    const data = snap.val() as Record<string, { setup?: FootballMatchSetup }>;
    return Object.values(data)
      .map((m) => m.setup)
      .filter((s): s is FootballMatchSetup => !!s)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getMatch(matchId: string): Promise<FootballMatchSetup | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches/${matchId}/setup`));
    return snap.exists() ? (snap.val() as FootballMatchSetup) : null;
  }

  subscribeMatch(matchId: string, cb: (m: FootballMatchSetup | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/setup`), (snap) => {
      cb(snap.exists() ? (snap.val() as FootballMatchSetup) : null);
    });
  }

  async updateMatchStatus(matchId: string, status: FootballMatchSetup['status']): Promise<void> {
    const db = this.ensureDb();
    await update(ref(db, `${this.basePath}/matches/${matchId}/setup`), { status, updatedAt: Date.now() });
  }

  async deleteMatch(matchId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/matches/${matchId}`));
  }

  // ── Live state (timer + score) ─────────────────────────────────────────────

  async getLive(matchId: string): Promise<FootballLiveState> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches/${matchId}/live`));
    return snap.exists() ? (snap.val() as FootballLiveState) : createEmptyFootballLiveState(matchId);
  }

  async saveLive(live: FootballLiveState): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${live.matchId}/live`), this.clean({ ...live, lastUpdated: Date.now() }));
  }

  subscribeLive(matchId: string, cb: (live: FootballLiveState | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/live`), (snap) => {
      cb(snap.exists() ? (snap.val() as FootballLiveState) : null);
    });
  }

  // ── Overlay control (celebration triggers) ─────────────────────────────────

  async triggerOverlay(matchId: string, control: FootballOverlayControl): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), this.clean(control));
  }

  async clearOverlay(matchId: string): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), { activeOverlay: 'none', lastUpdated: Date.now() });
  }

  subscribeOverlay(matchId: string, cb: (c: FootballOverlayControl | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/overlay`), (snap) => {
      cb(snap.exists() ? (snap.val() as FootballOverlayControl) : null);
    });
  }

  // ── Overlay config (branding / theme) ──────────────────────────────────────

  async getOverlayConfig(): Promise<FootballOverlayConfig | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/overlayConfig`));
    return snap.exists() ? (snap.val() as FootballOverlayConfig) : null;
  }

  async saveOverlayConfig(config: FootballOverlayConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/overlayConfig`), this.clean(config));
  }

  subscribeOverlayConfig(cb: (c: FootballOverlayConfig | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/overlayConfig`), (snap) => {
      cb(snap.exists() ? (snap.val() as FootballOverlayConfig) : null);
    });
  }

  // ── Aggregations (for the stats dock) ──────────────────────────────────────

  /** Top scorers computed from persisted per-player season stats. */
  async getTopScorers(limit = 10): Promise<FootballTopScorer[]> {
    const [players, teams] = await Promise.all([this.getPlayers(), this.getTeams()]);
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    return players
      .map((p): FootballTopScorer => {
        const team = teamMap.get(p.teamId);
        return {
          playerId: p.id,
          playerName: p.name,
          photoUrl: p.photoUrl,
          teamId: p.teamId,
          teamName: team?.name ?? '',
          teamLogoUrl: team?.logoUrl,
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
          appearances: p.appearances ?? 0,
          rating: p.rating,
        };
      })
      .filter((s) => s.goals > 0 || s.assists > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, limit);
  }

  /** Add a scored goal to a player's season tally (used when a goal event fires). */
  async incrementPlayerStat(playerId: string, field: 'goals' | 'assists' | 'yellowCards' | 'redCards', delta = 1): Promise<void> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/players/${playerId}`));
    if (!snap.exists()) return;
    const player = snap.val() as FootballPlayer;
    const next = Math.max(0, (player[field] ?? 0) + delta);
    await update(ref(db, `${this.basePath}/players/${playerId}`), { [field]: next, updatedAt: Date.now() });
  }
}

export const footballService = new FootballService();
