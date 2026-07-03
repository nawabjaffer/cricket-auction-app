// ============================================================================
// TENANT SERVICE
// CRUD + slug resolution for tournaments (tenants) stored under
// `platform/tenants`. Each tenant owns its own namespace at
// `tenants/{tenantId}/...`.
// ============================================================================

import { get, ref, set, update } from 'firebase/database';
import { realtimeSync } from './realtimeSync';
import { DEFAULT_TENANT_ID, platformPath } from './tenantPath';

export type TenantPlan = 'free' | 'basic' | 'pro' | 'enterprise';

/** Sports a tenant (tournament) has enabled. */
export type SportKey = 'cricket' | 'football';

export const ALL_SPORTS: { key: SportKey; label: string }[] = [
  { key: 'cricket', label: 'Cricket' },
  { key: 'football', label: 'Football' },
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
