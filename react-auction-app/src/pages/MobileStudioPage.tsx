// ============================================================================
// MOBILE STUDIO PAGE — /:tenantSlug/:gameType/scorer/mobile-app
// Download the NJS Live Studio Android app, pair a phone with this tournament
// and edit the studio profile (quality, overlays, destinations) it syncs.
// `?download=1` starts the APK download immediately (admin Quick link).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IoArrowBack, IoLogoAndroid } from 'react-icons/io5';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { realtimeSync } from '../services/realtimeSync';
import { getActiveTenant } from '../services/tenantPath';
import { tenantService, type TenantRecord } from '../services/tenantService';
import { mobileStudioService } from '../services/mobileStudioService';
import ReleaseCard from '../components/MobileStudio/ReleaseCard';
import PairCard from '../components/MobileStudio/PairCard';
import ProfileEditor from '../components/MobileStudio/ProfileEditor';
import DevicesCard from '../components/MobileStudio/DevicesCard';
import ScoringOptionsCard from '../components/MobileStudio/ScoringOptionsCard';
import {
  STUDIO_GAME_LABELS, defaultStudioProfile,
  type StudioContext, type StudioDevicePresence, type StudioGameType, type StudioMatchSummary, type StudioProfile,
} from '../types/mobileStudio';
import '../components/MobileStudio/MobileStudio.css';

const sameProfile = (a: StudioProfile, b: StudioProfile) => JSON.stringify(a) === JSON.stringify(b);

export default function MobileStudioPage({ gameType }: Readonly<{ gameType: StudioGameType }>) {
  const navigate = useNavigate();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const autoDownload = query.get('download') === '1';

  const [ready, setReady] = useState(false);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [matches, setMatches] = useState<StudioMatchSummary[]>([]);
  const [matchId, setMatchId] = useState(query.get('matchId') ?? '');
  const [serverProfile, setServerProfile] = useState<StudioProfile>(() => defaultStudioProfile(gameType));
  const [draft, setDraft] = useState<StudioProfile>(() => defaultStudioProfile(gameType));
  const serverProfileRef = useRef(serverProfile);
  const [devices, setDevices] = useState<StudioDevicePresence[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const origin = window.location.origin;
  const tenantId = getActiveTenant();
  const slug = getTenantSlugFromPath(location.pathname) ?? tenant?.slug ?? tenantId;
  const dirty = !sameProfile(draft, serverProfile);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('Database unavailable');
        mobileStudioService.initialize(db);
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) retry = setTimeout(() => void init(), 800);
      }
    };
    void init();
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void tenantService.getTenant(tenantId).then(record => { if (!cancelled) setTenant(record); }).catch(() => undefined);
    void mobileStudioService.listMatches(gameType).then(list => { if (!cancelled) setMatches(list); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [ready, tenantId, gameType]);

  useEffect(() => {
    if (!ready) return;
    const unsubscribers = [
      mobileStudioService.subscribeProfile(
        gameType,
        profile => {
          setServerProfile(profile);
          // Adopt remote changes only while the admin has no unsaved edits.
          setDraft(current => (sameProfile(current, serverProfileRef.current) ? profile : current));
          serverProfileRef.current = profile;
        },
        () => setStatus({ kind: 'error', text: 'Could not load the studio profile.' }),
      ),
      mobileStudioService.subscribeDevices(gameType, setDevices),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [ready, gameType]);

  const context = useMemo<StudioContext>(
    () => ({ origin, tenantId, slug, game: gameType, matchId: matchId || undefined }),
    [origin, tenantId, slug, gameType, matchId],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const saved = await mobileStudioService.saveProfile(gameType, draft);
      setServerProfile(saved);
      setDraft(saved);
      setStatus({ kind: 'ok', text: 'Profile saved — phones pick it up automatically.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the profile.' });
    } finally {
      setSaving(false);
    }
  }, [draft, gameType]);

  return (
    <main className="mstudio">
      <header className="mstudio__bar">
        <button type="button" className="mstudio__icon-btn" onClick={() => navigate(`/${gameType}/scorer/admin`)} aria-label="Back to the scorer admin">
          <IoArrowBack size={20} aria-hidden="true" />
        </button>
        <div>
          <h1><IoLogoAndroid size={22} aria-hidden="true" /> NJS Live Studio for Android</h1>
          <p>{STUDIO_GAME_LABELS[gameType]}{tenant ? ` · ${tenant.name}` : ''} — 1080p / 4K hardware streaming, overlays, Bluetooth gear and multi-camera over Wi-Fi.</p>
        </div>
      </header>

      <div className="mstudio__layout">
        <ReleaseCard origin={origin} autoDownload={autoDownload} />
        {ready && (
          <>
            <PairCard origin={origin} tenantId={tenantId} slug={slug} game={gameType} matches={matches} matchId={matchId} onMatchChange={setMatchId} />
            <ProfileEditor
              profile={draft}
              context={context}
              dirty={dirty}
              saving={saving}
              onChange={setDraft}
              onSave={() => void save()}
              onReset={() => setDraft(defaultStudioProfile(gameType))}
            />
            <DevicesCard devices={devices} />
            <ScoringOptionsCard gameType={gameType} />
          </>
        )}
        {!ready && <p className="mstudio__muted">Connecting to the tournament…</p>}
      </div>

      {status && <div className={`mstudio__toast mstudio__toast--${status.kind}`} role="status">{status.text}</div>}
    </main>
  );
}
