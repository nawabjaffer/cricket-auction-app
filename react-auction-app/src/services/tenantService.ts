// ============================================================================
// TENANT SERVICE
// CRUD + slug resolution for tournaments (tenants) stored under
// `platform/tenants`. Each tenant owns its own namespace at
// `tenants/{tenantId}/...`.
// ============================================================================

import { get, onValue, ref, set, update } from 'firebase/database';
import { realtimeSync } from './realtimeSync';
import { DEFAULT_TENANT_ID, platformPath, tenantPathFor } from './tenantPath';
import type { FootballRulesConfig } from '../types/football';
import type { KabaddiRulesConfig } from '../types/kabaddi';

export type TenantPlan = 'free' | 'basic' | 'pro' | 'enterprise';

/** Sports a tenant (tournament) has enabled. */
export type SportKey = 'cricket' | 'football' | 'kabaddi';

export const ALL_SPORTS: { key: SportKey; label: string }[] = [
  { key: 'cricket', label: 'Cricket' },
  { key: 'football', label: 'Football' },
  { key: 'kabaddi', label: 'Kabaddi' },
];

export interface TenantRecord {
  id: string;              // e.g. "epl_2026"
  slug: string;            // e.g. "epl-2026"
  name: string;            // e.g. "EPL 2026"
  plan: TenantPlan;
  isActive: boolean;
  createdAt: number;
  createdBy?: string;
  theme?: string;
  logoUrl?: string;
  // Enabled sports for this tournament (default: cricket only).
  sports?: SportKey[];
  /** Sport opened by generic scoring/admin, update, and overlay routes. */
  primarySport?: SportKey;
  // Football rules & regulations (format, timings, subs, discipline).
  // Configured from Platform Admin, consumed by the football scorer.
  footballRules?: FootballRulesConfig;
  // Kabaddi rules & regulations (format, halves, raid clock, bonus/all-out).
  kabaddiRules?: KabaddiRulesConfig;
  // Franchise branding / contact
  franchiseName?: string;
  contactEmail?: string;
  contactPhone?: string;
  // Optional Google Sheet override (per-tenant player roster source).
  // When omitted, NO sheet is fetched for this tenant — only RTDB-stored
  // admin players are used. This keeps tenants strictly isolated.
  sheetId?: string;
}

export interface ActiveSessionCleanupSummary {
  matchesScanned: number;
  matchesClosed: number;
}

const TENANT_REGISTRY_PATH = () => platformPath('tenants');

class TenantService {
  private async getDb() {
    await realtimeSync.ensureInitialized();
    return realtimeSync.getDatabase();
  }

  /** Load every registered tenant. */
  async listTenants(): Promise<TenantRecord[]> {
    const db = await this.getDb();
    if (!db) return [];
    const snap = await get(ref(db, TENANT_REGISTRY_PATH()));
    if (!snap.exists()) return [];
    const val = snap.val() as Record<string, TenantRecord>;
    return Object.values(val).filter((t) => !!t && !!t.id);
  }

  /** Look up a tenant by slug. Falls back to id lookup. */
  async resolveBySlug(slugOrId: string): Promise<TenantRecord | null> {
    if (!slugOrId) return null;
    const all = await this.listTenants();
    return all.find((t) => t.slug === slugOrId || t.id === slugOrId) ?? null;
  }

  /** Fetch a tenant by id. */
  async getTenant(id: string): Promise<TenantRecord | null> {
    const db = await this.getDb();
    if (!db) return null;
    const snap = await get(ref(db, `${TENANT_REGISTRY_PATH()}/${id}`));
    return snap.exists() ? (snap.val() as TenantRecord) : null;
  }

