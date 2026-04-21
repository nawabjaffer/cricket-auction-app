// ============================================================================
// TENANT PATH SERVICE
// Multi-tenant abstraction for Firebase RTDB.
//
// Every service that reads/writes to Firebase MUST go through `tenantPath()`
// or `platformPath()` here. This gives us a single point of control to scope
// data to the currently active tournament (tenant) without changing business
// logic in every service.
//
// Default tenant: DEFAULT_TENANT_ID — used when:
//   1. No tenant is explicitly set yet (app boot / legacy route).
//   2. The user lands on a legacy top-level route such as `/live` without a
//      `/:tenantSlug/` prefix.
//
// This means existing clients continue to work after deployment — their data
// is transparently treated as belonging to the default tenant.
// ============================================================================

export const DEFAULT_TENANT_ID = 'epl_2026';

/** Allow-listed characters in a tenant id/slug: letters, digits, `_`, `-`. */
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

let _activeTenantId: string = DEFAULT_TENANT_ID;

export function setActiveTenant(tenantId: string | null | undefined): void {
  const raw = (tenantId ?? '').trim();
  if (!raw) {
    _activeTenantId = DEFAULT_TENANT_ID;
    return;
  }
  if (!TENANT_ID_PATTERN.test(raw)) {
    console.warn(`[tenantPath] Invalid tenant id "${raw}"; falling back to default.`);
    _activeTenantId = DEFAULT_TENANT_ID;
    return;
  }
  _activeTenantId = raw;
}

export function getActiveTenant(): string {
  return _activeTenantId;
}

/** Returns `tenants/{activeTenantId}/{relativePath}`. */
export function tenantPath(relativePath: string): string {
  const clean = (relativePath ?? '').replace(/^\/+/, '');
  return `tenants/${_activeTenantId}/${clean}`;
}

/** Returns `platform/{relativePath}` — for tenant registry and super-admin. */
export function platformPath(relativePath: string): string {
  const clean = (relativePath ?? '').replace(/^\/+/, '');
  return `platform/${clean}`;
}

/** Convenience: tenant path for a specific id, not the active one. */
export function tenantPathFor(tenantId: string, relativePath: string): string {
  const id = TENANT_ID_PATTERN.test(tenantId) ? tenantId : DEFAULT_TENANT_ID;
  const clean = (relativePath ?? '').replace(/^\/+/, '');
  return `tenants/${id}/${clean}`;
}
