// ============================================================================
// GAME SCORER ROUTER — /:gameType/scorer/... and /:tenantSlug/:gameType/scorer/...
// Dispatches to the sport-specific scorer workspace for the URL's :gameType,
// enforced against the sports this tenant has enabled in Platform Admin.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { getActiveTenant } from '../services/tenantPath';
import { tenantService, type SportKey } from '../services/tenantService';
import {
  buildScorerPages, gameTypeLabel, isSupportedGameType,
  type ScorerRouteKey, type SupportedGameType,
} from './scorerPages';

interface Props {
  route: ScorerRouteKey;
}

type CheckState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unknown-game' }
  | { status: 'restricted'; gameType: SupportedGameType }
  | { status: 'unsupported-route'; gameType: SupportedGameType }
  | { status: 'ok'; page: ReactNode };

export default function GameScorerPage({ route }: Readonly<Props>) {
  const { gameType: rawGameType } = useParams<{ gameType: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<CheckState>({ status: 'loading' });
  // OBS browser sources must stay transparent — never show an opaque box over the live feed.
  const isBroadcastSurface = route === 'overlay' || route === 'obs-dock';

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      if (!isSupportedGameType(rawGameType)) {
        if (!cancelled) setState({ status: 'unknown-game' });
        return;
      }
      const gameType = rawGameType;
      try {
        const tenant = await tenantService.getTenant(getActiveTenant());
        const enabled: SportKey[] = tenant?.sports?.length ? tenant.sports : ['cricket'];
        if (!enabled.includes(gameType)) {
          if (!cancelled) setState({ status: 'restricted', gameType });
          return;
        }
        const page = buildScorerPages()[gameType][route];
        if (!page) {
          if (!cancelled) setState({ status: 'unsupported-route', gameType });
          return;
        }
        if (!cancelled) setState({ status: 'ok', page });
      } catch {
        // A transient fetch failure is not the same as "not enabled" — retry
        // instead of settling on a misleading permanent message.
        if (!cancelled) {
          setState({ status: 'error' });
          retryTimer = setTimeout(() => void check(), 2000);
        }
      }
    };
    void check();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [rawGameType, route]);

  if (state.status === 'loading' || state.status === 'error') {
    return isBroadcastSurface ? <div style={{ background: 'transparent' }} /> : <ScorerStatusScreen title="Loading scorer..." />;
  }

  if (state.status === 'unknown-game') {
    return (
      <ScorerStatusScreen
        title="Unknown game type"
        message={`"${rawGameType}" isn't a supported sport.`}
        onBack={isBroadcastSurface ? undefined : () => navigate('/admin')}
        transparent={isBroadcastSurface}
      />
    );
  }

  if (state.status === 'restricted') {
    return (
      <ScorerStatusScreen
        title={`${gameTypeLabel(state.gameType)} isn't enabled`}
        message="Ask a platform admin to enable this sport for the tournament in Platform Admin before opening its scorer."
        onBack={isBroadcastSurface ? undefined : () => navigate('/admin')}
        transparent={isBroadcastSurface}
      />
    );
  }

  if (state.status === 'unsupported-route') {
    return (
      <ScorerStatusScreen
        title={`Not available for ${gameTypeLabel(state.gameType)}`}
        message="This scorer feature hasn't been built for this sport yet."
        onBack={isBroadcastSurface ? undefined : () => navigate('/admin')}
        transparent={isBroadcastSurface}
      />
    );
  }

  return <>{state.page}</>;
}

function ScorerStatusScreen({ title, message, onBack, transparent }: Readonly<{
  title: string; message?: string; onBack?: () => void; transparent?: boolean;
}>) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: transparent ? 'transparent' : '#0b1020',
      color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {message && <p style={{ marginTop: 8, opacity: 0.75 }}>{message}</p>}
        {onBack && (
          <button onClick={onBack} style={{
            marginTop: 16, padding: '8px 16px', borderRadius: 8, border: '1px solid #334155',
            background: '#111827', color: '#e2e8f0', cursor: 'pointer',
          }}>
            Back to Admin
          </button>
        )}
      </div>
    </div>
  );
}
