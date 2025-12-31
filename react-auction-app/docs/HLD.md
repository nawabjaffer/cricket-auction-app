# Cricket Auction App - High Level Design (HLD)

## 1. Executive Summary

The Cricket Auction App is a real-time player auction management system designed for cricket tournaments. This document outlines the architectural design, system components, and integration patterns for the React-based implementation.

## 2. System Overview

### 2.1 Purpose
- Facilitate live player auctions for cricket tournaments
- Manage team budgets and player allocations
- Enforce auction rules and constraints
- Provide real-time updates and visualizations

### 2.2 Key Features
- **Player Selection**: Sequential or random player selection
- **Bidding System**: Real-time bid management with validation
- **Team Management**: Budget tracking, player limits, and constraints
- **Multi-tenancy**: Support for multiple tournament configurations
- **Data Persistence**: Google Sheets integration for data storage
- **Responsive UI**: Modern, animated interface with theme support

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  PlayerCard │  │  BidDisplay │  │TeamSelector │  │  Overlays   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             HOOKS LAYER                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ useAuction  │  │   useData   │  │  useTheme   │  │useKeyboard  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        STATE MANAGEMENT LAYER                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Zustand Store (auctionStore)                 │    │
│  │  • Player State    • Team State    • Bid State    • UI State    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVICES LAYER                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │AuctionRules │  │GoogleSheets │  │  Webhook    │  │   Audio     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐      │
│  │     Google Sheets API       │  │   Google Apps Script        │      │
│  │   (Data Source - Read)      │  │   (Webhook - Write)         │      │
│  └─────────────────────────────┘  └─────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4. Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend Framework | React 18 | UI Components |
| Build Tool | Vite | Fast development & building |
| Language | TypeScript | Type safety |
| State Management | Zustand | Lightweight global state |
| Data Fetching | TanStack React Query | Server state & caching |
| Styling | Tailwind CSS | Utility-first CSS |
| Animations | Framer Motion | Smooth animations |
| Backend | Google Sheets + Apps Script | Data storage & webhooks |

## 5. Data Flow

### 5.1 Read Flow (Data Fetching)
```
Google Sheets API → React Query → Zustand Store → React Components
```

### 5.2 Write Flow (Auction Actions)
```
User Action → Zustand Store → Webhook Service → Google Apps Script → Google Sheets
```

### 5.3 Real-time Updates
- React Query handles polling for data freshness
- Optimistic updates for immediate UI feedback
- Background sync with Google Sheets

## 6. Multi-tenancy Architecture

### 6.1 Tournament Configuration
Each tournament can have unique:
- Auction rules (budget caps, player limits)
- Theme (colors, backgrounds, logos)
- Google Sheets data source
- Webhook endpoints

### 6.2 Configuration Hierarchy
```
Default Config ← Tournament Config ← Environment Overrides
```

## 7. Security Considerations

### 7.1 API Security
- Google API key with restricted permissions
- CORS handled by Google Apps Script
- No sensitive data in client-side code

### 7.2 Data Validation
- Client-side validation before API calls
- Server-side validation in Apps Script
- Type-safe operations with TypeScript

## 8. Performance Optimizations

### 8.1 Implemented Strategies
- **Code Splitting**: Lazy loading for overlays
- **Memoization**: React.memo for static components
- **Caching**: React Query cache for API responses
- **Optimistic Updates**: Immediate UI feedback
- **Virtual Lists**: For large player pools (future)

### 8.2 Bundle Optimization
- Tree shaking via Vite
- CSS purging via Tailwind
- Minimal dependencies

## 9. Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Developer     │────▶│   GitHub/CI     │────▶│   Static Host   │
│   Local Dev     │     │   Build & Test  │     │   (Vercel/etc)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 10. Scalability Considerations

### 10.1 Current Limitations
- Google Sheets API rate limits
- Single auction at a time
- Client-side processing

### 10.2 Future Scalability
- Backend API for high-volume events
- Real-time WebSocket connections
- Database migration (Firebase/Supabase)

## 11. Monitoring & Observability

### 11.1 Client-side
- Console logging with severity levels
- Error boundaries for crash reporting
- Performance metrics via Web Vitals

### 11.2 Recommended Additions
- Sentry for error tracking
- Google Analytics for usage metrics
- Custom event tracking

## 12. Disaster Recovery

### 12.1 Data Backup
- Google Sheets maintains version history
- Local storage persistence for active session
- Export functionality for auction results

### 12.2 Failover Scenarios
- Offline mode with local data
- Manual data entry fallback
- Session recovery on page refresh
