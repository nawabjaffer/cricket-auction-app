// ============================================================================
// CRICKET AUCTION APP - CONFIGURATION
// Centralized configuration with multi-tenancy support
// ============================================================================

import type { AppConfig, TournamentConfig, Theme } from '../types';

// Default Theme Configuration
const defaultTheme: Theme = {
  name: 'Classic Auction',
  background: '/assets/BG.jpg',
  colors: {
    primary: '#2196F3',
    secondary: '#1976D2',
    accent: '#1565C0',
    success: '#4CAF50',
    warning: '#ff9800',
    danger: '#f44336',
    text: '#ffffff',
    textSecondary: '#aaa',
  },
  animations: {
    enabled: false,
    cornerGifs: undefined,
    waveGifs: undefined,
  },
  table: {
    headerGradient: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
    rowBackground: 'rgba(255, 255, 255, 0.03)',
    rowBackgroundHover: 'rgba(33, 150, 243, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
};

// Season 6 Theme Configuration
const season6Theme: Theme = {
  name: 'BCC Season 6',
  background: '/assets/BG-1.jpg',
  seasonLogo: '/BCC_Logo.png',
  colors: {
    primary: '#FFD700',
    secondary: '#FF6B35',
    accent: '#C41E3A',
    success: '#ffffff',
    warning: '#FF9F1C',
    danger: '#E63946',
    text: '#ffffff',
    textSecondary: '#d4af37',
  },
  animations: {
    enabled: true,
    cornerGifs: {
      leftTop: '/extras/left-top-right-bottom-corner.gif',
      rightTop: '/extras/bottom-wave-top-right.gif',
      leftBottom: '/extras/left-bottom-right-top-corner.gif',
      rightBottom: '/extras/arrow-movements-gif.gif',
    },
    waveGifs: {
      topRight: '/extras/bottom-wave-top-right.gif',
      arrows: '/extras/arrow-movements-gif.gif',
    },
  },
  table: {
    headerGradient: 'linear-gradient(135deg, #FFD700 0%, #FF6B35 50%, #C41E3A 100%)',
    rowBackground: 'rgba(255, 215, 0, 0.05)',
    rowBackgroundHover: 'rgba(255, 107, 53, 0.2)',
    borderColor: 'rgba(255, 215, 0, 0.2)',
    glowEffect: '0 0 20px rgba(255, 215, 0, 0.3)',
  },
};

// Base Application Configuration
export const defaultConfig: AppConfig = {
  googleSheets: {
    sheetId: import.meta.env.VITE_GOOGLE_SHEET_ID || '1m7y5jM7RyQkV5sz-wV_McfiykQf4Nvn4ydUZbpCITy8',
    apiKey: import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyC0sO4eAmfmi0QXqBUE912dpvVofuDrVHI',
    ranges: {
      players: 'BCC Tournament Registration!A2:Y',
      teams: 'Teams!A2:I',
      soldPlayers: 'Sold Players!A:J',
      unsoldPlayers: 'Unsold Players!A:J',
    },
  },
  webhook: {
    url: import.meta.env.VITE_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbwbjnz8HR5kfS4WzvSPUxoSKvlEiqZLQ4HioHSoy2T884IQSczO2uGPNMWDEOwARaB0Jg/exec',
    updateDelay: 3000,
  },
  auction: {
    basePrice: 100,
    bidIncrements: {
      default: 100,
      adjustmentStep: 50,
      minimum: 50,
      maximum: 1000,
    },
    rules: {
      minimumPlayerBasePrice: 100,
      safeFundBufferPercent: 1.5,
      underAgeLimit: 18,
      maxUnderAgePlayers: 2,
    },
    undo: {
      historySize: 99,
      enabled: true,
    },
  },
  audio: {
    volume: 1.0,
    files: {
      sold: '/assets/sold.mp3',
      unsold: '/assets/unsold.mp3',
      coinShake: '/assets/coinsshake.mp3',
    },
  },
  notifications: {
    showTopNotifications: false,
    showBidIncrementInfo: false,
    useColorFeedback: true,
  },
  selectionMode: {
    type: 'random',
    animation: {
      coinJarShakeDuration: 3000,
      coinRevealDuration: 2500,
      totalAnimationTime: 5000,
    },
  },
  assets: {
    backgroundImage: '/assets/BG.jpg',
    placeholderMan: '/assets/man.jpg',
  },
  theme: {
    active: 'style-2',
    'style-1': defaultTheme,
    'style-2': season6Theme,
  },
  ui: {
    animations: {
      soldOverlay: {
        showDelay: 50,
        hammerStrike: 150,
        impactDelay: 780,
        impactDuration: 300,
        totalDuration: 4000,
      },
      unsoldOverlay: {
        xAnimationDelay: 100,
        textAnimationDelay: 400,
        subtextDelay: 700,
        totalDuration: 3000,
        inputDelay: 500,
      },
      imagePreload: {
        startDelay: 100,
      },
    },
    avatarPlaceholder: {
      baseUrl: 'https://ui-avatars.com/api/',
      cardSize: 450,
      teamSlotSize: 300,
      teamStatusSize: 80,
      background: '2196F3',
      color: 'fff',
      bold: true,
      fontSize: 0.4,
      teamStatusFontSize: 0.5,
    },
    breakpoints: {
      desktop: 1600,
      laptop: 1200,
      tablet: 900,
      mobile: 768,
      small: 600,
    },
    teamSlotsGrid: {
      maxPlayersPer6Cols: 12,
    },
    teamStatsThresholds: {
      purseSpent: { warning: 0.8, danger: 0.9 },
      remainingPurse: { warning: 2000, danger: 500 },
      remainingPlayers: { warning: 2, danger: 0 },
    },
  },
  hotkeys: {
    nextPlayer: 'n',
    markSold: 's',
    markUnsold: 'u',
    jumpToPlayer: 'f',
    showTeamsInfo: 'i',
    showTeamMenu: 'm',
    showHotkeyHelper: 'h',
    toggleFullscreen: ' ',
    closeOverlay: 'Escape',
    teamSlotsPrefix: 't',
    teamSlots: {
      team1: 't1',
      team2: 't2',
      team3: 't3',
      team4: 't4',
      team5: 't5',
      team6: 't6',
      team7: 't7',
      team8: 't8',
    },
    teamBidding: {
      team1: '1',
      team2: '2',
      team3: '3',
      team4: '4',
      team5: '5',
      team6: '6',
      team7: '7',
      team8: '8',
      team9: '9',
    },
    bidIncrements: {
      small: 'q',
      large: 'w',
    },
  },
  defaultTeams: [
    { id: 'team-a', name: 'Team A', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: '', underAgePlayers: 0 },
    { id: 'team-b', name: 'Team B', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: '', underAgePlayers: 0 },
    { id: 'team-c', name: 'Team C', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: '', underAgePlayers: 0 },
    { id: 'team-d', name: 'Team D', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: '', underAgePlayers: 0 },
  ],
  columnMappings: {
    players: {
      timestamp: 0,
      basePrice: 1,
      id: 2,
      imageUrl: 3,
      name: 4,
      dateOfBirth: 5,
      bloodGroup: 6,
      phoneNumber: 7,
      jerseySize: 8,
      shoeSize: 9,
      role: 10,
      batsmanType: 11,
      battingOrder: 12,
      bowlingHand: 13,
      battingTypeAR: 14,
      battingOrderAR: 15,
      bowlingStyleAR: 16,
      bowlingHandAR: 17,
      cricHeroesLink: 18,
      matches: 19,
      wickets: 20,
      runs: 21,
      battingBest: 22,
      bowlingBest: 23,
      declaration: 24,
      stats: {
        matches: 19,
        innings: 19,
        runs: 21,
        wickets: 20,
        average: 19,
      },
    },
    teams: {
      name: 0,
      logoUrl: 1,
      playersBought: 2,
      underAgePlayers: 3,
      remainingPlayers: 4,
      totalPlayerThreshold: 5,
      allocatedAmount: 6,
      remainingPurse: 7,
      highestBid: 8,
      captain: 9,
    },
    soldPlayers: {
      id: 0,
      name: 1,
      role: 2,
      age: 3,
      matches: 4,
      bestFigures: 5,
      teamName: 6,
      soldAmount: 7,
      basePrice: 8,
      imageUrl: 9,
    },
    unsoldPlayers: {
      id: 0,
      name: 1,
      role: 2,
      age: 3,
      matches: 4,
      bestFigures: 5,
      basePrice: 6,
      round: 7,
      unsoldDate: 8,
      imageUrl: 9,
    },
  },
};

// Tournament Configurations for Multi-tenancy
export const tournamentConfigs: Record<string, TournamentConfig> = {
  'bcc-season-6': {
    id: 'bcc-season-6',
    name: 'BCC Cricket League',
    season: 'Season 6',
    venue: 'Main Stadium',
    logoUrl: '/BCC_Logo.png',
    theme: 'style-2',
    googleSheets: defaultConfig.googleSheets,
    webhook: defaultConfig.webhook,
    auction: defaultConfig.auction,
  },
  'corporate-league-2025': {
    id: 'corporate-league-2025',
    name: 'Corporate Cricket League',
    season: '2025',
    venue: 'Corporate Park',
    theme: 'style-1',
    googleSheets: {
      sheetId: '', // To be configured per tournament
      apiKey: '',
      ranges: defaultConfig.googleSheets.ranges,
    },
    webhook: {
      url: '',
      updateDelay: 3000,
    },
    auction: defaultConfig.auction,
  },
};

// Get configuration for specific tournament
export function getTournamentConfig(tournamentId: string): TournamentConfig | null {
  return tournamentConfigs[tournamentId] || null;
}

// Merge tournament config with base config
export function getFullConfig(tournamentId?: string): AppConfig {
  if (!tournamentId) return defaultConfig;
  
  const tournamentConfig = getTournamentConfig(tournamentId);
  if (!tournamentConfig) return defaultConfig;
  
  return {
    ...defaultConfig,
    googleSheets: tournamentConfig.googleSheets,
    webhook: tournamentConfig.webhook,
    auction: tournamentConfig.auction,
    theme: {
      ...defaultConfig.theme,
      active: tournamentConfig.theme,
    },
  };
}

// Export active config (can be switched at runtime)
export let activeConfig = defaultConfig;

export function setActiveConfig(config: AppConfig): void {
  activeConfig = config;
}

export function getActiveTheme(): Theme {
  const activeThemeKey = activeConfig.theme.active;
  return activeConfig.theme[activeThemeKey] as Theme || defaultTheme;
}
