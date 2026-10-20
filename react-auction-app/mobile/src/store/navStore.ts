import { create } from 'zustand';

export type Tab = 'studio' | 'cameras' | 'setup' | 'tournament' | 'scenes';
export type SetupSection = 'destinations' | 'video' | 'overlays' | 'bluetooth';
export type Workspace = 'home' | 'streaming-role' | 'streaming' | 'connector' | 'scoring';

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

export const useNav = create<NavState>(set => ({
  workspace: 'home',
  tab: 'studio',
  setupSection: 'destinations',
  studioClean: false,
  setTab: tab => set({ tab, workspace: 'streaming' }),
  setStudioClean: studioClean => set({ studioClean }),
  setSetupSection: setupSection => set({ setupSection }),
  openSetup: setupSection => set({ tab: 'setup', setupSection, workspace: 'streaming' }),
  setWorkspace: workspace => set({ workspace, studioClean: false, ...(workspace === 'streaming' ? { tab: 'studio' as const } : {}) }),
}));
