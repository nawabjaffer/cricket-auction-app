# Architecture Documentation

## Overview

This React Auction App follows a **Model-View-Controller (MVC)** architecture pattern with additional layers for better separation of concerns and code reusability.

## Directory Structure

```
src/
├── models/                    # Data Models (M in MVC)
│   ├── domain/                # Business entities
│   │   ├── Player.ts          # Player domain model
│   │   ├── Team.ts            # Team domain model
│   │   ├── Auction.ts         # Auction state model
│   │   └── Bid.ts             # Bid entity model
│   ├── dto/                   # Data Transfer Objects
│   │   ├── PlayerDTO.ts       # Player API transformations
│   │   ├── TeamDTO.ts         # Team API transformations
│   │   ├── BidDTO.ts          # Bid data transformations
│   │   └── AuctionStateDTO.ts # State persistence DTOs
│   └── responses/             # Standardized response types
│       ├── ApiResponse.ts     # API response wrapper
│       └── ValidationResponse.ts # Validation result types
│
├── controllers/               # Business Logic (C in MVC)
│   ├── AuctionController.ts   # Auction orchestration
│   ├── BidController.ts       # Bidding operations
│   ├── PlayerController.ts    # Player management
│   ├── TeamController.ts      # Team management
│   └── ControllerFactory.ts   # Dependency injection
│
├── repositories/              # Data Access Layer
│   ├── PlayerRepository.ts    # Player data access
│   ├── TeamRepository.ts      # Team data access
│   ├── AuctionRepository.ts   # Auction state persistence
│   ├── BidRepository.ts       # Bid history & sync
│   └── RepositoryFactory.ts   # Repository DI
│
├── services/                  # External Services
│   ├── base/                  # Base service classes
│   │   └── BaseService.ts     # Common service functionality
│   ├── interfaces/            # Service contracts
│   │   └── index.ts           # Service interfaces
│   ├── impl/                  # Service implementations
│   │   └── StorageService.ts  # Storage & cache services
│   ├── googleSheets.ts        # Google Sheets API
│   ├── webhook.ts             # Webhook notifications
│   ├── audio.ts               # Sound effects
│   └── ...                    # Other services
│
├── hooks/                     # React Hooks (View integration)
│   ├── useAuctionController.ts # Main controller hook
│   ├── useAuction.ts          # Legacy auction hook
│   ├── useData.ts             # Data fetching
│   └── ...                    # Other hooks
│
├── store/                     # State Management (Zustand)
│   └── auctionStore.ts        # Global auction state
│
├── components/                # React Components (V in MVC)
│   ├── PlayerCard/
│   ├── TeamSelector/
│   ├── BidDisplay/
│   └── ...
│
├── utils/                     # Shared Utilities
│   ├── formatters.ts          # Currency, date, text formatting
│   ├── validators.ts          # Input validation functions
│   ├── constants.ts           # Application constants
│   ├── helpers.ts             # Common utility functions
│   └── logger.ts              # Centralized logging
│
└── types/                     # TypeScript Definitions
    └── index.ts               # Shared type definitions
```

## Design Principles

### 1. DRY (Don't Repeat Yourself)
- Business logic centralized in controllers
- Shared utilities in `/utils`
- Reusable validation functions
- Common formatting functions

### 2. Single Responsibility
- **Models**: Define data structure and domain logic
- **Controllers**: Handle business operations
- **Repositories**: Manage data access
- **Services**: Handle external communication
- **Hooks**: Provide React integration

### 3. Dependency Injection
- Factory patterns for controllers and repositories
- Interface-based service contracts
- Easy mocking for tests

## Layer Responsibilities

### Models (`/models`)

**Domain Models** define business entities with behavior:

```typescript
// Example: Player domain model
class PlayerModel implements IPlayer {
  isBatsman(): boolean { /* role logic */ }
  isUnderAge(threshold?: number): boolean { /* age logic */ }
  getAvatarUrl(): string { /* image fallback logic */ }
}
```

