# SaaS Multi-Tenant Architecture

## 1. Overview

Transform the single-tenant cricket auction app into a multi-tenant SaaS platform where multiple tournament franchises share **one Firebase project** with **path-based data isolation**. Each franchise gets a unique URL slug, isolated database namespace, and its own admin/team credentials.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tenant isolation | Path-based (`/tenants/{id}/...`) in single RTDB | Simpler ops, single billing, no cross-project auth |
| Authentication | Custom auth extended with passwords (SHA-256 + salt) | Matches existing pattern, zero new dependencies |
| Routing | `/:tenantSlug/...` path prefix | No DNS/subdomain complexity |
| Scoring integration | Generic adapter pattern | Extensible to CricHeroes, CricBuzz, manual entry |
| Player lifecycle | Trials → Auction → Squad → Match | Full franchise lifecycle |

---

## 2. Current State (Single-Tenant)

### 2.1 Database Structure (Firebase Realtime Database)

All data lives at the root level — no tenant isolation:

```
auction/
  currentState          ← realtime auction sync (realtimeSync.ts)
  mobileBids            ← mobile bid submissions (realtimeSync.ts)
  sessionReset          ← session reset events (realtimeSync.ts)
  broadcastControl      ← live broadcast state (realtimeSync.ts)
  cameraConfig          ← camera layout (realtimeSync.ts)
  mobileBiddingConfig   ← mobile bidding settings (realtimeSync.ts)
  soldPlayers           ← sold player records (auctionPersistence.ts)
  unsoldPlayers         ← unsold player records (auctionPersistence.ts)
  initialSnapshot       ← Google Sheets snapshot (auctionPersistence.ts)
  adminSettings         ← admin config (auctionPersistence.ts)
  teams                 ← team data (auctionPersistence.ts)
  adminPlayers          ← admin-edited players (auctionPersistence.ts)
  sponsors              ← sponsor records (auctionPersistence.ts)
admin/
  accounts              ← admin accounts, email-only (authService.ts)
  featureFlags          ← feature toggles (featureFlagsService.ts)
premium/
  users                 ← premium tier users (premiumService.ts)
  config                ← premium config (premiumService.ts)
```

### 2.2 Services That Access Firebase Paths

| Service | File | Paths Used |
|---------|------|------------|
| RealtimeSyncService | `src/services/realtimeSync.ts` | `auction/currentState`, `auction/mobileBids`, `auction/sessionReset`, `auction/broadcastControl`, `auction/cameraConfig`, `auction/mobileBiddingConfig` |
| AuctionPersistenceService | `src/services/auctionPersistence.ts` | `auction/soldPlayers`, `auction/unsoldPlayers`, `auction/initialSnapshot`, `auction/adminSettings`, `auction/teams`, `auction/adminPlayers`, `auction/sponsors` |
| AuthService | `src/services/authService.ts` | `admin/accounts` |
| FeatureFlagsService | `src/services/featureFlagsService.ts` | `admin/featureFlags` |
| PremiumService | `src/services/premiumService.ts` | `premium/users`, `premium/config` |

### 2.3 Current Auth Flow

```
AdminLogin (email only) → authService.login(email)
  → checks admin/accounts/{emailKey} in RTDB
  → creates session token (random string)
  → stores in localStorage
  → 24h expiry with extension on activity

Team Bidding (hardcoded credentials in auth.ts)
  → 8 teams with username/password in code
  → MobileBiddingLivePage dynamically generates from team data
  → stores in sessionStorage
```

### 2.4 Current Routing

```
/                   → App (main auction screen)
/live               → LivePage (broadcast view)
/live-admin         → LiveAdminPage (broadcast control)
/admin/login        → AdminLogin (email-only)
/admin              → AdminPage
/camera             → CameraPage
/connect-bididng    → MobileBiddingLivePage (typo in route)
/diagnostics        → FirebaseDiagnostics
```

---

## 3. Target State (Multi-Tenant SaaS)

### 3.1 Database Structure

