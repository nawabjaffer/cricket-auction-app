// ============================================================================
// useTenantNavigate
// Thin wrapper over react-router's useNavigate that automatically prefixes
// absolute paths with the current tenant slug (if the user is on a
// `/:tenantSlug/...` URL). Legacy top-level routes (no slug in URL) continue
// to navigate without a prefix, preserving existing behavior.
// ============================================================================

import { useCallback } from 'react';
import { useLocation, useNavigate, type NavigateOptions } from 'react-router-dom';

const RESERVED = new Set([
  '', 'admin', 'live', 'live-admin', 'camera', 'connect-bididng', 'connect-bidding',
  'diagnostics', 'obs-overlay', 'obs-dock', 'platform-admin',
]);

export function getTenantSlugFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  if (RESERVED.has(first)) return null;
  return first;
}

export function useTenantNavigate() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string, options?: NavigateOptions) => {
      if (typeof to !== 'string' || !to.startsWith('/')) {
        return navigate(to, options);
      }
      const slug = getTenantSlugFromPath(location.pathname);
      if (!slug) return navigate(to, options);
      // Don't double-prefix if target already has the slug.
      if (to === `/${slug}` || to.startsWith(`/${slug}/`)) return navigate(to, options);
      const prefixed = to === '/' ? `/${slug}` : `/${slug}${to}`;
      return navigate(prefixed, options);
    },
    [navigate, location.pathname],
  );
}
