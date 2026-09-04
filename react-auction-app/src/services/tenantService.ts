// ============================================================================
// TENANT SERVICE
// CRUD + slug resolution for tournaments (tenants) stored under
// `platform/tenants`. Each tenant owns its own namespace at
// `tenants/{tenantId}/...`.
// ============================================================================

import { get, ref, set, update } from 'firebase/database';
import { realtimeSync } from './realtimeSync';
import { DEFAULT_TENANT_ID, platformPath } from './tenantPath';
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
  async setTenantSports(id: string, sports: SportKey[]): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    const unique = Array.from(new Set(sports));
    await set(ref(db, `${TENANT_REGISTRY_PATH()}/${id}/sports`), unique);
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