```
platform/
  tenants/
    {tenantId}/
      name: string              ← "BCC Cricket League"
      slug: string              ← "bcc-season-6"
      plan: PremiumTier         ← "free" | "basic" | "pro" | "enterprise"
      isActive: boolean
      createdAt: number
      createdBy: string         ← super-admin email
      config/
        googleSheets/           ← per-tenant sheets config
        webhook/                ← per-tenant webhook config
        auction/                ← per-tenant auction rules
        theme: string           ← theme key
        logoUrl: string
  superadmin/
    accounts/
      {emailKey}/               ← platform super-admin accounts

tenants/
  {tenantId}/
    auction/
      currentState
      mobileBids
      sessionReset
      broadcastControl
      cameraConfig
      mobileBiddingConfig
      soldPlayers
      unsoldPlayers
      initialSnapshot
      adminSettings
      teams
      adminPlayers
      sponsors
    admin/
      accounts/
        {emailKey}/
          email: string
          name: string
          role: "admin" | "super-admin"
          passwordHash: string    ← SHA-256(password + salt)
          salt: string
          createdAt: number
          lastLogin: number
          isActive: boolean
      featureFlags/
    premium/
      users/
      config/
    trials/                       ← Phase 3
      players/{playerId}/
        ratings/{teamId}/
        shortlists/{teamId}/
      sessions/{sessionId}/
    matches/                      ← Phase 3
      {matchId}/
        info/
        squads/{teamId}/
        toss/
        result/
    scoring/                      ← Phase 4
      matches/{matchId}/
        config/
        live/
        final/
      playerStats/{playerId}/
        career/
        matches/{matchId}/
```

### 3.2 Routing Structure

```
/login                              → FranchiseLoginPage (tenant selector + credentials)
/platform-admin                     → PlatformAdminPage (super-admin only)

/:tenantSlug/                       → App (auction screen)
/:tenantSlug/live                   → LivePage (broadcast)
/:tenantSlug/live-admin             → LiveAdminPage (broadcast control)
/:tenantSlug/admin/login            → AdminLogin (tenant-scoped)
/:tenantSlug/admin                  → AdminPage
/:tenantSlug/camera                 → CameraPage
/:tenantSlug/connect-bidding        → MobileBiddingLivePage (fix typo)
/:tenantSlug/diagnostics            → Diagnostics
/:tenantSlug/trials                 → TrialsPage (Phase 3)
/:tenantSlug/matches                → MatchSelectionPage (Phase 3)
/:tenantSlug/matches/:matchId/score → MatchScorePage (Phase 4)
```

### 3.3 Auth Flow (Updated)

```
FranchiseLoginPage
  1. User selects tournament from dropdown (fetched from platform/tenants)
  2. Enters email + password
  3. authService.login(email, password, tenantId)
     → looks up tenants/{tenantId}/admin/accounts/{emailKey}
     → verifies SHA-256(password + account.salt) === account.passwordHash
     → creates session {email, token, tenantId, expiresAt}
     → stores in localStorage
  4. Redirect to /:tenantSlug/admin

Team Bidding
  1. Navigate to /:tenantSlug/connect-bidding
  2. Credentials generated dynamically from tenants/{tenantId}/auction/teams
  3. Username = normalized team name, Password = username + "123"
  4. Session includes tenantId
```

---

## 4. Implementation Phases

### Phase 1: Multi-Tenant Foundation

**Goal:** All Firebase paths are tenant-scoped. App resolves tenant from URL.

#### 1.1 Tenant Path Helper

Create `src/services/tenantPath.ts`:

```typescript
// Module-level tenant ID — set once at app boot from URL
let _activeTenantId: string | null = null;

export function setActiveTenant(tenantId: string): void {
  _activeTenantId = tenantId;
}

export function getActiveTenant(): string {
  if (!_activeTenantId) throw new Error('Tenant not initialized');
  return _activeTenantId;
}

export function tenantPath(relativePath: string): string {
  return `tenants/${getActiveTenant()}/${relativePath}`;
}

export function platformPath(relativePath: string): string {
  return `platform/${relativePath}`;
}
```

#### 1.2 Migrate Service Path Constants

**realtimeSync.ts** — Replace:
```typescript
const AUCTION_STATE_PATH = 'auction/currentState';
```
With:
```typescript
import { tenantPath } from './tenantPath';
const getAuctionStatePath = () => tenantPath('auction/currentState');
```

