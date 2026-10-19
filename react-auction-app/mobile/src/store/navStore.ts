import { create } from 'zustand';

export type Tab = 'studio' | 'cameras' | 'setup' | 'tournament';
export type SetupSection = 'destinations' | 'video' | 'overlays' | 'bluetooth';

interface NavState {
  tab: Tab;
  setupSection: SetupSection;
  setTab: (tab: Tab) => void;
  setSetupSection: (section: SetupSection) => void;
  openSetup: (section: SetupSection) => void;
}

export const useNav = create<NavState>(set => ({
  tab: 'studio',
  setupSection: 'destinations',
  setTab: tab => set({ tab }),
  setSetupSection: setupSection => set({ setupSection }),
  openSetup: setupSection => set({ tab: 'setup', setupSection }),
}));
