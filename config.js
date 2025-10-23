// Cricket Auction App Configuration
const CONFIG = {
  // Google Sheets Configuration
  googleSheets: {
    sheetId: '1-ZcLNOcy-iAKsLVQelBXOaXX6DhgPevy4kx1nvT9WCs',
    apiKey: 'AIzaSyC0sO4eAmfmi0QXqBUE912dpvVofuDrVHI',
    ranges: {
      players: 'BCC Tournament Registration!A2:V',  // Extended to include more stats
      teams: 'Teams!A2:I',
      soldPlayers: 'Sold Players!A:J'  // Updated to include Image URL column
    }
  },
  
  // Google Apps Script Webhook
  webhook: {
    url: 'https://script.google.com/macros/s/AKfycbxdrVwarvVo6k3UEEWytmfV-SXY-JRS0rr_WENWdfgRj9ZqN4nkD4F5zNxITeHy1Oizdw/exec',
    updateDelay: 3000 // Wait 3 seconds after saving before refreshing teams data
  },
  
  // Auction Settings
  auction: {
    basePrice: 100,
    bidIncrements: {
      small: 100,  // Press 1
      large: 200   // Press 2
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
  
  // Asset Paths
  assets: {
    backgroundImage: './assets/BG.jpg',
    placeholderMan: './assets/man.jpg'
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
      background: '2196F3',      // Background color (hex without #)
      color: 'fff',              // Text color (hex without #)
      bold: true,
      fontSize: 0.4
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
    }
  },
  
  // Keyboard Shortcuts / Hotkeys
  hotkeys: {
    nextPlayer: 'n',           // Next player
    markSold: 's',             // Mark player as sold
    markUnsold: 'u',           // Mark player as unsold
    jumpToPlayer: 'f',         // Jump to specific player
    showTeamsInfo: 'i',        // Show teams information overlay
    showTeamMenu: 't',         // Show team selection menu
    closeOverlay: 'Escape',    // Close any open overlay
    teamSlots: {
      team1: '1',              // Show Team 1 slots
      team2: '2',              // Show Team 2 slots
      team3: '3',              // Show Team 3 slots
      team4: '4',              // Show Team 4 slots
      team5: '5',              // Show Team 5 slots
      team6: '6',              // Show Team 6 slots
      team7: '7',              // Show Team 7 slots
      team8: '8'               // Show Team 8 slots
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
  columnMappings: {
    players: {
      id: 1,              // Column B
      imageUrl: 2,        // Column C
      name: 3,            // Column D
      dateOfBirth: 4,     // Column E
      role: 9,            // Column J
      matches: 18,        // Column S
      bowlingBest: 19,    // Column T
      battingBest: 20,    // Column U
      // Cricket Stats (columns 18-22)
      stats: {
        matches: 17,      // Column R
        innings: 18,      // Column S
        runs: 19,         // Column T
        wickets: 20,      // Column U
        average: 21       // Column V
      }
    },
    teams: {
      name: 0,                    // Column A
      logoUrl: 1,                 // Column B
      playersBought: 2,           // Column C
      remainingPlayers: 3,        // Column D
      totalPlayerThreshold: 4,    // Column E
      allocatedAmount: 5,         // Column F
      remainingPurse: 6,          // Column G
      highestBid: 7,              // Column H
      captain: 8                  // Column I
    },
    soldPlayers: {
      id: 0,              // Column A
      imageUrl: 1,        // Column B
      name: 2,            // Column C
      role: 3,            // Column D
      age: 4,             // Column E
      matches: 5,         // Column F
      bestFigures: 6,     // Column G
      soldAmount: 7,      // Column H
      teamName: 8,        // Column I
      soldDate: 9         // Column J
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
Object.freeze(CONFIG.audio);
Object.freeze(CONFIG.audio.files);
Object.freeze(CONFIG.assets);
Object.freeze(CONFIG.ui);
Object.freeze(CONFIG.ui.animations);
Object.freeze(CONFIG.ui.animations.soldOverlay);
Object.freeze(CONFIG.ui.animations.unsoldOverlay);
Object.freeze(CONFIG.ui.animations.imagePreload);
Object.freeze(CONFIG.ui.avatarPlaceholder);
Object.freeze(CONFIG.ui.breakpoints);
Object.freeze(CONFIG.ui.teamSlotsGrid);
Object.freeze(CONFIG.hotkeys);
Object.freeze(CONFIG.hotkeys.teamSlots);
Object.freeze(CONFIG.hotkeys.bidIncrements);
Object.freeze(CONFIG.columnMappings);
Object.freeze(CONFIG.columnMappings.players);
Object.freeze(CONFIG.columnMappings.teams);
Object.freeze(CONFIG.columnMappings.soldPlayers);
