// ============================================================================
// TENANT GATE
// Wraps a subtree of tenant-prefixed routes. Reads `:tenantSlug` from the URL,
// resolves it to a tenant id (platform/tenants registry), and pushes it into
// the module-level tenant state via `setActiveTenant(...)`.
//
// While the lookup is in flight we render a lightweight splash so downstream
// services never fire reads against the wrong tenant.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { setActiveTenant, DEFAULT_TENANT_ID } from '../../services/tenantPath';
import { tenantService, type TenantRecord } from '../../services/tenantService';

interface Props { children: ReactNode }

export function TenantGate({ children }: Props) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [resolvedSlug, setResolvedSlug] = useState<string | undefined>();

  useEffect(() => {
    const slug = (tenantSlug ?? DEFAULT_TENANT_ID).trim();
    setReady(false);
    setError(null);
    setTenant(null);

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const found = await tenantService.resolveBySlug(slug);
        if (cancelled) return;
        if (!found) {
          setError(`Tournament "${slug}" not found.`);
        } else {
          unsubscribe = await tenantService.watchTenant(found.id, (record) => {
            if (cancelled) return;
            setTenant(record);
            setResolvedSlug(tenantSlug);
            if (!record) setError('Tournament no longer exists.');
            else if (!record.isActive) setError('This tournament is deactivated. Please contact the administrators to reactivate it.');
            else {
              setError(null);
              setActiveTenant(record.id);
            }
            setReady(true);
          }, () => {
            if (cancelled) return;
            setError('Unable to verify tournament access. Please try again.');
            setResolvedSlug(tenantSlug);
            setReady(true);
          });
          if (cancelled) unsubscribe();
          return;
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[TenantGate] Failed to resolve tenant:', err);
        setError('Failed to load tournament.');
      }
      if (!cancelled) {
        setResolvedSlug(tenantSlug);
        setReady(true);
      }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [tenantSlug]);

  if (!ready || resolvedSlug !== tenantSlug) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0b1020', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>Loading tournament…</div>
        </div>
      </div>
    );
  }

  if (error || !tenant?.isActive) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0b1020', color: '#fca5a5', fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h2 style={{ margin: 0 }}>Tournament unavailable</h2>
          <p style={{ marginTop: 8, opacity: 0.85 }}>{error}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
