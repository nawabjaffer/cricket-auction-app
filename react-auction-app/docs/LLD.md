# Cricket Auction App - Low Level Design (LLD)

## 1. Project Structure

```
react-auction-app/
├── public/
│   └── assets/              # Static assets (images, audio)
├── src/
│   ├── components/          # UI Components
│   │   ├── ActionButtons/
│   │   ├── BidDisplay/
│   │   ├── CoinJar/
│   │   ├── Header/
│   │   ├── Notification/
│   │   ├── Overlays/
│   │   ├── PlayerCard/
│   │   ├── TeamSelector/
│   │   └── index.ts
│   ├── config/              # Configuration
│   │   └── index.ts
│   ├── hooks/               # Custom React Hooks
│   │   ├── useAuction.ts
│   │   ├── useData.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useTheme.ts
│   │   └── index.ts
│   ├── services/            # Business Logic Services
│   │   ├── auctionRules.ts
│   │   ├── audio.ts
│   │   ├── googleSheets.ts
│   │   ├── webhook.ts
│   │   └── index.ts
│   ├── store/               # State Management
│   │   ├── auctionStore.ts
│   │   └── index.ts
│   ├── types/               # TypeScript Definitions
│   │   └── index.ts
│   ├── App.tsx              # Root Component
│   ├── main.tsx             # Entry Point
│   └── index.css            # Global Styles
├── docs/                    # Documentation
│   ├── HLD.md
│   └── LLD.md
└── package.json
```

## 2. Type Definitions

### 2.1 Core Types

```typescript
// Player type representing a cricket player
interface Player {
  id: string;                    // Unique identifier (e.g., "P001")
  imageUrl: string;              // Profile image URL
  name: string;                  // Full name
  role: PlayerRole;              // Playing role
  age: number | null;            // Age in years
  matches: string;               // Matches played
  runs: string;                  // Total runs
  wickets: string;               // Total wickets
  battingBestFigures: string;    // Best batting figures
  bowlingBestFigures: string;    // Best bowling figures
  basePrice: number;             // Base auction price (in Lakhs)
  dateOfBirth: string;           // DOB string
}

type PlayerRole = 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicket-Keeper';

// Team type representing an auction team
interface Team {
  name: string;                  // Team name
  logoUrl: string;               // Team logo URL
  playersBought: number;         // Current player count
  totalPlayerThreshold: number;  // Maximum player limit
  remainingPlayers: number;      // Slots remaining
  allocatedAmount: number;       // Total budget
  remainingPurse: number;        // Current available budget
  highestBid: number;            // Highest bid made
  captain: string;               // Team captain name
  underAgePlayers: number;       // Count of under-age players
}
```

### 2.2 State Types

```typescript
interface AuctionState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  bidHistory: BidHistory[];
  isAuctionActive: boolean;
  isPaused: boolean;
}

interface BidHistory {
  teamName: string;
  amount: number;
  timestamp: string;
}
```

## 3. Services Layer

### 3.1 AuctionRulesService

**Purpose**: Validates bids and enforces auction rules

**Key Methods**:
```typescript
class AuctionRulesService {
  constructor(team: Team, allTeams: Team[])
  
  // Calculate maximum bid for the team
  calculateMaxBid(): number
  
  // Validate a bid amount
  validateBid(bidAmount: number, player: Player): ValidationResult
  
  // Get team eligibility status
  getTeamStatus(): TeamStatus
  
  // Get restriction message for ineligible team
  getBidRestrictionMessage(): string | null
}
```

**Validation Rules**:
| Rule ID | Description | Formula |
|---------|-------------|---------|
| RULE_001 | Remaining budget check | `bidAmount <= remainingPurse` |
| RULE_002 | Total budget cap | `bidAmount <= allocatedAmount` |
| RULE_003 | Player count limit | `playersBought < totalPlayerThreshold` |
| RULE_004 | Minimum balance for remaining players | `(remainingPurse - bidAmount) >= (remainingPlayers - 1) * basePrice` |
| RULE_005 | Safe fund threshold | `remainingPurse >= safeFundThreshold` |
| RULE_006 | Under-age player limit | `underAgePlayers < maxUnderAgePlayers` |
| RULE_009 | Team-specific restrictions | Custom team rules |

### 3.2 GoogleSheetsService

**Purpose**: Fetches data from Google Sheets API