Apply same pattern to all 6 path constants in realtimeSync.ts and 7 in auctionPersistence.ts.

#### 1.3 Tenant Context Provider

Create `src/contexts/TenantContext.tsx`:

```typescript
interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  plan: PremiumTier;
  config: TournamentConfig;
}

const TenantContext = createContext<TenantInfo | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { tenantSlug } = useParams();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  
  useEffect(() => {
    // Load tenant info from platform/tenants where slug matches
    // Set module-level tenant ID via setActiveTenant()
    // Initialize services with tenant scope
  }, [tenantSlug]);

  if (!tenant) return <LoadingScreen />;
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

export const useTenant = () => useContext(TenantContext);
```

#### 1.4 Route Changes in main.tsx

```tsx
<Routes>
  <Route path="/login" element={<FranchiseLoginPage />} />
  <Route path="/platform-admin" element={<PlatformAdminPage />} />
  <Route path="/:tenantSlug/*" element={<TenantProvider><TenantRoutes /></TenantProvider>} />
  <Route path="/" element={<Navigate to="/login" />} />
</Routes>

function TenantRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/live" element={<LivePage />} />
      <Route path="/live-admin" element={<LiveAdminPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/camera" element={<CameraPage />} />
      <Route path="/connect-bidding" element={<MobileBiddingLivePage />} />
      <Route path="/diagnostics" element={<FirebaseDiagnostics />} />
      <Route path="/trials" element={<TrialsPage />} />
      <Route path="/matches" element={<MatchSelectionPage />} />
      <Route path="/matches/:matchId/score" element={<MatchScorePage />} />
    </Routes>
  );
}
```

#### 1.5 Database Rules

```json
{
  "rules": {
    "platform": {
      "tenants": {
        ".read": true,
        "$tenantId": {
          ".write": false
        }
      },
      "superadmin": {
        ".read": false,
        ".write": false
      }
    },
    "tenants": {
      "$tenantId": {
        ".read": true,
        ".write": true,
        "auction": {
          "mobileBids": {
            ".indexOn": ["timestamp", "processed"]
          }
        }
      }
    }
  }
}
```

> **Note:** Rules are permissive initially since we use custom auth, not Firebase Auth SDK. Tighten when migrating to Firebase Auth.

#### 1.6 Data Migration Script

One-time script to move existing data from root to `/tenants/bcc-season-6/`:

```bash
# setup-migration.sh
# Reads all data from root auction/, admin/, premium/
# Writes to tenants/bcc-season-6/auction/, tenants/bcc-season-6/admin/, etc.
# Creates platform/tenants/bcc-season-6/ registry entry
```

#### 1.7 Files to Modify

| File | Changes |
|------|---------|
| `src/services/realtimeSync.ts` | Replace 6 `*_PATH` constants with `tenantPath()` calls |
| `src/services/auctionPersistence.ts` | Replace 7 `DB_PATHS` entries with `tenantPath()` calls |
| `src/services/authService.ts` | Scope `ADMIN_ACCOUNTS_PATH` to tenant, add password verification |
| `src/services/featureFlagsService.ts` | Scope `FEATURE_FLAGS_PATH` to tenant |
| `src/services/premiumService.ts` | Scope `DB_PATHS` to tenant |
| `src/main.tsx` | Tenant-prefixed routes with `TenantProvider` wrapper |
| `src/config/index.ts` | Load config dynamically from tenant DB instead of hardcoded map |
| `src/store/auctionStore.ts` | Tenant-aware localStorage persistence key |
| `database.rules.json` | Tenant-scoped rules |

#### 1.8 Files to Create

| File | Purpose |
|------|---------|
| `src/services/tenantPath.ts` | Module-level tenant ID + path helpers |
| `src/contexts/TenantContext.tsx` | React context for tenant info |
| `src/services/tenantService.ts` | Tenant CRUD + slug resolution |
| `src/pages/FranchiseLoginPage.tsx` | Franchise login UI |
| `src/pages/FranchiseLoginPage.css` | Franchise login styles |

---

### Phase 2: Franchise Authentication

See separate section in this doc (§6).

### Phase 3: Player Lifecycle

See `docs/PLAYER_LIFECYCLE.md`.

### Phase 4: Match Scorer Integration

