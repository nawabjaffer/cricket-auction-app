import { create } from 'zustand';
import { useCamera } from './cameraStore';
import { recordingBusy } from '../shared/cameraRecording';

export type Tab = 'studio' | 'cameras' | 'setup' | 'tournament' | 'scenes';
export type SetupSection = 'destinations' | 'video' | 'overlays' | 'bluetooth';
export type Workspace = 'home' | 'recording' | 'streaming-role' | 'streaming' | 'connector' | 'scoring';

interface NavState {
  workspace: Workspace;
  tab: Tab;
  setupSection: SetupSection;
  studioClean: boolean;
  setTab: (tab: Tab) => void;
  setStudioClean: (clean: boolean) => void;
  setSetupSection: (section: SetupSection) => void;
  openSetup: (section: SetupSection) => void;
  setWorkspace: (workspace: Workspace) => void;
}

const recordingLocked = () => useCamera.getState().busy || recordingBusy(useCamera.getState().session);

export const useNav = create<NavState>(set => ({
  workspace: 'home',
  tab: 'studio',
  setupSection: 'destinations',
  studioClean: false,
  setTab: tab => { if (!recordingLocked()) set({ tab, workspace: 'streaming' }); },
  setStudioClean: studioClean => set({ studioClean }),
  setSetupSection: setupSection => set({ setupSection }),
  openSetup: setupSection => { if (!recordingLocked()) set({ tab: 'setup', setupSection, workspace: 'streaming' }); },
  setWorkspace: workspace => { if (workspace === 'recording' || !recordingLocked()) set({ workspace, studioClean: false, ...(workspace === 'streaming' ? { tab: 'studio' as const } : {}) }); },
}));