**Key Methods**:
```typescript
class GoogleSheetsService {
  // Fetch all available players
  fetchPlayers(excludeSoldIds: string[]): Promise<Player[]>
  
  // Fetch all teams
  fetchTeams(): Promise<Team[]>
  
  // Fetch sold players
  fetchSoldPlayers(): Promise<{ ids: string[], players: SoldPlayer[] }>
  
  // Fetch unsold players (Round 1)
  fetchUnsoldPlayers(): Promise<{ ids: string[], players: UnsoldPlayer[] }>
  
  // Clear cache
  clearCache(key?: string): void
}
```

**Caching Strategy**:
- 30-second cache duration for API responses
- Cache invalidation on manual refresh
- React Query handles stale data management

### 3.3 WebhookService

**Purpose**: Sends auction updates to Google Apps Script

**Endpoints**:
| Action | Description |
|--------|-------------|
| `updateSoldPlayer` | Mark player as sold |
| `updateUnsoldPlayer` | Mark player as unsold |
| `moveUnsoldToSold` | Move unsold to sold (Round 2) |
| `clearAuction` | Reset auction data |

### 3.4 AudioService

**Purpose**: Manages sound effects

**Audio Files**:
- `sold.mp3` - Player sold sound
- `unsold.mp3` - Player unsold sound
- `coinsshake.mp3` - Random selection animation

## 4. State Management (Zustand Store)

### 4.1 Store Structure

```typescript
interface AuctionStore {
  // Player pools
  availablePlayers: Player[];
  soldPlayers: SoldPlayer[];
  unsoldPlayers: UnsoldPlayer[];
  
  // Teams
  teams: Team[];
  selectedTeam: Team | null;
  
  // Current auction
  currentPlayer: Player | null;
  currentBid: number;
  bidHistory: BidHistory[];
  
  // UI state
  isLoading: boolean;
  notification: Notification | null;
  activeOverlay: OverlayType | null;
  
  // Selection
  selectionMode: 'sequential' | 'random';
  currentRound: number;
}
```

### 4.2 Key Actions

| Action | Description |
|--------|-------------|
| `selectPlayer` | Set current player for auction |
| `selectNextPlayer` | Auto-select next player |
| `selectTeam` | Choose bidding team |
| `incrementBid` | Increase current bid |
| `decrementBid` | Decrease current bid |
| `markAsSold` | Finalize player sale |
| `markAsUnsold` | Mark player as unsold |
| `startRound2` | Begin Round 2 auction |

### 4.3 Persistence

```typescript
// Persisted state via zustand/persist
partialize: (state) => ({
  soldPlayers: state.soldPlayers,
  unsoldPlayers: state.unsoldPlayers,
  currentRound: state.currentRound,
})
```

## 5. Custom Hooks

### 5.1 useAuction

**Purpose**: Main auction control interface

```typescript
function useAuction() {
  return {
    // State
    currentPlayer, currentBid, selectedTeam,
    
    // Player actions
    selectPlayer, selectNextPlayer, selectRandomPlayer,
    
    // Bidding actions
    incrementBid, decrementBid, resetBid,
    
    // Outcome actions
    markAsSold, markAsUnsold,
    
    // Utilities
    getEligibleTeams, getMaxBidForTeam
  };
}
```

### 5.2 useData

**Purpose**: Data fetching with React Query

```typescript
function useInitialData() {
  return {
    isLoading, isError, error,
    teams, players, soldPlayers, unsoldPlayers,
    refetch: { teams, players, soldPlayers, unsoldPlayers }
  };
}
```

### 5.3 useKeyboardShortcuts

**Purpose**: Keyboard navigation

**Default Hotkeys**:
| Key | Action |
|-----|--------|
| `N` | Next player |
| `P` | Previous (clear) |
| `+` | Increase bid |
| `-` | Decrease bid |
| `S` | Mark as sold |
| `U` | Mark as unsold |
| `T` | Toggle mode |
| `1-9` | Select team |
| `Escape` | Close overlay |

### 5.4 useTheme

**Purpose**: Theme management

```typescript
function useTheme() {
  return {
    currentTheme,
    switchTheme,      // Change to different theme
    toggleDarkMode,   // Toggle dark mode
    getAvailableThemes
  };
}
```

## 6. Component Details

### 6.1 PlayerCard