See `docs/SCORING_INTEGRATION.md`.

---

## 5. Data Flow Diagrams

### 5.1 Tenant Resolution Flow

```
Browser navigates to /bcc-season-6/
  → React Router matches /:tenantSlug/*
  → TenantProvider extracts "bcc-season-6"
  → tenantService.resolveTenant("bcc-season-6")
    → reads platform/tenants where slug === "bcc-season-6"
    → returns { id: "bcc-s6-xxx", name: "BCC Cricket League", plan: "pro", ... }
  → setActiveTenant("bcc-s6-xxx")  // module-level setter
  → All services now use tenantPath("auction/currentState")
    → resolves to "tenants/bcc-s6-xxx/auction/currentState"
  → Render App with tenant context
```

### 5.2 Cross-Device Sync (Unchanged Logic, Tenant-Scoped Paths)

```
Desktop (/:tenantSlug/)
  → realtimeSync.broadcastState(player, bid, team, teams, active)
  → writes to tenants/{tenantId}/auction/currentState

Mobile (/:tenantSlug/connect-bidding)
  → realtimeSync.listenForStateChanges()
  → reads from tenants/{tenantId}/auction/currentState
  → realtimeSync.submitMobileBid(bid)
  → writes to tenants/{tenantId}/auction/mobileBids
```

### 5.3 Auction Persistence (Unchanged Logic, Tenant-Scoped Paths)

```
Mark Sold → auctionStore.markAsSold()
  → auctionPersistence.saveSoldPlayer(player, teamName)
  → writes to tenants/{tenantId}/auction/soldPlayers/{playerId}

Page Load → useAuctionDataLoader()
  → auctionPersistence.getSoldPlayers()
  → reads from tenants/{tenantId}/auction/soldPlayers
```

---

## 6. Authentication Design

### 6.1 Password Hashing (SHA-256 + Salt)

