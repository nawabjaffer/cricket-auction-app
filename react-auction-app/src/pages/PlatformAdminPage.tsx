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
import {
  FOOTBALL_FORMATS, FOOTBALL_FORMAT_PRESETS, DEFAULT_FOOTBALL_RULES,
} from '../types/football';
import type { FootballFormat, FootballRulesConfig } from '../types/football';

const PLAN_OPTIONS: TenantPlan[] = ['free', 'basic', 'pro', 'enterprise'];

export default function PlatformAdminPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ id: '', slug: '', name: '', plan: 'pro' as TenantPlan });
  const [creating, setCreating] = useState(false);
  const [rulesFor, setRulesFor] = useState<TenantRecord | null>(null);

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
    const current = t.sports?.length ? t.sports : (['cricket'] as SportKey[]);
    const next = current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport];
    if (next.length === 0) { setError('A tournament must have at least one sport enabled.'); return; }
    // Optimistic local update so the UI reflects immediately (no stale read).
    setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, sports: next } : x)));
    setError(null);
    try {
      await tenantService.setTenantSports(t.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      refresh(); // revert to server truth on failure
    }
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
                const sports = t.sports?.length ? t.sports : (['cricket'] as SportKey[]);
                const onlyFootball = sports.length === 1 && sports[0] === 'football';
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
                        const onBg = sp.key === 'football' ? '#e11d1d' : '#2563eb';
                        return (
                          <button key={sp.key} onClick={() => toggleSport(t, sp.key)}
                            title={on ? `Disable ${sp.label}` : `Enable ${sp.label}`}
                            style={{
                              ...sportChip,
                              background: on ? onBg : 'transparent',
                              borderColor: on ? 'transparent' : '#374151',
                              color: on ? '#fff' : '#94a3b8',
                            }}>
                            {sp.key === 'football' ? '⚽' : '🏏'} {sp.label} {on ? '✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {sports.includes('cricket') && <a href={`/${t.slug}/cricket/scorer/admin`} style={sportLink}>🏏 Open Cricket Scorer →</a>}
                      {sports.includes('football') && <a href={`/${t.slug}/football/scorer/admin`} style={{ ...sportLink, color: '#f87171' }}>⚽ Open Football Scorer →</a>}
                      {sports.includes('football') && (
                        <button onClick={() => setRulesFor(t)} style={rulesBtn} title="Configure football rules & timing">
                          ⚙️ Football Rules{t.footballRules ? ` · ${t.footballRules.format} · ${t.footballRules.halfDurationMin}′×${t.footballRules.numberOfHalves}` : ' · set up'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Primary manage button jumps straight to the sport when only one is enabled */}
                    <a href={onlyFootball ? `/${t.slug}/football/scorer/admin` : `/${t.slug}/cricket/scorer/admin`}
                      style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                      Manage {onlyFootball ? '⚽' : (sports.includes('cricket') ? '🏏' : '⚽')}
                    </a>
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

      {rulesFor && (
        <FootballRulesModal
          tenant={rulesFor}
          onClose={() => setRulesFor(null)}
          onSaved={async (rules) => {
            setTenants((prev) => prev.map((x) => (x.id === rulesFor.id ? { ...x, footballRules: rules } : x)));
            try { await tenantService.setFootballRules(rulesFor.id, rules); }
            catch (err) { setError(err instanceof Error ? err.message : String(err)); }
            setRulesFor(null);
          }}
        />
      )}
    </div>
  );
}

// ── Football rules configuration modal ──────────────────────────────────────

function FootballRulesModal({ tenant, onClose, onSaved }: Readonly<{
  tenant: TenantRecord;
  onClose: () => void;
  onSaved: (rules: FootballRulesConfig) => void;
}>) {
  const [rules, setRules] = useState<FootballRulesConfig>(tenant.footballRules ?? DEFAULT_FOOTBALL_RULES);

  const applyPreset = (format: FootballFormat) => setRules(FOOTBALL_FORMAT_PRESETS[format]);
  const set = <K extends keyof FootballRulesConfig>(k: K, v: FootballRulesConfig[K]) => setRules((r) => ({ ...r, [k]: v }));

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>⚽ Football Rules · {tenant.name}</h2>
          <button onClick={onClose} style={{ ...btnGhost, padding: '6px 10px' }}>✕</button>
        </div>
        <p style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
          Pick a format to load standard rules, then fine-tune. Timings drive the live match clock.
        </p>

        {/* Format presets */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {FOOTBALL_FORMATS.map((f) => (
            <button key={f.value} onClick={() => applyPreset(f.value)}
              style={{
                ...formatChip,
                background: rules.format === f.value ? '#e11d1d' : 'transparent',
                borderColor: rules.format === f.value ? 'transparent' : '#374151',
                color: rules.format === f.value ? '#fff' : '#cbd5e1',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Timing */}
        <fieldset style={fieldset}>
          <legend style={legend}>⏱ Timing</legend>
          <div style={grid3}>
            <NumField label="Half duration (min)" value={rules.halfDurationMin} onChange={(v) => set('halfDurationMin', v)} />
            <NumField label="Number of halves" value={rules.numberOfHalves} onChange={(v) => set('numberOfHalves', v)} />
            <NumField label="Half-time break (min)" value={rules.halfTimeBreakMin} onChange={(v) => set('halfTimeBreakMin', v)} />
          </div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
            Full time = {rules.halfDurationMin * rules.numberOfHalves} min ({rules.numberOfHalves} × {rules.halfDurationMin}).
          </div>
        </fieldset>

        {/* Extra time & penalties */}
        <fieldset style={fieldset}>
          <legend style={legend}>➕ Extra Time & Penalties</legend>
          <div style={grid3}>
            <ToggleField label="Extra time" value={rules.extraTimeEnabled} onChange={(v) => set('extraTimeEnabled', v)} />
            <NumField label="ET half (min)" value={rules.extraTimeHalfMin} onChange={(v) => set('extraTimeHalfMin', v)} disabled={!rules.extraTimeEnabled} />
            <ToggleField label="Penalty shootout" value={rules.penaltiesEnabled} onChange={(v) => set('penaltiesEnabled', v)} />
          </div>
          <div style={grid3}>
            <NumField label="Shootout best-of" value={rules.penaltyShootoutBest} onChange={(v) => set('penaltyShootoutBest', v)} disabled={!rules.penaltiesEnabled} />
          </div>
        </fieldset>

        {/* Squad & substitutions */}
        <fieldset style={fieldset}>
          <legend style={legend}>👥 Squad & Substitutions</legend>
          <div style={grid3}>
            <NumField label="Players per side" value={rules.playersPerSide} onChange={(v) => set('playersPerSide', v)} />
            <NumField label="Squad size" value={rules.squadSize} onChange={(v) => set('squadSize', v)} />
            <NumField label="Max substitutions" value={rules.maxSubstitutions} onChange={(v) => set('maxSubstitutions', v)} />
          </div>
          <div style={grid3}>
            <ToggleField label="Rolling subs" value={rules.rollingSubs} onChange={(v) => set('rollingSubs', v)} />
          </div>
        </fieldset>

        {/* Discipline & play */}
        <fieldset style={fieldset}>
          <legend style={legend}>🟨 Discipline & Play</legend>
          <div style={grid3}>
            <NumField label="Yellows → suspension" value={rules.yellowCardsForSuspension} onChange={(v) => set('yellowCardsForSuspension', v)} />
            <ToggleField label="Sin bin" value={rules.sinBinEnabled} onChange={(v) => set('sinBinEnabled', v)} />
            <NumField label="Sin bin (min)" value={rules.sinBinMinutes} onChange={(v) => set('sinBinMinutes', v)} disabled={!rules.sinBinEnabled} />
          </div>
          <div style={grid3}>
            <ToggleField label="Offside rule" value={rules.offsideEnabled} onChange={(v) => set('offsideEnabled', v)} />
          </div>
        </fieldset>

        <label style={{ display: 'block', marginTop: 12 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Notes for officials (optional)</span>
          <textarea value={rules.notes ?? ''} onChange={(e) => set('notes', e.target.value)}
            style={{ ...inp, width: '100%', marginTop: 4, minHeight: 54, resize: 'vertical' }} placeholder="Any tournament-specific regulations…" />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={() => onSaved({ ...rules, notes: rules.notes?.trim() || undefined })} style={btnPrimary}>Save Rules</button>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, disabled }: Readonly<{ label: string; value: number; onChange: (v: number) => void; disabled?: boolean }>) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: disabled ? 0.45 : 1 }}>
      <span style={{ fontSize: 11, opacity: 0.75 }}>{label}</span>
      <input type="number" min={0} value={value} disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} style={inp} />
    </label>
  );
}

function ToggleField({ label, value, onChange }: Readonly<{ label: string; value: boolean; onChange: (v: boolean) => void }>) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        border: `1px solid ${value ? '#16a34a' : '#374151'}`,
        background: value ? 'rgba(22,163,74,0.15)' : 'transparent',
        color: value ? '#4ade80' : '#94a3b8',
      }}>
      {label}<span>{value ? 'ON' : 'OFF'}</span>
    </button>
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
const rulesBtn: React.CSSProperties = {
  fontSize: 11, color: '#facc15', background: 'rgba(250,204,21,0.1)',
  border: '1px solid rgba(250,204,21,0.35)', borderRadius: 8, padding: '5px 10px',
  cursor: 'pointer', fontWeight: 600,
};
const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
};
const modalCard: React.CSSProperties = {
  width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto',
  background: '#0f1526', border: '1px solid #1f2937', borderRadius: 16, padding: 22,
};
const formatChip: React.CSSProperties = {
  border: '1px solid #374151', padding: '9px 18px', borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const fieldset: React.CSSProperties = {
  border: '1px solid #1f2937', borderRadius: 12, padding: '10px 14px 14px', marginTop: 14,
};
const legend: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#93c5fd', padding: '0 6px',
};
const grid3: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 8,
};
