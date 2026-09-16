// ============================================================================
// SCORING GAME TYPE PREFERENCE — remembers which sport a tenant's generic
// /scoring/admin, /match/score/update and /score/obs-overlay links should
// open, per-browser, so the choice sticks across visits without a query param.
// ============================================================================

const KEY_PREFIX = 'scoring:gameType:';

export function getPreferredGameType(tenantId: string): string | null {
  try {
    return window.localStorage.getItem(KEY_PREFIX + tenantId);
  } catch {
    return null;
  }
}

export function setPreferredGameType(tenantId: string, gameType: string): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + tenantId, gameType);
  } catch {
    /* ignore — private browsing / storage disabled */
  }
}
