// ============================================================================
// KABADDI SERVICE — teams, players, matches, live raid/score state, overlay
//
// Same shape as FootballService, scoped to the tenant kabaddi namespace
// (`tenants/{id}/kabaddi`), plus raid-specific scoring helpers that apply the
// kabaddi rulebook (touch/bonus/tackle points, super raids, all-outs,
// revivals and do-or-die raids).
//
// RTDB layout (all under basePath = tenantPath('kabaddi')):
//   /teams/{teamId}                     KabaddiTeam
//   /players/{playerId}                 KabaddiPlayer
//   /matches/{matchId}/setup            KabaddiMatchSetup
//   /matches/{matchId}/live             KabaddiLiveState
//   /matches/{matchId}/overlay          KabaddiOverlayControl
//   /overlayConfig                      KabaddiOverlayConfig
// ============================================================================

import { ref, get, set, update, remove, onValue, type Database } from 'firebase/database';
import type {
  KabaddiTeam, KabaddiPlayer, KabaddiMatchSetup, KabaddiLiveState,
  KabaddiOverlayConfig, KabaddiOverlayControl, KabaddiTopPerformer,
  KabaddiMatchEvent, KabaddiEventType, KabaddiRulesConfig, KabaddiTeamState,
} from '../../types/kabaddi';
import {
  createEmptyKabaddiLiveState, createEmptyKabaddiTeamState,
  isSuperTackle, DEFAULT_KABADDI_RULES,
} from '../../types/kabaddi';

/** Result of applying a raid or tackle to the live state. */
export interface RaidResolution {
  live: KabaddiLiveState;
  events: KabaddiMatchEvent[];
  /** Celebration the overlay should play, if any. */
  celebration: 'super_raid' | 'super_tackle' | 'all_out' | 'bonus_point' | null;
}

class KabaddiService {
  private db: Database | null = null;
  private basePath = '';

  initialize(db: Database, tenantKabaddiPath: string): void {
    this.db = db;
    this.basePath = tenantKabaddiPath;
  }

  get isReady(): boolean {
    return !!this.db && !!this.basePath;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('KabaddiService not initialized');
    return this.db;
  }

