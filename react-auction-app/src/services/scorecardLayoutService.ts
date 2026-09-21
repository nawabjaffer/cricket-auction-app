// ============================================================================
// SCORECARD LAYOUT SERVICE — CRUD for Canva-style scorecard designs
// Singleton mirroring ScoringService/FootballService/KabaddiService conventions.
// Layouts are scoped per-tenant + per-sport + per-surface under:
//   tenants/{id}/scorecardDesigner/{sport}/layouts/{layoutId}                (scoreboard — original path, unchanged)
//   tenants/{id}/scorecardDesigner/{sport}/surfaces/{surface}/layouts/{id}   (team_squad / match_stats)
//   .../activeLayoutId, .../customWidgets/{widgetId}
// tenantPath() is resolved fresh on every call so tenant switches never leak
// stale paths across sports/pages.
// ============================================================================

import { ref, get, set, remove, onValue, type Database } from 'firebase/database';
import { tenantPath } from './tenantPath';
import type { SportKey } from './tenantService';
import type { ScorecardLayout, CustomWidgetDef, ScorecardSurface } from '../types/scorecardDesigner';

class ScorecardLayoutService {
  private db: Database | null = null;

  initialize(db: Database): void {
    this.db = db;
  }

  get isReady(): boolean {
    return !!this.db;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('ScorecardLayoutService not initialized');
    return this.db;
  }

  private base(sport: SportKey, surface: ScorecardSurface = 'scoreboard'): string {
    return surface === 'scoreboard'
      ? tenantPath(`scorecardDesigner/${sport}`)
      : tenantPath(`scorecardDesigner/${sport}/surfaces/${surface}`);
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

  // ── Layouts ────────────────────────────────────────────────────────────────

  async saveLayout(sport: SportKey, layout: ScorecardLayout): Promise<void> {
    const db = this.ensureDb();
    const surface = layout.surface ?? 'scoreboard';
    await set(ref(db, `${this.base(sport, surface)}/layouts/${layout.id}`), this.clean({ ...layout, surface, updatedAt: Date.now() }));
  }

  async getLayout(sport: SportKey, layoutId: string, surface: ScorecardSurface = 'scoreboard'): Promise<ScorecardLayout | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.base(sport, surface)}/layouts/${layoutId}`));
    return snap.exists() ? (snap.val() as ScorecardLayout) : null;
  }

  async getLayouts(sport: SportKey, surface: ScorecardSurface = 'scoreboard'): Promise<ScorecardLayout[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.base(sport, surface)}/layouts`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, ScorecardLayout>)
      .filter((l): l is ScorecardLayout => !!l?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  subscribeLayouts(sport: SportKey, cb: (layouts: ScorecardLayout[]) => void, surface: ScorecardSurface = 'scoreboard'): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.base(sport, surface)}/layouts`), snap => {
      const val = (snap.val() as Record<string, ScorecardLayout>) ?? {};
      cb(Object.values(val).filter((l): l is ScorecardLayout => !!l?.id).sort((a, b) => b.updatedAt - a.updatedAt));
    });
  }

  subscribeLayout(sport: SportKey, layoutId: string, cb: (layout: ScorecardLayout | null) => void, surface: ScorecardSurface = 'scoreboard'): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.base(sport, surface)}/layouts/${layoutId}`), snap => {
      cb(snap.exists() ? (snap.val() as ScorecardLayout) : null);
    });
  }

  async deleteLayout(sport: SportKey, layoutId: string, surface: ScorecardSurface = 'scoreboard'): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.base(sport, surface)}/layouts/${layoutId}`));
    const activeSnap = await get(ref(db, `${this.base(sport, surface)}/activeLayoutId`));
    if (activeSnap.exists() && activeSnap.val() === layoutId) {
      await remove(ref(db, `${this.base(sport, surface)}/activeLayoutId`));
    }
  }

  // ── Active layout (drives OBS overlay + camera recorder rendering) ────────

  async setActiveLayout(sport: SportKey, layoutId: string | null, surface: ScorecardSurface = 'scoreboard'): Promise<void> {
    const db = this.ensureDb();
    if (layoutId) await set(ref(db, `${this.base(sport, surface)}/activeLayoutId`), layoutId);
    else await remove(ref(db, `${this.base(sport, surface)}/activeLayoutId`));
  }

  async getActiveLayoutId(sport: SportKey, surface: ScorecardSurface = 'scoreboard'): Promise<string | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.base(sport, surface)}/activeLayoutId`));
    return snap.exists() ? (snap.val() as string) : null;
  }

  subscribeActiveLayoutId(sport: SportKey, cb: (layoutId: string | null) => void, surface: ScorecardSurface = 'scoreboard'): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.base(sport, surface)}/activeLayoutId`), snap => {
      cb(snap.exists() ? (snap.val() as string) : null);
    });
  }

  /** Subscribes to the active layout and repairs the common saved-but-not-yet-active case. */
  subscribeEffectiveLayout(sport: SportKey, cb: (layout: ScorecardLayout | null) => void, surface: ScorecardSurface = 'scoreboard'): () => void {
    const db = this.ensureDb();
    let activeId: string | null = null;
    let layouts: ScorecardLayout[] = [];
    const emit = () => {
      const active = activeId ? layouts.find(layout => layout.id === activeId) : null;
      cb(active ?? layouts[0] ?? null);
    };
    const unsubActive = onValue(ref(db, `${this.base(sport, surface)}/activeLayoutId`), snap => {
      activeId = snap.exists() ? (snap.val() as string) : null;
      emit();
    });
    const unsubLayouts = onValue(ref(db, `${this.base(sport, surface)}/layouts`), snap => {
      const value = (snap.val() as Record<string, ScorecardLayout>) ?? {};
      layouts = Object.values(value)
        .filter((layout): layout is ScorecardLayout => !!layout?.id && layout.sport === sport && Array.isArray(layout.widgets))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      emit();
    });
    return () => {
      unsubActive();
      unsubLayouts();
    };
  }

  // ── Custom widgets (user-authored, appear in the sport's palette) ─────────

  async saveCustomWidget(sport: SportKey, widget: CustomWidgetDef): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.base(sport)}/customWidgets/${widget.id}`), this.clean(widget));
  }

  async getCustomWidgets(sport: SportKey): Promise<CustomWidgetDef[]> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.base(sport)}/customWidgets`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, CustomWidgetDef>).filter((w): w is CustomWidgetDef => !!w?.id);
  }

  subscribeCustomWidgets(sport: SportKey, cb: (widgets: CustomWidgetDef[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.base(sport)}/customWidgets`), snap => {
      const val = (snap.val() as Record<string, CustomWidgetDef>) ?? {};
      cb(Object.values(val).filter((w): w is CustomWidgetDef => !!w?.id));
    });
  }

  async deleteCustomWidget(sport: SportKey, widgetId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.base(sport)}/customWidgets/${widgetId}`));
  }
}

export const scorecardLayoutService = new ScorecardLayoutService();