**DTOs** handle data transformation:

```typescript
// Example: Transform API response
PlayerDTOTransformer.fromApiResponse(apiData) // → Player
PlayerDTOTransformer.toSoldPlayer(player, team, price) // → SoldPlayer
```

**Response Types** standardize API returns:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

### Controllers (`/controllers`)

Controllers orchestrate business logic:

```typescript
// Example: AuctionController
class AuctionController {
  selectPlayer(player: Player): ApiResponse<void> { /* validation + state update */ }
  markAsSold(): Promise<ApiResponse<void>> { /* validate + update + webhook */ }
  validateSell(): ValidationResponse { /* business rules check */ }
}
```

### Repositories (`/repositories`)

Repositories abstract data access:

```typescript
// Example: PlayerRepository
interface IPlayerRepository {
  getAll(): Player[];
  getAvailable(): Player[];
  getSold(): SoldPlayer[];
  markAsSold(playerId: string, teamId: string, price: number): void;
}
```

### Services (`/services`)

Services handle external communication:

```typescript
// Example: WebhookService
webhookService.updateSoldPlayer(player, price, team);
googleSheetsService.fetchPlayers();
audioService.playSold();
```

### Hooks (`/hooks`)

Hooks provide React integration:

```typescript
// Example: useAuctionController
function useAuctionController() {
  const { auction, bid, player, team } = getControllers();
  
  return {
    markAsSold: () => auction.markAsSold(),
    quickBid: (teamIndex, multiplier) => bid.quickBid(teamIndex, multiplier),
    // ...
  };
}
```

## Usage Examples

### Using Controller Hooks

```tsx
import { useAuctionController } from '../hooks';

function AuctionPage() {
  const { 
    currentPlayer,
    markAsSold,
    quickBid,
    validateSell,
  } = useAuctionController();

  const handleSell = async () => {
    const validation = validateSell();
    if (!validation.isValid) {
      alert(validation.messages.join('\n'));
      return;
    }
    await markAsSold();
  };

  return (/* JSX */);
}
```

### Using Utilities

```typescript
import { formatCurrency, validateBidAmount, AUCTION_CONFIG } from '../utils';

const display = formatCurrency(2500000); // "₹25 L"

const validation = validateBidAmount(
  amount,
  currentBid,
  AUCTION_CONFIG.MINIMUM_BID,
  AUCTION_CONFIG.BID_INCREMENT
);
```

### Using Services

```typescript
import { localStorageService, cacheService } from '../services';

// Storage
localStorageService.set('auction_state', state);
const saved = localStorageService.get<AuctionState>('auction_state');

// Caching
cacheService.set('players', players, 5 * 60 * 1000); // 5 min TTL
const cached = cacheService.get<Player[]>('players');
```

## Migration from Legacy Code

### Before (Direct Store Access)

```typescript
function Component() {
  const store = useAuctionStore();
  
  const handleSell = () => {
    if (!store.currentPlayer || !store.selectedTeam) {
      return;
    }
    store.markAsSold();
    webhookService.updateSoldPlayer(...);
    audioService.playSold();
  };
}
```

### After (Controller Pattern)

```typescript
function Component() {
  const { markAsSold, validateSell } = useAuctionController();
  
  const handleSell = async () => {
    const result = await markAsSold(); // All logic encapsulated
    if (!result.success) {
      console.error(result.error);
    }
  };
}
```

## Benefits

1. **Maintainability**: Business logic in one place
2. **Testability**: Easy to mock dependencies
3. **Reusability**: Same logic across components
4. **Type Safety**: Strong TypeScript support
5. **Scalability**: Easy to add new features
6. **Documentation**: Self-documenting code structure

## Future Enhancements

- [ ] Add unit tests for controllers
- [ ] Implement repository caching layer
- [ ] Add WebSocket service for real-time sync
- [ ] Create admin-specific controllers
- [ ] Add analytics service integration