  /** Firebase rejects `undefined`; strip it recursively before every write. */
  private clean<T>(value: T): T {
    if (Array.isArray(value)) return value.map(v => this.clean(v)) as T;
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

  /** RTDB drops empty arrays/objects — restore the full shape on every read. */
  private normalizeLive(raw: Partial<KabaddiLiveState> | null, matchId: string, playersPerSide = 7): KabaddiLiveState {
    const base = createEmptyKabaddiLiveState(matchId, raw?.teamAId ?? '', raw?.teamBId ?? '', playersPerSide);
    if (!raw) return base;
    const team = (t?: Partial<KabaddiTeamState>): KabaddiTeamState => ({
      ...createEmptyKabaddiTeamState(playersPerSide),
      ...(t ?? {}),
    });
    return {
      ...base,
      ...raw,
      matchId,
      teamA: team(raw.teamA),
      teamB: team(raw.teamB),
      half: raw.half ?? 'not_started',
      running: raw.running ?? false,
      clockStartedAt: raw.clockStartedAt ?? 0,
      baseElapsedSec: raw.baseElapsedSec ?? 0,
      raidNumber: raw.raidNumber ?? 0,
      raidClockStartedAt: raw.raidClockStartedAt ?? 0,
      isDoOrDie: raw.isDoOrDie ?? false,
      raidingTeamId: raw.raidingTeamId ?? null,
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  async saveTeam(team: KabaddiTeam): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/teams/${team.id}`), this.clean(team));
  }

  async getTeams(): Promise<KabaddiTeam[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/teams`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, KabaddiTeam>)
      .filter(t => !!t?.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  subscribeTeams(cb: (teams: KabaddiTeam[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/teams`), snap => {
      const val = (snap.val() as Record<string, KabaddiTeam>) ?? {};
      cb(Object.values(val).filter(t => !!t?.id).sort((a, b) => a.name.localeCompare(b.name)));
    });
  }

  async deleteTeam(teamId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/teams/${teamId}`));
    const players = await this.getPlayers();
    await Promise.all(players.filter(p => p.teamId === teamId).map(p => this.deletePlayer(p.id)));
  }

  // ── Players ────────────────────────────────────────────────────────────────

  async savePlayer(player: KabaddiPlayer): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/players/${player.id}`), this.clean(player));
  }

  async getPlayers(): Promise<KabaddiPlayer[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/players`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, KabaddiPlayer>).filter(p => !!p?.id);
  }

  subscribePlayers(cb: (players: KabaddiPlayer[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/players`), snap => {
      const val = (snap.val() as Record<string, KabaddiPlayer>) ?? {};
      cb(Object.values(val).filter(p => !!p?.id));
    });
  }

  async deletePlayer(playerId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/players/${playerId}`));
  }

  // ── Matches ────────────────────────────────────────────────────────────────

  async saveMatch(match: KabaddiMatchSetup): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${match.id}/setup`), this.clean(match));
  }

  async getMatches(): Promise<KabaddiMatchSetup[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches`));
    if (!snap.exists()) return [];
    const data = snap.val() as Record<string, { setup?: KabaddiMatchSetup }>;
    return Object.values(data)
      .map(m => m.setup)
      .filter((s): s is KabaddiMatchSetup => !!s)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getMatch(matchId: string): Promise<KabaddiMatchSetup | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches/${matchId}/setup`));
    return snap.exists() ? (snap.val() as KabaddiMatchSetup) : null;
  }

  subscribeMatch(matchId: string, cb: (m: KabaddiMatchSetup | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/setup`), snap => {
      cb(snap.exists() ? (snap.val() as KabaddiMatchSetup) : null);
    });
  }

  async updateMatchStatus(matchId: string, status: KabaddiMatchSetup['status']): Promise<void> {
    const db = this.ensureDb();
    await update(ref(db, `${this.basePath}/matches/${matchId}/setup`), { status, updatedAt: Date.now() });
  }

  async deleteMatch(matchId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/matches/${matchId}`));
  }

  // ── Live state ─────────────────────────────────────────────────────────────

  async getLive(matchId: string, playersPerSide = 7): Promise<KabaddiLiveState> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches/${matchId}/live`));
    return this.normalizeLive(snap.exists() ? (snap.val() as Partial<KabaddiLiveState>) : null, matchId, playersPerSide);
  }

  async saveLive(live: KabaddiLiveState): Promise<void> {
    const db = this.ensureDb();
    await set(
      ref(db, `${this.basePath}/matches/${live.matchId}/live`),
      this.clean({ ...live, lastUpdated: Date.now() }),
    );
  }

  subscribeLive(matchId: string, cb: (live: KabaddiLiveState | null) => void, playersPerSide = 7): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/live`), snap => {
      cb(snap.exists() ? this.normalizeLive(snap.val() as Partial<KabaddiLiveState>, matchId, playersPerSide) : null);
    });
  }

  // ── Overlay control ────────────────────────────────────────────────────────

  async triggerOverlay(matchId: string, control: KabaddiOverlayControl): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), this.clean(control));
  }

  async clearOverlay(matchId: string): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), { activeOverlay: 'none', lastUpdated: Date.now() });
  }

  subscribeOverlay(matchId: string, cb: (c: KabaddiOverlayControl | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/overlay`), snap => {
      cb(snap.exists() ? (snap.val() as KabaddiOverlayControl) : null);
    });
  }

  // ── Overlay config ─────────────────────────────────────────────────────────

  async getOverlayConfig(): Promise<KabaddiOverlayConfig | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/overlayConfig`));
    return snap.exists() ? (snap.val() as KabaddiOverlayConfig) : null;
  }

  async saveOverlayConfig(config: KabaddiOverlayConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/overlayConfig`), this.clean(config));
  }

  subscribeOverlayConfig(cb: (c: KabaddiOverlayConfig | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/overlayConfig`), snap => {
      cb(snap.exists() ? (snap.val() as KabaddiOverlayConfig) : null);
    });
  }

  // ── Rules (mirrored from Platform Admin so scorer + overlay agree) ─────────

  async getRules(): Promise<KabaddiRulesConfig> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/rules`));
    return snap.exists() ? { ...DEFAULT_KABADDI_RULES, ...(snap.val() as KabaddiRulesConfig) } : DEFAULT_KABADDI_RULES;
  }

  async saveRules(rules: KabaddiRulesConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/rules`), this.clean(rules));
  }

  subscribeRules(cb: (rules: KabaddiRulesConfig) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/rules`), snap => {
      cb(snap.exists() ? { ...DEFAULT_KABADDI_RULES, ...(snap.val() as KabaddiRulesConfig) } : DEFAULT_KABADDI_RULES);
    });
  }

  // ── Rulebook scoring ───────────────────────────────────────────────────────

  private sideOf(live: KabaddiLiveState, teamId: string): 'teamA' | 'teamB' {
    return teamId === live.teamAId ? 'teamA' : 'teamB';
  }

  private makeEvent(
    live: KabaddiLiveState, type: KabaddiEventType, teamId: string,
    points: number, extra: Partial<KabaddiMatchEvent> = {},
  ): KabaddiMatchEvent {
    const elapsed = live.baseElapsedSec + (live.running && live.clockStartedAt
      ? Math.floor((Date.now() - live.clockStartedAt) / 1000)
      : 0);
    return {
      id: `kev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      teamId,
      points,
      raidNumber: live.raidNumber,
      minute: Math.floor(elapsed / 60),
      half: live.half,
      timestamp: Date.now(),
      ...extra,
    };
  }

  /**
   * Apply an all-out when a side loses every player: the opponent banks the
   * configured bonus points and the emptied side is fully revived.
   */
  private applyAllOut(
    live: KabaddiLiveState, emptiedSide: 'teamA' | 'teamB', rules: KabaddiRulesConfig,
  ): { live: KabaddiLiveState; event: KabaddiMatchEvent } {
    const otherSide = emptiedSide === 'teamA' ? 'teamB' : 'teamA';
    const otherTeamId = otherSide === 'teamA' ? live.teamAId : live.teamBId;
    const next: KabaddiLiveState = {
      ...live,
      [emptiedSide]: {
        ...live[emptiedSide],
        playersOnCourt: rules.playersPerSide,
        allOutsConceded: live[emptiedSide].allOutsConceded + 1,
      },
      [otherSide]: {
        ...live[otherSide],
        score: live[otherSide].score + rules.allOutBonusPoints,
        allOutsInflicted: live[otherSide].allOutsInflicted + 1,
      },
    };
    return { live: next, event: this.makeEvent(next, 'all_out', otherTeamId, rules.allOutBonusPoints) };
  }

  /**
   * Resolve a completed raid.
   *
   * `touches` — defenders tagged, `bonus` — bonus line crossed,
   * `raiderOut` — the defence tackled the raider.
   */
  resolveRaid(
    live: KabaddiLiveState,
    input: {
      raidingTeamId: string;
      touches: number;
      bonus: boolean;
      raiderOut: boolean;
      raiderId?: string;
      raiderName?: string;
      tacklerIds?: string[];
      tacklerNames?: string[];
    },
    rules: KabaddiRulesConfig = DEFAULT_KABADDI_RULES,
  ): RaidResolution {
    const raidSide = this.sideOf(live, input.raidingTeamId);
    const defSide = raidSide === 'teamA' ? 'teamB' : 'teamA';
    const defTeamId = defSide === 'teamA' ? live.teamAId : live.teamBId;

    const events: KabaddiMatchEvent[] = [];
    let celebration: RaidResolution['celebration'] = null;

    let next: KabaddiLiveState = { ...live, raidNumber: live.raidNumber + 1 };

    const touches = Math.max(0, input.touches);
    const bonusAwarded = input.bonus && rules.bonusLineEnabled
      && next[defSide].playersOnCourt >= rules.bonusMinDefenders;
    const raidPoints = touches + (bonusAwarded ? 1 : 0);

    if (raidPoints > 0) {
      // Raider banks points; every tagged defender leaves the mat.
      next = {
        ...next,
        [raidSide]: {
          ...next[raidSide],
          score: next[raidSide].score + raidPoints,
          totalRaidPoints: next[raidSide].totalRaidPoints + touches,
          totalBonusPoints: next[raidSide].totalBonusPoints + (bonusAwarded ? 1 : 0),
          consecutiveEmptyRaids: 0,
          // Tagged defenders revive one team-mate each.
          playersOnCourt: Math.min(rules.playersPerSide, next[raidSide].playersOnCourt + touches),
        },
        [defSide]: {
          ...next[defSide],
          playersOnCourt: Math.max(0, next[defSide].playersOnCourt - touches),
        },
      };

      if (touches > 0) {
        events.push(this.makeEvent(next, 'touch_point', input.raidingTeamId, touches, {
          playerId: input.raiderId, playerName: input.raiderName,
        }));
      }
      if (bonusAwarded) {
        events.push(this.makeEvent(next, 'bonus_point', input.raidingTeamId, 1, {
          playerId: input.raiderId, playerName: input.raiderName,
        }));
        celebration = 'bonus_point';
      }
      if (raidPoints >= rules.superRaidPoints) {
        events.push(this.makeEvent(next, 'super_raid', input.raidingTeamId, 0, {
          playerId: input.raiderId, playerName: input.raiderName,
        }));
        celebration = 'super_raid';
      }
    } else if (input.raiderOut) {
      // Defence stops the raider — super tackle when the line is thin.
      const superTackle = isSuperTackle(next[defSide].playersOnCourt, rules);
      const points = superTackle ? rules.superTacklePoints : 1;
      next = {
        ...next,
        [defSide]: {
          ...next[defSide],
          score: next[defSide].score + points,
          totalTacklePoints: next[defSide].totalTacklePoints + points,
          playersOnCourt: Math.min(rules.playersPerSide, next[defSide].playersOnCourt + 1),
        },
        [raidSide]: {
          ...next[raidSide],
          playersOnCourt: Math.max(0, next[raidSide].playersOnCourt - 1),
          consecutiveEmptyRaids: 0,
        },
      };
      events.push(this.makeEvent(next, superTackle ? 'super_tackle' : 'tackle_point', defTeamId, points, {
        opponentIds: input.raiderId ? [input.raiderId] : undefined,
        opponentNames: input.raiderName ? [input.raiderName] : undefined,
        playerId: input.tacklerIds?.[0],
        playerName: input.tacklerNames?.[0],
      }));
      if (superTackle) celebration = 'super_tackle';
    } else {
      // Empty raid — counts toward do-or-die.
      const empties = next[raidSide].consecutiveEmptyRaids + 1;
      next = {
        ...next,
        [raidSide]: { ...next[raidSide], consecutiveEmptyRaids: empties },
      };
      events.push(this.makeEvent(next, 'empty_raid', input.raidingTeamId, 0, {
        playerId: input.raiderId, playerName: input.raiderName,
      }));
    }

    // All-out check for whichever side was emptied.
    for (const side of ['teamA', 'teamB'] as const) {
      if (next[side].playersOnCourt <= 0) {
        const res = this.applyAllOut(next, side, rules);
        next = res.live;
        events.push(res.event);
        celebration = 'all_out';
      }
    }

    // Hand the raid over and flag the next do-or-die.
    const nextRaidingTeamId = defTeamId;
    const nextSide = this.sideOf(next, nextRaidingTeamId);
    next = {
      ...next,
      raidingTeamId: nextRaidingTeamId,
      raiderId: undefined,
      raiderName: undefined,
      raidClockStartedAt: 0,
      isDoOrDie: rules.doOrDieEnabled
        && next[nextSide].consecutiveEmptyRaids >= rules.doOrDieAfterEmptyRaids,
      events: [...next.events, ...events].slice(-200),
      lastUpdated: Date.now(),
    };

    return { live: next, events, celebration };
  }

  // ── Aggregations (stats dock) ──────────────────────────────────────────────

  async getTopPerformers(limit = 10): Promise<KabaddiTopPerformer[]> {
    const [players, teams] = await Promise.all([this.getPlayers(), this.getTeams()]);
    const teamMap = new Map(teams.map(t => [t.id, t]));
    return players
      .map((p): KabaddiTopPerformer => {
        const team = teamMap.get(p.teamId);
        const raid = p.raidPoints ?? 0;
        const tackle = p.tacklePoints ?? 0;
        return {
          playerId: p.id,
          playerName: p.name,
          photoUrl: p.photoUrl,
          teamId: p.teamId,
          teamName: team?.name ?? '',
          teamLogoUrl: team?.logoUrl,
          raidPoints: raid,
          tacklePoints: tackle,
          totalPoints: p.totalPoints ?? raid + tackle,
          appearances: p.appearances ?? 0,
          rating: p.rating,
        };
      })
      .filter(s => s.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints || b.raidPoints - a.raidPoints)
      .slice(0, limit);
  }

  async incrementPlayerStat(
    playerId: string,
    field: 'raidPoints' | 'tacklePoints' | 'superRaids' | 'superTackles' | 'greenCards' | 'yellowCards' | 'redCards',
    delta = 1,
  ): Promise<void> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/players/${playerId}`));
    if (!snap.exists()) return;
    const player = snap.val() as KabaddiPlayer;
    const next = Math.max(0, (player[field] ?? 0) + delta);
    const raid = field === 'raidPoints' ? next : player.raidPoints ?? 0;
    const tackle = field === 'tacklePoints' ? next : player.tacklePoints ?? 0;
    await update(ref(db, `${this.basePath}/players/${playerId}`), {
      [field]: next,
      totalPoints: raid + tackle,
      updatedAt: Date.now(),
    });
  }
}

export const kabaddiService = new KabaddiService();
