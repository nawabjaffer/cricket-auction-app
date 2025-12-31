# Cricket Auction App v2.0 🏏

A complete rewrite of the Cricket Auction application with modern React patterns, improved architecture, and enhanced user experience.

## What's New in v2.0

### 🏗️ Architecture Improvements

- **Zustand Slices Pattern**: Modular state management with separate slices for players, teams, bidding, sessions, UI, and history
- **Immer Integration**: Immutable state updates with mutable syntax
- **Enhanced Type System**: Discriminated unions, branded types, and strict typing throughout
- **Compound Components**: Reusable UI components with composition patterns

### 🎨 UI/UX Enhancements

- **Modern Design System**: CSS custom properties for consistent theming
- **Dark/Light Mode**: Full theme support with smooth transitions
- **Glass Morphism**: Modern frosted glass effects on cards and overlays
- **Improved Animations**: Smoother transitions with Framer Motion
- **Better Accessibility**: Focus states, ARIA labels, keyboard navigation

### ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Next player |
| `R` | Random player |
| `1-8` | Select team & place bid |
| `S` | Mark as sold |
| `U` | Mark as unsold |
| `Z` | Undo last action |
| `↑/↓` | Increment/Decrement bid |
| `Q` | 2x bid multiplier |
| `W` | 5x bid multiplier |
| `V` | Toggle team panel |
| `H` | Toggle header |
| `ESC` | Close overlays |

### 📁 New File Structure

```
src/
├── components/
│   └── v2/
│       ├── ui/                 # Base UI components
│       │   └── index.tsx       # Button, Card, Badge, Modal, etc.
│       ├── PlayerCard.tsx      # Player display components
│       ├── TeamComponents.tsx  # Team selection & display
│       ├── Overlays.tsx        # Sold, Unsold, End overlays
│       └── index.ts            # Barrel exports
├── hooks/
│   └── v2/
│       └── index.ts            # Custom hooks
├── store/
│   └── v2/
│       └── auctionStoreV2.ts   # Zustand store with slices
├── types/
│   └── v2/
│       └── index.ts            # TypeScript definitions
├── styles/
│   └── v2.css                  # Design system CSS
├── AppV2.tsx                   # Main v2 application
└── main.tsx                    # Entry point with version toggle
```

### 🔧 Technical Stack

- **React 19** with TypeScript
- **Zustand** for state management (with immer middleware)
- **Framer Motion** for animations
- **React Query** for data fetching
- **Tailwind CSS v4** for styling
- **React Icons** for iconography

## Switching Versions

To switch between v1 and v2, edit `src/main.tsx`:

```tsx
// Set to true for v2, false for v1
const USE_V2 = true;
```

## Key Components

### UI Components (`components/v2/ui/`)

- `Button` - Variants: primary, secondary, ghost, danger, success
- `Card` - Variants: default, glass, elevated
- `Badge` - For status indicators
- `Modal` - Compound component with Header, Body, Footer
- `Avatar` - With fallback initials
- `Progress` - Animated progress bars
- `Spinner` - Loading indicators
- `Tooltip` - Hover tooltips
- `Kbd` - Keyboard key display

### Player Components (`components/v2/PlayerCard.tsx`)

- `RoleIcon` - Cricket role icons
- `RoleBadge` - Role with icon and color
- `StatRow` - Individual stat display
- `CompactPlayerCard` - List view card
- `PlayerCard` - Full detail card
- `SoldPlayerCard` - Squad list item
- `PlayerHero` - Main auction display

### Team Components (`components/v2/TeamComponents.tsx`)

- `TeamCard` - Team selection card
- `TeamSelector` - Grid of team cards
- `TeamPanel` - Full team overlay
- `TeamTabs` - Tab navigation
- `TeamBidOverlay` - Floating bid card

## State Management

The v2 store uses Zustand's slices pattern:

```typescript
// Slices
PlayerSlice   // Player pools and selection
TeamSlice     // Team data and selection
BidSlice      // Bidding operations
SessionSlice  // Auction session management
UISlice       // UI state (overlays, notifications, theme)
HistorySlice  // Action history for undo

// Selector hooks
useCurrentPlayerV2()
useTeamsV2()
useSelectedTeamV2()
useSoldPlayersV2()
...
```

## CSS Design System

v2 uses CSS custom properties for theming:

```css
:root {
  --color-background: #0a0a0f;
  --color-surface: #12121a;
  --color-accent: #a7f02d;
  --color-text-primary: #ffffff;
  /* ... */
}

[data-theme="light"] {
  --color-background: #f8fafc;
  /* ... */
}
```

## Reverting to v1

If you need to revert to v1:

```bash
# Switch to main branch
git checkout main

# Or just toggle in main.tsx
const USE_V2 = false;
```

## Future Improvements

- [ ] Real-time sync with Google Sheets
- [ ] Player image uploads
- [ ] Advanced analytics dashboard
- [ ] Export auction results
- [ ] Multi-language support
- [ ] PWA support

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - feel free to use for your cricket league auctions!
