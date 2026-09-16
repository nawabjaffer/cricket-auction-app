import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { realtimeSync } from '../services/realtimeSync';
import { auctionPersistence } from '../services/auctionPersistence';
import { getActiveTenant } from '../services/tenantPath';
import { tenantService } from '../services/tenantService';
import { getPreferredGameType, setPreferredGameType } from '../services/scoringGameTypePreference';
import {
  buildScorerPages, gameTypeIcon, gameTypeLabel, isSupportedGameType,
  type ScorerRouteKey, type SupportedGameType,
} from './scorerPages';

type GenericScoringRoute = Extract<ScorerRouteKey, 'admin' | 'update' | 'overlay'>;

interface Props {
  route: GenericScoringRoute;
}

export default function TenantScoringRouterPage({ route }: Readonly<Props>) {
  const location = useLocation();
  const navigate = useNavigate();
  const tenantId = getActiveTenant();
  const [gameType, setGameType] = useState<SupportedGameType | null>(null);
  const [enabledSports, setEnabledSports] = useState<SupportedGameType[]>([]);

  useEffect(() => {
    let cancelled = false;
    const resolveGameType = async () => {
      const tenant = await tenantService.getTenant(tenantId);
      const enabled = (tenant?.sports?.filter(isSupportedGameType) ?? []) as SupportedGameType[];
      const requested = new URLSearchParams(location.search).get('gameType')
        ?? new URLSearchParams(location.search).get('sport');
      const stored = getPreferredGameType(tenantId);

      await realtimeSync.ensureInitialized();
      const db = realtimeSync.getDatabase();
      if (db) auctionPersistence.initialize(db);
      const settings = db ? await auctionPersistence.getAdminSettings().catch(() => null) : null;

      const candidates = [requested, stored, tenant?.primarySport, enabled.at(-1), settings?.sport, 'cricket'];
      const resolved = candidates.find(candidate =>
        isSupportedGameType(candidate) && (enabled.length === 0 || enabled.includes(candidate))
      );
      const finalGameType = isSupportedGameType(resolved) ? resolved : 'cricket';
      if (cancelled) return;
      setEnabledSports(enabled);
      setGameType(finalGameType);
      setPreferredGameType(tenantId, finalGameType);
    };
    void resolveGameType().catch(() => {
      if (!cancelled) setGameType('cricket');
    });
    return () => { cancelled = true; };
  }, [tenantId, location.search]);

  const selectGameType = (next: SupportedGameType) => {
    setGameType(next);
    setPreferredGameType(tenantId, next);
    void tenantService.updateTenant(tenantId, { primarySport: next }).catch(() => { /* non-critical */ });
    const params = new URLSearchParams(location.search);
    params.set('gameType', next);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  if (gameType === null) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading scorer...</div>;
  }

  const showSwitcher = route === 'admin' && enabledSports.length > 1;

  return (
    <>
      {showSwitcher && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px',
          background: '#0b1020', borderBottom: '1px solid #1f2937',
        }}>
          <span style={{ fontSize: 12, opacity: 0.6, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Game:
          </span>
          {enabledSports.map(sport => (
            <button
              key={sport}
              onClick={() => selectGameType(sport)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
                border: sport === gameType ? '1px solid transparent' : '1px solid #334155',
                background: sport === gameType ? '#2563eb' : 'transparent',
                color: sport === gameType ? '#fff' : '#94a3b8',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span>{gameTypeIcon(sport)}</span> {gameTypeLabel(sport)}
            </button>
          ))}
        </div>
      )}
      {buildScorerPages()[gameType][route]}
    </>
  );
}