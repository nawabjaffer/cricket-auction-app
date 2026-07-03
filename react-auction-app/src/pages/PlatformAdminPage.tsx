// ============================================================================
// PLATFORM ADMIN PAGE
// Super-admin console for managing tournaments (tenants). Lists all tenants
// from `platform/tenants`, supports creating new tenants, toggling activation,
// and basic metadata edits. Tournament-scoped data (teams, players, sponsors,
// themes, settings) is managed inside each tournament admin at
// `/:tenantSlug/admin`.
// ============================================================================

import { useEffect, useState } from 'react';
import { tenantService, type TenantRecord, type TenantPlan, type SportKey, ALL_SPORTS } from '../services/tenantService';

const PLAN_OPTIONS: TenantPlan[] = ['free', 'basic', 'pro', 'enterprise'];

export default function PlatformAdminPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ id: '', slug: '', name: '', plan: 'pro' as TenantPlan });
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      await tenantService.ensureDefaultTenant();
      const all = await tenantService.listTenants();
      setTenants(all.sort((a, b) => a.createdAt - b.createdAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = draft.id.trim();
    const slug = (draft.slug || id).trim().replace(/_/g, '-');
    const name = draft.name.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { setError('Tenant id must be alphanumeric/_/-'); return; }
    if (!name) { setError('Tournament name required'); return; }
    setCreating(true); setError(null);
    try {
      await tenantService.createTenant({ id, slug, name, plan: draft.plan });
      setDraft({ id: '', slug: '', name: '', plan: 'pro' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setCreating(false); }
  };

  const toggle = async (t: TenantRecord) => {
    await tenantService.updateTenant(t.id, { isActive: !t.isActive });
    refresh();
  };

  const toggleSport = async (t: TenantRecord, sport: SportKey) => {
    const current = t.sports && t.sports.length ? t.sports : (['cricket'] as SportKey[]);
    const next = current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport];
    await tenantService.updateTenant(t.id, { sports: next });
    refresh();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b1020', color: '#e2e8f0', padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Platform Admin · Tournaments</h1>
        <p style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
          Create and manage tournament franchises. Each tournament owns its own teams, players, sponsors, themes, and admin accounts under <code>tenants/&lt;id&gt;/…</code>.
        </p>

        {error && (
          <div style={{ marginTop: 16, padding: 12, background: '#3b0d16', border: '1px solid #b91c1c', borderRadius: 8, color: '#fecaca' }}>
            {error}
          </div>
        )}

        <section style={{ marginTop: 24, background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Create Tournament</h2>
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 160px 120px', gap: 10, marginTop: 14 }}>
            <input placeholder="tenant id (e.g. tpl_2026)" value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              style={inp} />
            <input placeholder="slug (e.g. tpl-2026)" value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              style={inp} />
            <input placeholder="Display name" value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={inp} />
            <select value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value as TenantPlan })} style={inp}>
              {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="submit" disabled={creating} style={btnPrimary}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Tournaments ({tenants.length})</h2>
          {loading ? <p style={{ opacity: 0.7 }}>Loading…</p> : (
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {tenants.map((t) => {
                const sports = t.sports && t.sports.length ? t.sports : (['cricket'] as SportKey[]);
                return (
                <div key={t.id} style={rowCard}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      id: <code>{t.id}</code> · slug: <code>{t.slug}</code> · plan: <code>{t.plan}</code>
                      {' · '}
                      <span style={{ color: t.isActive ? '#34d399' : '#f87171' }}>{t.isActive ? 'active' : 'inactive'}</span>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sports:</span>
                      {ALL_SPORTS.map((sp) => {
                        const on = sports.includes(sp.key);
                        return (
                          <button key={sp.key} onClick={() => toggleSport(t, sp.key)}
                            style={{
                              ...sportChip,
                              background: on ? (sp.key === 'football' ? '#e11d1d' : '#2563eb') : 'transparent',
                              borderColor: on ? 'transparent' : '#374151',
                              color: on ? '#fff' : '#94a3b8',
                            }}>
                            {sp.key === 'football' ? '⚽' : '🏏'} {sp.label} {on ? '✓' : ''}
                          </button>
                        );
                      })}
                      {sports.includes('cricket') && <a href={`/${t.slug}/cricket/scorer/admin`} style={sportLink}>Cricket Scorer →</a>}
                      {sports.includes('football') && <a href={`/${t.slug}/football/scorer/admin`} style={sportLink}>Football Scorer →</a>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href={`/${t.slug}/`} style={btnGhost}>Open</a>
                    <a href={`/${t.slug}/admin`} style={btnGhost}>Admin</a>
                    <button onClick={() => toggle(t)} style={btnGhost}>
                      {t.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
                );
              })}
              {tenants.length === 0 && <p style={{ opacity: 0.7 }}>No tournaments yet.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  background: '#0b1020', border: '1px solid #374151', color: '#e2e8f0',
  padding: '10px 12px', borderRadius: 8, fontSize: 13,
};
const btnPrimary: React.CSSProperties = {
  background: '#2563eb', border: 'none', color: 'white', padding: '10px 14px',
  borderRadius: 8, fontWeight: 600, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid #374151', color: '#e2e8f0',
  padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textDecoration: 'none',
};
const rowCard: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
};
const sportChip: React.CSSProperties = {
  border: '1px solid #374151', padding: '5px 11px', borderRadius: 999,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const sportLink: React.CSSProperties = {
  fontSize: 11, color: '#60a5fa', textDecoration: 'none', marginLeft: 4,
};