**Props**:
```typescript
interface PlayerCardProps {
  player: Player;
  isSelected?: boolean;
  showBidInfo?: boolean;
  currentBid?: number;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}
```

**Features**:
- Responsive image display
- Role-based color coding
- Under-age badge
- Animated entry/exit

### 6.2 BidDisplay

**Features**:
- Animated bid value changes
- Previous bid reference
- Selected team display
- Increment/decrement controls

### 6.3 TeamSelector

**Features**:
- Grid layout of teams
- Keyboard shortcut badges
- Eligibility indication
- Max bid calculation
- Validation error display

### 6.4 Overlays

**Types**:
- `SoldOverlay` - Celebration animation
- `UnsoldOverlay` - Grayscale effect
- `EndOverlay` - Summary statistics

## 7. Configuration System

### 7.1 Configuration Hierarchy

```typescript
// Default configuration
const defaultConfig: AppConfig = {
  appName: 'Cricket Player Auction',
  googleSheets: { ... },
  auction: {
    basePrice: 0.5,
    bidIncrement: 0.5,
    underAgeThreshold: 23,
    maxUnderAgePlayers: 2,
    safeFundThreshold: 2
  },
  // ...
};

// Tournament-specific override
const tournamentConfigs = new Map([
  ['bcc-season-6', { ... }],
  ['corporate-league-2025', { ... }]
]);
```

### 7.2 Environment Variables

```bash
VITE_GOOGLE_SHEET_ID      # Google Sheets document ID
VITE_GOOGLE_API_KEY       # Google API key
VITE_WEBHOOK_URL          # Apps Script webhook URL
VITE_TOURNAMENT_ID        # Tournament configuration key
```

## 8. Theme System

### 8.1 CSS Variables

```css
:root {
  --theme-primary: #1a365d;
  --theme-secondary: #2d3748;
  --theme-accent: #3182ce;
  --theme-background: #1a202c;
  --theme-surface: #2d3748;
  --theme-text-primary: #ffffff;
  --theme-text-secondary: #a0aec0;
  --theme-sold: #38a169;
  --theme-unsold: #e53e3e;
  --theme-bid: #ecc94b;
  --theme-team-indicator: #805ad5;
}
```

### 8.2 Theme Switching

```typescript
// Apply theme to document
const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--theme-${key}`, value);
  });
};
```

## 9. Error Handling

### 9.1 Service Layer

```typescript
// Graceful degradation
try {
  const data = await googleSheetsService.fetchPlayers();
  return data;
} catch (error) {
  console.error('[Service] Error:', error);
  return defaultData; // Fallback
}
```

### 9.2 UI Layer

```typescript
// Error boundary pattern
if (isError) {
  return <ErrorScreen error={error} onRetry={refetch} />;
}
```

### 9.3 Notification System

```typescript
// User feedback
showNotification('error', 'Failed to load players');
showNotification('success', 'Player sold successfully');
showNotification('warning', 'Low budget remaining');
```

## 10. Performance Considerations

### 10.1 Memoization

```typescript
// Memoized components
const MemoizedPlayerCard = React.memo(PlayerCard);

// Memoized selectors
const selectEligibleTeams = useCallback(() => {
  return teams.filter(team => validation.isValid);
}, [teams, currentBid]);
```

### 10.2 Lazy Loading

```typescript
// Code splitting for overlays
const SoldOverlay = lazy(() => import('./Overlays/SoldOverlay'));
```

### 10.3 Optimistic Updates

```typescript
// Update UI before API call
store.markAsSold(); // Immediate
await webhookService.updateSoldPlayer(); // Background
```

## 11. Testing Strategy

### 11.1 Unit Tests
- Services: AuctionRulesService validation
- Hooks: useAuction state transitions
- Utils: Date calculations, formatting

### 11.2 Integration Tests
- Data flow: API → Store → UI
- User flows: Select → Bid → Sell

### 11.3 E2E Tests
- Complete auction flow
- Error scenarios
- Keyboard navigation

## 12. Future Enhancements

### 12.1 Planned Features
- [ ] Real-time multiplayer support
- [ ] Offline mode with sync
- [ ] Export to PDF/Excel
- [ ] Admin dashboard
- [ ] Mobile-optimized view

### 12.2 Technical Debt
- [ ] Add comprehensive test suite
- [ ] Implement error boundaries
- [ ] Add service worker for offline
- [ ] Optimize bundle size