  async watchTenant(id: string, callback: (tenant: TenantRecord | null) => void, onError: (error: Error) => void): Promise<() => void> {
    const db = await this.getDb();
    if (!db) throw new Error('Database not initialized');
    return onValue(ref(db, `${TENANT_REGISTRY_PATH()}/${id}`), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as TenantRecord : null);
    }, onError);
  }

  /** Create a tenant. Idempotent — does NOT overwrite an existing record. */
  async createTenant(input: Omit<TenantRecord, 'createdAt' | 'isActive'> & {
    isActive?: boolean;
  }): Promise<TenantRecord> {
    const db = await this.getDb();
    if (!db) throw new Error('Database not initialized');
    const existing = await this.getTenant(input.id);
    if (existing) return existing;
    const rec: TenantRecord = {
      ...input,
      isActive: input.isActive ?? true,
      createdAt: Date.now(),
    };
    await set(ref(db, `${TENANT_REGISTRY_PATH()}/${rec.id}`), rec);
    return rec;
  }

  /** Update subset of tenant fields. */
  async updateTenant(id: string, patch: Partial<TenantRecord>): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    await update(ref(db, `${TENANT_REGISTRY_PATH()}/${id}`), patch);
  }

  /**
   * Replace a tenant's enabled sports. Uses `set` on the exact `sports` node so
   * the array is fully overwritten (avoids Firebase array-merge leftovers when
   * the new list is shorter than the old one).
   */
  async setTenantSports(id: string, sports: SportKey[], primarySport?: SportKey): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    const unique = Array.from(new Set(sports));
    const primary = primarySport && unique.includes(primarySport)
      ? primarySport
      : unique.at(-1) ?? 'cricket';
    await update(ref(db, `${TENANT_REGISTRY_PATH()}/${id}`), { sports: unique, primarySport: primary });
  }

  /** Save the football rules & regulations for a tournament. */
  async setFootballRules(id: string, rules: FootballRulesConfig): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    // Firebase rejects `undefined` — drop optional empty fields.
    const clean = Object.fromEntries(
      Object.entries(rules).filter(([, v]) => v !== undefined),
    ) as FootballRulesConfig;
    await set(ref(db, `${TENANT_REGISTRY_PATH()}/${id}/footballRules`), clean);
  }

  /** Save the kabaddi rules & regulations for a tournament. */
  async setKabaddiRules(id: string, rules: KabaddiRulesConfig): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    const clean = Object.fromEntries(
      Object.entries(rules).filter(([, v]) => v !== undefined),
    ) as KabaddiRulesConfig;
    await set(ref(db, `${TENANT_REGISTRY_PATH()}/${id}/kabaddiRules`), clean);
  }

  /**
   * Delete a tenant completely and purge its entire database tree to reclaim Firebase space.
   * Clears `platform/tenants/{id}`, `tenants/{id}`, and `tenants/{slug}`.
   */
  async deleteTenant(id: string, slug?: string): Promise<void> {
    const db = await this.getDb();
    if (!db) throw new Error('Database not initialized');
    // Remove tenant registry record
    await set(ref(db, `${TENANT_REGISTRY_PATH()}/${id}`), null);
    // Remove all data under tenants/{id} (teams, players, auctions, scoring, etc.)
    await set(ref(db, `tenants/${id}`), null);
    // Also remove tenants/{slug} if slug is different from id
    if (slug && slug !== id) {
      await set(ref(db, `tenants/${slug}`), null);
    }
  }

  /** Close live matches and remove transient broadcast/session state, preserving match results and event history. */
  async clearActiveSessionState(tenantId: string): Promise<ActiveSessionCleanupSummary> {
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant id');
    const db = await this.getDb();
    if (!db) throw new Error('Database not initialized');
    const tenantSnapshot = await get(ref(db, `${TENANT_REGISTRY_PATH()}/${tenantId}`));
    if (!tenantSnapshot.exists()) throw new Error('Tournament not found');

    const sports = [
      { key: 'scoring', hasActivePointer: true, cricket: true },
      { key: 'football', hasActivePointer: false, cricket: false },
      { key: 'kabaddi', hasActivePointer: true, cricket: false },
    ] as const;
    const matchSets = await Promise.all(sports.map(async sport => {
      const base = tenantPathFor(tenantId, sport.key);
      const [indexSnapshot, activeSnapshot] = await Promise.all([
        get(ref(db, `${base}/matchIndex`)),
        sport.hasActivePointer ? get(ref(db, `${base}/activeMatch/matchId`)) : Promise.resolve(null),
      ]);
      const ids = new Set<string>(indexSnapshot?.exists() ? Object.keys(indexSnapshot.val()) : []);
      const activeId = activeSnapshot?.exists() ? activeSnapshot.val() as string : '';
      if (activeId) ids.add(activeId);

      if (!indexSnapshot?.exists()) {
        const legacyMatches = await get(ref(db, `${base}/matches`));
        if (legacyMatches.exists()) Object.keys(legacyMatches.val()).forEach(id => ids.add(id));
      }

      const matches = await Promise.all([...ids].map(async id => {
        const setupSnapshot = await get(ref(db, `${base}/matches/${id}/setup`));
        return setupSnapshot.exists()
          ? { id, setup: setupSnapshot.val() as { status?: string } }
          : null;
      }));
      return { ...sport, base, matches: matches.filter((match): match is NonNullable<typeof match> => match !== null) };
    }));

    const now = Date.now();
    const changes: Record<string, unknown> = {};
    const auctionPaths = [
      'auction/currentState', 'auction/mobileBids', 'auction/adminCommands',
      'auction/broadcastControl', 'auction/overlayMarquee', 'auction/overlayRequest',
    ];
    for (const path of auctionPaths) changes[tenantPathFor(tenantId, path)] = null;
    changes[tenantPathFor(tenantId, 'auction/sessionReset')] = {
      timestamp: now,
      sessionId: 'platform_admin',
      reason: 'platform-admin-clear-active-sessions',
    };

    let matchesScanned = 0;
    let matchesClosed = 0;
    for (const sport of matchSets) {
      changes[tenantPathFor(tenantId, `${sport.key}/activeMatch`)] = null;
      for (const { id, setup } of sport.matches) {
        matchesScanned++;
        const matchPath = `${sport.base}/matches/${id}`;
        changes[`${matchPath}/overlay`] = null;

        if (sport.cricket) {
          changes[`${matchPath}/preMatch`] = null;
          changes[`${matchPath}/replayTrigger`] = null;
          changes[`${matchPath}/liveComments`] = null;
          changes[`${matchPath}/liveCam`] = null;
          changes[`${matchPath}/activeFieldPlacement`] = null;
        }

        if (setup.status === 'live') {
          matchesClosed++;
          changes[`${matchPath}/setup/status`] = 'abandoned';
          changes[`${matchPath}/setup/updatedAt`] = now;
          if (sport.cricket) {
            changes[`${matchPath}/setup/interruption`] = {
              kind: 'abandoned',
              reason: 'Closed by Platform Admin',
              updatedAt: now,
            };
          }
        }
      }
    }

    await update(ref(db), changes);
    return { matchesScanned, matchesClosed };
  }

  /** Ensure the default tenant record exists (one-time bootstrap). */
  async ensureDefaultTenant(): Promise<TenantRecord> {
    const existing = await this.getTenant(DEFAULT_TENANT_ID);
    if (existing) return existing;
    return this.createTenant({
      id: DEFAULT_TENANT_ID,
      slug: DEFAULT_TENANT_ID.replace(/_/g, '-'),
      name: 'EPL 2026',
      plan: 'pro',
    });
  }
}

export const tenantService = new TenantService();
