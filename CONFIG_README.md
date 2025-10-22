# Configuration Guide

## Overview
All configuration settings have been moved to `config.js` for easy management and maintenance.

## Configuration File: `config.js`

### Google Sheets Configuration
```javascript
googleSheets: {
  sheetId: 'YOUR_SHEET_ID',
  apiKey: 'YOUR_API_KEY',
  ranges: {
    players: 'BCC Tournament Registration!A2:U',
    teams: 'Teams!A2:I',
    soldPlayers: 'Sold Players!A:I'
  }
}
```

### Webhook Configuration
```javascript
webhook: {
  url: 'YOUR_GOOGLE_APPS_SCRIPT_URL',
  updateDelay: 3000  // Milliseconds to wait before refreshing teams data
}
```

### Auction Settings
```javascript
auction: {
  basePrice: 100,
  bidIncrements: {
    small: 100,  // Press 1 key
    large: 200   // Press 2 key
  }
}
```

### Audio Settings
```javascript
audio: {
  volume: 1.0,  // 0.0 to 1.0
  files: {
    sold: './assets/sold.mp3',
    unsold: './assets/unsold.mp3'
  }
}
```

### Asset Paths
```javascript
assets: {
  backgroundImage: './assets/BG.jpg'
}
```

### Default Teams
Used as fallback if Google Sheets fetch fails:
```javascript
defaultTeams: [
  {
    name: 'Team A',
    logoUrl: '',
    playersBought: 0,
    totalPlayerThreshold: 11,
    remainingPlayers: 11,
    allocatedAmount: 100000,
    remainingPurse: 100000,
    highestBid: 0,
    captain: ''
  },
  // ... more teams
]
```

### Column Mappings
For reference and easy updates if sheet structure changes:
```javascript
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
  }
}
```

## How to Update Configuration

### 1. Change Google Sheets Connection
Edit `config.js`:
```javascript
googleSheets: {
  sheetId: 'YOUR_NEW_SHEET_ID',
  apiKey: 'YOUR_NEW_API_KEY',
  // ...
}
```

### 2. Update Webhook URL
After redeploying Google Apps Script:
```javascript
webhook: {
  url: 'YOUR_NEW_WEBHOOK_URL',
  // ...
}
```

### 3. Change Bid Increments
```javascript
auction: {
  basePrice: 200,  // Change starting bid
  bidIncrements: {
    small: 500,   // Now pressing 1 adds 500
    large: 1000   // Now pressing 2 adds 1000
  }
}
```

### 4. Adjust Audio Volume
```javascript
audio: {
  volume: 0.5,  // 50% volume
  // ...
}
```

### 5. Update Sheet Column Positions
If you rearrange columns in Google Sheets:
```javascript
columnMappings: {
  players: {
    name: 5,  // If name moved to column F
    // ... update other columns
  }
}
```

## Benefits of Centralized Configuration

✅ **Easy Updates**: Change settings in one place  
✅ **No Code Editing**: Update config without touching HTML  
✅ **Type Safety**: Frozen objects prevent accidental changes  
✅ **Documentation**: All settings clearly documented  
✅ **Maintainability**: Easier to understand and modify  
✅ **Reusability**: Same config structure for multiple environments  

## File Structure

```
auctionApp/
├── index.html           # Main application
├── config.js            # Configuration file ⭐
├── GoogleAppsScript.gs  # Backend webhook script
├── assets/
│   ├── BG.jpg          # Background image
│   ├── sold.mp3        # Sold sound
│   └── unsold.mp3      # Unsold sound
└── *.md                 # Documentation files
```

## Notes

- The CONFIG object is frozen to prevent runtime modifications
- All nested objects are also frozen for safety
- Config is loaded before the main script via separate `<script>` tag
- Changes to `config.js` require page reload to take effect
