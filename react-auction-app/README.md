# 🏏 Cricket Auction App - React Edition

A modern, feature-rich cricket player auction management system built with React, TypeScript, and Tailwind CSS.

![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-blue)

![Vite](https://img.shields.io/badge/Vite-5.0-purple)

## 📱 Mobile Bidding & QR Code Access

- **Mobile Bidding Interface**: Teams can log in from their mobile devices to place bids in real time. The mobile interface is optimized for touch and small screens.
- **QR Code Access**: Scan the QR code displayed on the main auction screen to instantly open the mobile bidding interface on your device.
- **Team Authentication**: Each team has a unique username and password for secure access. Credentials are managed in `src/services/auth.ts`.

### Mobile Bidding URL

The mobile bidding interface is available at:

```
/mobile-bidding
```

Or scan the QR code shown on the main auction app screen.

### Team Login Credentials

| Team Name           | Username   | Password   |
|---------------------|------------|------------|
| Royal Challengers   | royal      | rcb2024    |
| Super Kings         | kings      | csk2024    |
| Titans              | titans     | gt2024     |
| Capitals            | capitals   | dc2024     |
| Warriors            | warriors   | lsg2024    |
| Riders              | riders     | kkr2024    |
| Indians             | indians    | mi2024     |
| Sunrisers           | sunrisers  | srh2024    |

See `src/services/auth.ts` for details or to update credentials.


## ✨ Features

- 🎯 **Real-time Player Auction** - Sequential or random player selection
- 💰 **Smart Bidding System** - Automatic validation with 9 auction rules
- 👥 **Team Management** - Budget tracking, player limits, and constraints
- 🎨 **Multiple Themes** - Support for different tournament styles
- ⌨️ **Keyboard Shortcuts** - Fast auction control with hotkeys
- 📊 **Live Statistics** - Real-time tracking of auction progress
- 🔊 **Sound Effects** - Audio feedback for sold/unsold events
- 📱 **Responsive Design** - Works on desktop and tablets


## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Cloud account (for Sheets API)

### Installation

```bash
# Navigate to the project
cd react-auction-app

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

### Environment Configuration

Create `.env.local` with your Google API credentials:

```env
VITE_GOOGLE_SHEET_ID=your-google-sheet-id
VITE_GOOGLE_API_KEY=your-google-api-key
VITE_WEBHOOK_URL=https://script.google.com/macros/s/your-script-id/exec
VITE_TOURNAMENT_ID=default
```

## 📁 Project Structure

```
src/
├── components/     # React UI components
├── config/         # Configuration & multi-tenancy
├── hooks/          # Custom React hooks
├── services/       # Business logic services
├── store/          # Zustand state management
├── types/          # TypeScript definitions
└── App.tsx         # Root component
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Select next player |
| `P` | Clear current player |
| `+` | Increase bid |
| `-` | Decrease bid |
| `S` | Mark as sold |
| `U` | Mark as unsold |
| `T` | Toggle selection mode |
| `1-9` | Select team |
| `Escape` | Close overlay |

## 🎨 Theming

The app supports multiple themes. Configure via `VITE_TOURNAMENT_ID`:

- `default` - Classic dark theme
- `bcc-season-6` - BCC Season 6 theme
- `corporate-league-2025` - Corporate tournament theme

## 📊 Google Sheets Setup

### Required Sheets

1. **Players** - Player registration data
2. **Teams** - Team configuration
3. **Sold Players** - Sold player records
4. **Unsold Players** - Unsold player records

### Column Mappings

Configure column indices in `src/config/index.ts` to match your sheet structure.

## 🔧 Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run typecheck
```

## 📖 Documentation

- [High Level Design (HLD)](./docs/HLD.md) - Architecture overview
- [Low Level Design (LLD)](./docs/LLD.md) - Implementation details

## 🏗️ Architecture

The app follows a clean architecture with:

- **Presentation Layer** - React components with Framer Motion
- **Hooks Layer** - Custom hooks for logic abstraction
- **State Layer** - Zustand for global state management
- **Services Layer** - Business logic and API integration

## 🔒 Auction Rules

The system enforces 9 validation rules:

1. ✅ Remaining budget check
2. ✅ Total budget cap
3. ✅ Player count limit
4. ✅ Minimum balance for remaining players
5. ✅ Safe fund threshold
6. ✅ Under-age player limit
7. ✅ Team-specific restrictions
8. ✅ Base price minimum
9. ✅ Bid increment validation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## App User Guides

Operator instructions are available in the app through **Help → Read all guides** and as separate section READMEs in [docs/guides](./docs/guides/README.md).

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Original auction app design
- Google Sheets for backend storage
- React and Vite communities
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
