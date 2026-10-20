import { useEffect, useState } from 'react';
import { realtimeSync } from '../services/realtimeSync';
import { getActiveTenant } from '../services/tenantPath';
import { mobileStudioService } from '../services/mobileStudioService';
import { DEFAULT_MOBILE_SCORING_OPTIONS, type MobileScoringOptions, type StudioGameType } from '../types/mobileStudio';

export function isMobileScoringView(): boolean {
  return typeof window !== 'undefined' && (navigator.userAgent.includes('NJSLiveStudio/Scoring') || new URLSearchParams(window.location.search).get('mobile') === '1');
}

export function useMobileScoringOptions(game: StudioGameType) {
  const mobile = isMobileScoringView();
  const tenantId = getActiveTenant();
  const [options, setOptions] = useState<MobileScoringOptions>({ ...DEFAULT_MOBILE_SCORING_OPTIONS });
  useEffect(() => {
    if (!mobile) return;
    let closed = false;
    let stop: (() => void) | undefined;
    void realtimeSync.ensureInitialized().then(() => {
      if (closed) return;
      const db = realtimeSync.getDatabase();
      if (!db) return;
      mobileStudioService.initialize(db);
      stop = mobileStudioService.subscribeScoringOptions(game, setOptions);
    }).catch(() => undefined);
    return () => { closed = true; stop?.(); };
  }, [game, mobile, tenantId]);
  return { mobile, options };
}