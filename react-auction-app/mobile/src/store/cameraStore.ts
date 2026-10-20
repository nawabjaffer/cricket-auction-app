import { create } from 'zustand';
import { emptyRecordingSession, type CameraRecordingSession } from '../shared/cameraRecording';
import type { StudioProfile } from '../shared/studioProfile';
import type { EffectiveVideo } from '../services/effectiveConfig';

interface CameraState {
  session: CameraRecordingSession;
  ready: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  lastGalleryUri: string | null;
  profile: StudioProfile | null;
  activeMatchId: string | null;
  effective: EffectiveVideo | null;
  preparedSignature: string | null;
  zoomRange: { min: number; max: number };
  screenOrientation: 'portrait' | 'landscape';
  exposureRange: { min: number; max: number; step: number };
  patch: (partial: Partial<CameraState>) => void;
}

export const useCamera = create<CameraState>(set => ({
  session: emptyRecordingSession(), ready: false, busy: false, error: null, notice: null, lastGalleryUri: null,
  profile: null, activeMatchId: null, effective: null, preparedSignature: null,
  zoomRange: { min: 1, max: 1 }, exposureRange: { min: 0, max: 0, step: 1 },
  screenOrientation: 'portrait',
  patch: partial => set(partial),
}));