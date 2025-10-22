// Cricket Auction App Configuration
const CONFIG = {
  // Google Sheets Configuration
  googleSheets: {
    sheetId: '1-ZcLNOcy-iAKsLVQelBXOaXX6DhgPevy4kx1nvT9WCs',
    apiKey: 'AIzaSyC0sO4eAmfmi0QXqBUE912dpvVofuDrVHI',
    ranges: {
      players: 'BCC Tournament Registration!A2:U',
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
    backgroundImage: './assets/BG.jpg'
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
      battingBest: 20     // Column U
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
Object.freeze(CONFIG.columnMappings);
Object.freeze(CONFIG.columnMappings.players);
Object.freeze(CONFIG.columnMappings.teams);
Object.freeze(CONFIG.columnMappings.soldPlayers);
