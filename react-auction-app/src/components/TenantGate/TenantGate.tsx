// ============================================================================
// TENANT GATE
// Wraps a subtree of tenant-prefixed routes. Reads `:tenantSlug` from the URL,
// resolves it to a tenant id (platform/tenants registry), and pushes it into
// the module-level tenant state via `setActiveTenant(...)`.
//
// While the lookup is in flight we render a lightweight splash so downstream
// services never fire reads against the wrong tenant.
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { setActiveTenant, DEFAULT_TENANT_ID } from '../../services/tenantPath';
import { tenantService, type TenantRecord } from '../../services/tenantService';

interface Props { children: ReactNode }

export function TenantGate({ children }: Props) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const slugRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const slug = (tenantSlug ?? '').trim();
    if (slugRef.current === slug) return;
    slugRef.current = slug;
    setReady(false);
    setError(null);

    // Fast-path: slug matches the default id/slug — no network.
    if (!slug || slug === DEFAULT_TENANT_ID || slug === DEFAULT_TENANT_ID.replace(/_/g, '-')) {
      setActiveTenant(DEFAULT_TENANT_ID);
      setTenant({
        id: DEFAULT_TENANT_ID,
        slug: DEFAULT_TENANT_ID.replace(/_/g, '-'),
        name: 'EPL 2026',
        plan: 'pro',
        isActive: true,
        createdAt: 0,
      });
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const found = await tenantService.resolveBySlug(slug);
        if (cancelled) return;
        if (!found) {
          setError(`Tournament "${slug}" not found.`);
          setActiveTenant(DEFAULT_TENANT_ID);
          setReady(true);
          return;
        }
        setActiveTenant(found.id);
        setTenant(found);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error('[TenantGate] Failed to resolve tenant:', err);
        setError('Failed to load tournament.');
        setActiveTenant(DEFAULT_TENANT_ID);
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantSlug]);

  if (!ready) {
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

  if (error && !tenant) {
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
