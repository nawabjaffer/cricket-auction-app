// Cricket Auction App Configuration
const CONFIG = {
  // Google Sheets Configuration
  googleSheets: {
    sheetId: '1m7y5jM7RyQkV5sz-wV_McfiykQf4Nvn4ydUZbpCITy8',
    apiKey: 'AIzaSyC0sO4eAmfmi0QXqBUE912dpvVofuDrVHI',
    ranges: {
      players: 'BCC Tournament Registration!A2:Y',  // Updated to include all columns (A-Y = 25 columns)
      teams: 'Teams!A2:I',
      soldPlayers: 'Sold Players!A:J',  // Updated to include Image URL column
      unsoldPlayers: 'Unsold Players!A:J'  // Track unsold players for second round
    }
  },
      active: 'style-2',  // Active theme: 'style-1' (default) or 'style-2' (season-6)
  // Google Apps Script Webhook
  webhook: {
    url: 'https://script.google.com/macros/s/AKfycbwbjnz8HR5kfS4WzvSPUxoSKvlEiqZLQ4HioHSoy2T884IQSczO2uGPNMWDEOwARaB0Jg/exec',
    updateDelay: 3000 // Wait 3 seconds after saving before refreshing teams data
  },
  
  // Auction Settings
  // NOTE: These rules are dynamically read by AUCTION_RULES object using getters
  // Changes to these values will affect validation in real-time (if config is unfrozen)
  auction: {
    basePrice: 100,              // Starting price for all players
    bidIncrements: {
      default: 100,              // Default increment when player starts or after sold
      adjustmentStep: 50,        // Amount to increase/decrease with Q/W keys
      minimum: 50,               // Minimum allowed increment
      maximum: 1000              // Maximum allowed increment
    },
    rules: {
      // DYNAMIC AUCTION RULES - These are read via getters for real-time updates
      minimumPlayerBasePrice: 100,  // Minimum base price for any player (used in RULE_001, RULE_002, RULE_006)
      safeFundBufferPercent: 1.5,   // 50% buffer for safe fund threshold (RULE_006: 1.5 = 150% of minimum)
      underAgeLimit: 18,            // Age limit for under-age player restriction (RULE_009)
      maxUnderAgePlayers: 2         // Maximum number of under-age players per team (RULE_009)
      // RULE_001: Remaining Budget Constraint - Team must retain enough to complete roster
      // RULE_002: Dynamic Max Bid = remainingPurse - (remainingPlayers - 1) * minimumPlayerBasePrice
      // RULE_003: Total Budget Cap - Cannot exceed allocatedAmount
      // RULE_004: Player Count Limit - Cannot exceed totalPlayerThreshold
      // RULE_005: Minimum Participation Balance - Must have at least playerBasePrice remaining
      // RULE_006: Safe Fund Threshold - Should maintain buffer of (remainingPlayers - 1) * minimumPlayerBasePrice * safeFundBufferPercent
      // RULE_009: Under-Age Player Limit - Maximum number of under-age players per team
    },
    undo: {
      historySize: 99,              // Number of recent bids to keep in undo history
      enabled: true                // Enable/disable undo functionality
    }
  },
  
  // Audio Settings
  audio: {
    volume: 1.0,
    files: {
      sold: './assets/sold.mp3',
      unsold: './assets/unsold.mp3'
    }
  },
  
  // Notification & UI Display Settings
  notifications: {
    showTopNotifications: false,      // true = show popup notifications at top, false = use color feedback only
    showBidIncrementInfo: false,       // true = show bid increment info at bottom right, false = hide
    useColorFeedback: true            // true = use color changes in bid display instead of popups
  },
  
  // Player Selection Mode
  selectionMode: {
    type: 'random',               // 'sequential' = normal next player, 'random' = coin jar random selection
    animation: {
      coinJarShakeDuration: 3000,     // How long coins shake (ms)
      coinRevealDuration: 2500,       // How long to show revealed coin (ms)
      totalAnimationTime: 5000        // Total time before showing player (ms)
    }
  },
  
  // Asset Paths
  assets: {
    backgroundImage: './assets/BG.jpg',
    placeholderMan: './assets/man.jpg',
    getActiveThemeBackground: function() {
      return CONFIG.theme[CONFIG.theme.active].background;
    }
  },

  // Theme Configuration
  theme: {
    active: 'style-2',  // Active theme: 'style-1' (default) or 'style-2' (season-6)
    
    // Style-1: Default/Original Design
    'style-1': {
      name: 'Classic Auction',
      background: './assets/BG.jpg',
      colors: {
        primary: '#2196F3',
        secondary: '#1976D2',
        accent: '#1565C0',
        success: '#4CAF50',
        warning: '#ff9800',
        danger: '#f44336',
        text: '#ffffff',
        textSecondary: '#aaa'
      },
      table: {
        headerGradient: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
        rowBackground: 'rgba(255, 255, 255, 0.03)',
        rowBackgroundHover: 'rgba(33, 150, 243, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.1)'
      }
    },
    
    // Style-2: Season 6 Themed Design
    'style-2': {
      name: 'BCC Season 6',
      background: './assets/BG-1.jpg',
      seasonLogo: './assets/BCC_Logo.png',
      colors: {
        primary: '#FFD700',      // Gold for season 6
        secondary: '#FF6B35',    // Orange accent
        accent: '#C41E3A',       // Deep red
        success: '#00D084',
        warning: '#FF9F1C',
        danger: '#E63946',
        text: '#ffffff',
        textSecondary: '#d4af37'
      },
      table: {
        headerGradient: 'linear-gradient(135deg, #FFD700 0%, #FF6B35 50%, #C41E3A 100%)',
        rowBackground: 'rgba(255, 215, 0, 0.05)',
        rowBackgroundHover: 'rgba(255, 107, 53, 0.2)',
        borderColor: 'rgba(255, 215, 0, 0.2)',
        glowEffect: '0 0 20px rgba(255, 215, 0, 0.3)'
      }
    }
  },
  
  // UI/UX Settings
  ui: {
    // Animation Timings (in milliseconds)
    animations: {
      soldOverlay: {
        showDelay: 50,           // Delay before showing overlay
        hammerStrike: 150,       // Delay before hammer animation
        impactDelay: 780,        // Delay before impact/stamp (at ~45% of 1.4s)
        impactDuration: 300,     // Duration of screen shake
        totalDuration: 4000      // Total time before showing input
      },
      unsoldOverlay: {
        xAnimationDelay: 100,    // Delay before X animation
        textAnimationDelay: 400, // Delay before text animation
        subtextDelay: 700,       // Delay before subtext
        totalDuration: 3000,     // Total time before showing input
        inputDelay: 500          // Extra delay before showing input
      },
      imagePreload: {
        startDelay: 100          // Delay before starting image preloading
      }
    },
    
    // Avatar/Placeholder Settings
    avatarPlaceholder: {
      baseUrl: 'https://ui-avatars.com/api/',
      cardSize: 450,             // Size for main player card
      teamSlotSize: 300,         // Size for team slots view
      teamStatusSize: 80,        // Size for team status indicator circles
      background: '2196F3',      // Background color (hex without #)
      color: 'fff',              // Text color (hex without #)
      bold: true,
      fontSize: 0.4,
      teamStatusFontSize: 0.5    // Font size for team status indicator
    },
    
    // Grid Layout Breakpoints (in pixels)
    breakpoints: {
      desktop: 1600,    // Desktop and larger
      laptop: 1200,     // Laptop screens
      tablet: 900,      // Tablet screens
      mobile: 768,      // Mobile devices
      small: 600        // Small mobile devices
    },
    
    // Team Slots Grid Configuration
    teamSlotsGrid: {
      maxPlayersPer6Cols: 12,   // Max players for 6-column grid
      // Above this number, use 4-column grid
    },
    
    // Team Statistics Warning Thresholds
    teamStatsThresholds: {
      purseSpent: {
        warning: 0.8,           // Warning when spent > 80% of allocated
        danger: 0.9             // Danger when spent > 90% of allocated
      },
      remainingPurse: {
        warning: 2000,          // Warning when remaining < ₹2000
        danger: 500             // Danger when remaining < ₹500
      },
      remainingPlayers: {
        warning: 2,             // Warning when remaining players <= 2
        danger: 0               // Danger when no remaining players
      }
    }
  },
  
  // Keyboard Shortcuts / Hotkeys
  hotkeys: {
    nextPlayer: 'n',           // Next player
    markSold: 's',             // Mark player as sold (auto-assigns to last bidding team)
    markUnsold: 'u',           // Mark player as unsold
    jumpToPlayer: 'f',         // Jump to specific player
    showTeamsInfo: 'i',        // Show teams information overlay
    showTeamMenu: 'm',         // Show team selection menu (changed from 't')
    showHotkeyHelper: 'h',     // Show hotkey helper overlay
    toggleFullscreen: ' ',     // Toggle fullscreen (spacebar)
    closeOverlay: 'Escape',    // Close any open overlay
    teamSlotsPrefix: 't',      // Prefix for team slots (t+1, t+2, etc.)
    teamSlots: {
      team1: 't1',             // Show Team 1 slots (Press t then 1)
      team2: 't2',             // Show Team 2 slots
      team3: 't3',             // Show Team 3 slots
      team4: 't4',             // Show Team 4 slots
      team5: 't5',             // Show Team 5 slots
      team6: 't6',             // Show Team 6 slots
      team7: 't7',             // Show Team 7 slots
      team8: 't8'              // Show Team 8 slots
    },
    teamBidding: {
      team1: '1',              // Team 1 places bid
      team2: '2',              // Team 2 places bid
      team3: '3',              // Team 3 places bid
      team4: '4',              // Team 4 places bid
      team5: '5',              // Team 5 places bid
      team6: '6',              // Team 6 places bid
      team7: '7',              // Team 7 places bid
      team8: '8',              // Team 8 places bid
      team9: '9'               // Team 9 places bid (if exists)
    },
    bidIncrements: {
      small: 'q',              // Add small bid increment (₹100)
      large: 'w'               // Add large bid increment (₹200)
    }
  },
  
  // Default Team Settings (used if fetch fails)
  defaultTeams: [
    {name: 'Team A', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: ''},
    {name: 'Team B', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: ''},
    {name: 'Team C', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: ''},
    {name: 'Team D', logoUrl: '', playersBought: 0, totalPlayerThreshold: 11, remainingPlayers: 11, allocatedAmount: 100000, remainingPurse: 100000, highestBid: 0, captain: ''}
  ],
  
  // Column Mappings (for reference)
  // New BCC Registration Table Structure (25 columns):
  // 0=Timestamp, 1=Base Price, 2=Id, 3=Upload Photo, 4=Full Name, 5=DOB, 6=Blood Group,
  // 7=Phone Number, 8=Jersey Size, 9=Shoe Size, 10=Cricket Role, 11=Batsman Type,
  // 12=Batting Order Preference, 13=Bowling Hand, 14=Batting Type (AR), 15=Batting Order (AR),
  // 16=Bowling Style (AR), 17=Bowling Hand (AR), 18=CricHeroes Link, 19=Matches Played,
  // 20=Total Wickets, 21=Career runs, 22=Batting Best Figures, 23=Bowling Best Figures, 24=Declaration
  columnMappings: {
    players: {
      timestamp: 0,       // Column A - Timestamp
      basePrice: 1,       // Column B - Base Price
      id: 2,              // Column C - Id
      imageUrl: 3,        // Column D - Upload Photo
      name: 4,            // Column E - Full Name
      dateOfBirth: 5,     // Column F - Date of Birth (DOB)
      bloodGroup: 6,      // Column G - Blood Group
      phoneNumber: 7,     // Column H - Phone Number
      jerseySize: 8,      // Column I - Jersey Size
      shoeSize: 9,        // Column J - Shoe Size (India/UK)
      role: 10,           // Column K - Cricket Role
      batsmanType: 11,    // Column L - Batsman Type
      battingOrder: 12,   // Column M - Batting Order Preference
      bowlingHand: 13,    // Column N - Bowling Hand
      battingTypeAR: 14,  // Column O - Batting Type For All Rounder
      battingOrderAR: 15, // Column P - Batting Order Preference For All Rounder
      bowlingStyleAR: 16, // Column Q - Bowling Style For All Rounder
      bowlingHandAR: 17,  // Column R - Bowling Hand For All Rounder
      cricHeroesLink: 18, // Column S - CricHeroes Link
      matches: 19,        // Column T - Matches Played
      wickets: 20,        // Column U - Total Wickets
      runs: 21,           // Column V - Career runs
      battingBest: 22,    // Column W - Batting Best Figures
      bowlingBest: 23,    // Column X - Bowling Best Figures
      declaration: 24,    // Column Y - Declaration / Signature
      // Legacy stats mapping (for backward compatibility)
      stats: {
        matches: 19,      // Column T - Matches Played
        innings: 19,      // Using matches as innings (not available)
        runs: 21,         // Column V - Career runs
        wickets: 20,      // Column U - Total Wickets
        average: 19       // Using matches as average (not available)
      }
    },
    teams: {
      name: 0,                    // Column A
      logoUrl: 1,                 // Column B
      playersBought: 2,           // Column C
      underAgePlayers: 3,         // Column D - U19 Player Bought
      remainingPlayers: 4,        // Column E
      totalPlayerThreshold: 5,    // Column F
      allocatedAmount: 6,         // Column G
      remainingPurse: 7,          // Column H
      highestBid: 8,              // Column I
      captain: 9                  // Column J
    },
    soldPlayers: {
      id: 0,              // Column A
      name: 1,            // Column C
      role: 2,            // Column D
      age: 3,             // Column E
      matches: 4,         // Column F
      bestFigures: 5,     // Column G
      teamName: 6,        // Column H
      soldAmount: 7,      // Column I
      basePrice: 8,
      imageUrl: 9,       // Column J
    },
    unsoldPlayers: {
      id: 0,              // Column A
      name: 1,            // Column B
      role: 2,            // Column C
      age: 3,             // Column D
      matches: 4,         // Column E
      bestFigures: 5,     // Column F
      basePrice: 6,       // Column G
      round: 7,           // Column H - "Round 1" or "Round 2 - Final"
      unsoldDate: 8,      // Column I
      imageUrl: 9,       // Column J
    }
  }
};