```typescript
// Browser-native, zero dependencies
async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### 6.2 Admin Account Schema

```typescript
interface AdminAccount {
  email: string;
  name: string;
  role: 'admin' | 'super-admin';
  passwordHash: string;        // SHA-256(password + salt)
  salt: string;                // 32-char hex
  createdAt: number;
  lastLogin?: number;
  isActive: boolean;
}
```

### 6.3 Session Schema

```typescript
interface AdminSession {
  email: string;
  token: string;
  tenantId: string;            // NEW — scoped to tenant
  tenantSlug: string;          // NEW — for URL construction
  expiresAt: number;
  isAuthenticated: boolean;
}
```

### 6.4 Login Flow

```typescript
async login(email: string, password: string, tenantId: string): Promise<AdminSession> {
  const emailKey = email.replace(/[.#$[\]]/g, '_');
  const accountRef = ref(db, `tenants/${tenantId}/admin/accounts/${emailKey}`);
  const snapshot = await get(accountRef);
  
  if (!snapshot.exists()) throw new Error('Account not found');
  
  const account = snapshot.val() as AdminAccount;
  if (!account.isActive) throw new Error('Account is inactive');
  
  const hash = await hashPassword(password, account.salt);
  if (hash !== account.passwordHash) throw new Error('Invalid password');
  
  const session: AdminSession = {
    email,
    token: generateToken(),
    tenantId,
    tenantSlug: /* resolved from platform/tenants */,
    expiresAt: Date.now() + SESSION_DURATION,
    isAuthenticated: true,
  };
  
  // Update last login
  await update(accountRef, { lastLogin: Date.now() });
  
  this.saveSessionToStorage(session);
  return session;
}
```

---

## 7. Migration Strategy

### 7.1 Backward Compatibility

During migration, support both old (root-level) and new (tenant-scoped) paths:

```typescript
function tenantPath(relativePath: string): string {
  const tenant = _activeTenantId;
  if (!tenant) {
    // Legacy mode — use root paths for backward compatibility
    console.warn('[tenantPath] No tenant set, using legacy root path');
    return relativePath;
  }
  return `tenants/${tenant}/${relativePath}`;
}
```

### 7.2 Migration Steps

1. Deploy tenant path helper with fallback to root (non-breaking)
2. Create first tenant entry in `platform/tenants/` for existing data
3. Run migration script to copy root data → `tenants/{firstTenantId}/`
4. Update all path constants to use `tenantPath()`
5. Update routing to `/:tenantSlug/*`
6. Verify existing auction flow works under tenant URL
7. Remove legacy root-level fallback
8. Clean up root-level data (after verification)

### 7.3 Zero-Downtime Deployment

- Step 1-3 are additive (no breaking changes)
- Step 4-5 are the atomic switch (deploy together)
- Step 6-8 are cleanup (can be done later)

---

## 8. Tenant Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                        TENANT LIFECYCLE                               │
│                                                                       │
│   Create         Configure        Auction Day      Post-Auction       │
│   ┌─────┐       ┌──────────┐     ┌───────────┐   ┌─────────────┐    │
│   │Super│──────▶│ Admin    │────▶│ Live      │──▶│ Matches     │    │
│   │Admin│       │ Setup    │     │ Auction   │   │ & Scoring   │    │
│   └─────┘       └──────────┘     └───────────┘   └─────────────┘    │
│     │              │                  │                 │             │
│     ▼              ▼                  ▼                 ▼             │
│   - slug         - teams           - bidding         - squad select  │
│   - plan         - players         - sold/unsold     - match scores  │
│   - admin        - sheets          - broadcast       - stats         │
│   - creds        - sponsors        - mobile bids     - leaderboard   │
│                  - themes                                             │
│                  - trials (opt.)                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Considerations

1. **Tenant isolation**: All RTDB reads/writes go through `tenantPath()` — no way to access another tenant's data from the app layer
2. **Password storage**: SHA-256 + per-account salt. Never store plaintext. Consider upgrading to bcrypt for production
3. **Session tokens**: Random 64-char hex strings stored in localStorage. 24h expiry
4. **RTDB rules**: Currently permissive (`.read: true, .write: true` per tenant). Plan to migrate to Firebase Auth for proper rule enforcement
5. **XSS protection**: React's JSX escaping handles output. No `dangerouslySetInnerHTML` in auth flows
6. **CORS**: Firebase Hosting serves SPA, RTDB SDK handles auth. No custom CORS needed

---

## 10. File Inventory

### Files to Modify (Phase 1)

```
src/services/realtimeSync.ts          ← 6 path constants → tenantPath()
src/services/auctionPersistence.ts    ← 7 DB_PATHS → tenantPath()
src/services/authService.ts           ← tenant-scoped accounts + password auth
src/services/auth.ts                  ← dynamic team credentials from Firebase
src/services/featureFlagsService.ts   ← tenant-scoped feature flags path
src/services/premiumService.ts        ← tenant-scoped premium paths
src/main.tsx                          ← tenant-prefixed routes
src/config/index.ts                   ← dynamic config from tenant DB
src/store/auctionStore.ts             ← tenant-aware persistence key
database.rules.json                   ← tenant isolation rules
```

### Files to Create (Phase 1-2)

```
src/services/tenantPath.ts            ← module-level tenant ID + path helpers
src/contexts/TenantContext.tsx         ← React context + provider
src/services/tenantService.ts         ← tenant CRUD + slug resolution
src/pages/FranchiseLoginPage.tsx      ← franchise login UI
src/pages/FranchiseLoginPage.css      ← franchise login styles
src/pages/PlatformAdminPage.tsx       ← super-admin panel
scripts/migrate-to-tenant.ts          ← one-time data migration
```

### Files to Create (Phase 3-4)

```
src/pages/TrialsPage.tsx              ← player trials
src/pages/MatchSelectionPage.tsx      ← squad selection
src/pages/MatchScorePage.tsx          ← live scoring
src/services/trialsService.ts         ← trials CRUD
src/services/matchService.ts          ← match/squad CRUD
src/services/scoring/ScoringAdapter.ts
src/services/scoring/CricHeroesAdapter.ts
src/services/scoring/ManualScoringAdapter.ts
src/services/scoring/ScoringService.ts
src/types/scoring.ts
src/components/AdminPanel/MatchFixtures.tsx
src/components/Trials/PlayerRatingCard.tsx
src/components/Trials/ShortlistManager.tsx
src/components/LiveScore/Scorecard.tsx
src/components/LiveScore/ScoreOverlay.tsx
```