// Freeze the config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.googleSheets);
Object.freeze(CONFIG.googleSheets.ranges);
Object.freeze(CONFIG.webhook);
Object.freeze(CONFIG.auction);
Object.freeze(CONFIG.auction.bidIncrements);
Object.freeze(CONFIG.auction.rules);
Object.freeze(CONFIG.audio);
Object.freeze(CONFIG.audio.files);
Object.freeze(CONFIG.notifications);
Object.freeze(CONFIG.selectionMode);
Object.freeze(CONFIG.selectionMode.animation);
Object.freeze(CONFIG.assets);
Object.freeze(CONFIG.ui);
Object.freeze(CONFIG.ui.animations);
Object.freeze(CONFIG.ui.animations.soldOverlay);
Object.freeze(CONFIG.ui.animations.unsoldOverlay);
Object.freeze(CONFIG.ui.animations.imagePreload);
Object.freeze(CONFIG.ui.avatarPlaceholder);
Object.freeze(CONFIG.ui.breakpoints);
Object.freeze(CONFIG.ui.teamSlotsGrid);
Object.freeze(CONFIG.ui.teamStatsThresholds);
Object.freeze(CONFIG.ui.teamStatsThresholds.purseSpent);
Object.freeze(CONFIG.ui.teamStatsThresholds.remainingPurse);
Object.freeze(CONFIG.ui.teamStatsThresholds.remainingPlayers);
Object.freeze(CONFIG.hotkeys);
Object.freeze(CONFIG.hotkeys.teamSlots);
Object.freeze(CONFIG.hotkeys.teamBidding);
Object.freeze(CONFIG.hotkeys.bidIncrements);
Object.freeze(CONFIG.columnMappings);
Object.freeze(CONFIG.columnMappings.players);
Object.freeze(CONFIG.columnMappings.teams);
Object.freeze(CONFIG.columnMappings.soldPlayers);
// Freeze theme configuration for safety
Object.freeze(CONFIG.theme);
Object.freeze(CONFIG.theme['style-1']);
Object.freeze(CONFIG.theme['style-1'].colors);
Object.freeze(CONFIG.theme['style-1'].animations || {});
Object.freeze(CONFIG.theme['style-1'].table);
Object.freeze(CONFIG.theme['style-2']);
Object.freeze(CONFIG.theme['style-2'].colors);
Object.freeze(CONFIG.theme['style-2'].table);
