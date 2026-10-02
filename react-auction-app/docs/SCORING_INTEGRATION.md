# Match Scorer Integration — Design Doc

## 1. Overview

Integrate live match scoring into the auction platform using a **generic adapter pattern** that can plug into CricHeroes, CricBuzz, or any online scoring API. A manual scoring fallback is always available.

The adapter pattern decouples the app from any specific scoring provider, allowing franchises to choose their preferred scorer per match.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        APP LAYER                                  │
│  MatchScorePage  │  ScoreOverlay  │  Scorecard  │  AdminPanel    │
└──────────────────┼────────────────┼─────────────┼────────────────┘
                   │                │             │
                   ▼                ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SCORING SERVICE                               │
│  ScoringService (factory) → picks adapter per match config        │
│    ├── CricHeroesAdapter                                          │
│    ├── CricBuzzAdapter (future)                                   │
│    ├── CustomAPIAdapter (future)                                  │
│    └── ManualScoringAdapter (always available)                    │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FIREBASE RTDB (per tenant)                      │
│  tenants/{tenantId}/scoring/                                      │
│    matches/{matchId}/config    ← provider, API key, external ID   │
│    matches/{matchId}/live      ← real-time score data             │
│    matches/{matchId}/final     ← completed scorecard              │
│    playerStats/{playerId}/     ← aggregated + per-match stats     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Adapter Interface

```typescript
// src/services/scoring/ScoringAdapter.ts

export type ScoringProvider = 'cricheroes' | 'cricbuzz' | 'manual' | 'custom';

export interface IScoringAdapter {
  /** Provider identifier */
  readonly provider: ScoringProvider;

  /** Fetch completed match scorecard */
  fetchMatchScore(matchId: string): Promise<MatchScore>;

  /** Fetch a specific player's stats from a match */
  fetchPlayerMatchStats(matchId: string, playerId: string): Promise<PlayerMatchStats>;

  /** Subscribe to live score updates. Returns unsubscribe function. */
  syncLiveScore(matchId: string, callback: (score: LiveScore) => void): () => void;

  /** Check if the adapter is properly configured (API keys, etc.) */
  isConfigured(): boolean;

  /** Get human-readable provider name */
  getProviderName(): string;
}
```

---

## 4. Data Models

```typescript
// src/types/scoring.ts

// ── Match Score (completed match) ──

export interface MatchScore {
  matchId: string;
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  teams: { batting: string; bowling: string }[];
  innings: Innings[];
  result: MatchResult | null;
  toss: { wonBy: string; elected: 'bat' | 'bowl' } | null;
  venue: string;
  date: string;
  motm?: string; // Man of the Match player ID
}

export interface Innings {
  number: 1 | 2 | 3 | 4;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  totalOvers: number;
  maxOvers: number;
  extras: Extras;
  batsmen: BatsmanInnings[];
  bowlers: BowlerInnings[];
  fallOfWickets: FallOfWicket[];
}

export interface Extras {
  total: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
}

export interface BatsmanInnings {
  playerId: string;
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal: string; // "c Smith b Jones" or "not out"
  isOut: boolean;
}

export interface BowlerInnings {
  playerId: string;
  playerName: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noBalls: number;
}

export interface FallOfWicket {
  wicketNumber: number;
  score: number;
  overs: number;
  batsmanId: string;
}

export interface MatchResult {
  winner: string; // team ID
  margin: string; // "5 wickets" or "32 runs"
  method?: string; // "DLS" etc.
}

// ── Live Score (real-time updates) ──

export interface LiveScore {
  matchId: string;
  currentInnings: number;
  runs: number;
  wickets: number;
  overs: number;
  runRate: number;
  requiredRate?: number;
  target?: number;
  currentBatsmen: LiveBatsman[];
  currentBowler: LiveBowler;
  lastBall: string; // "4", "W", "1", "0", "6", "WD", "NB"
  recentOvers: string[]; // ["1 4 0 W 2 1", "0 0 6 1 2 0"]
  lastUpdated: number;
}

export interface LiveBatsman {
  playerId: string;
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOnStrike: boolean;
}

export interface LiveBowler {
  playerId: string;
  playerName: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
}

// ── Player Match Stats ──

export interface PlayerMatchStats {
  playerId: string;
  matchId: string;
  batting?: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
    dismissal: string;
  };
  bowling?: {
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
  };
  fielding?: {
    catches: number;
    runOuts: number;
    stumpings: number;
  };
}

// ── Player Career Stats (aggregated across matches) ──

export interface PlayerCareerStats {
  playerId: string;
  matchesPlayed: number;
  batting: {
    innings: number;
    runs: number;
    highestScore: number;
    average: number;
    strikeRate: number;
    fifties: number;
    hundreds: number;
    fours: number;
    sixes: number;
  };
  bowling: {
    innings: number;
    overs: number;
    wickets: number;
    bestBowling: string;
    average: number;
    economy: number;
    threeWickets: number;
    fiveWickets: number;
  };
  fielding: {
    catches: number;
    runOuts: number;
    stumpings: number;
  };
}

// ── Match Config (per-match scoring setup) ──

export interface MatchScoringConfig {
  provider: ScoringProvider;
  externalMatchId?: string;  // CricHeroes match ID, etc.
  apiKey?: string;           // Provider-specific API key
  webhookUrl?: string;       // For push-based providers
  pollIntervalMs?: number;   // For pull-based providers (default: 30000)
}
```

---

## 5. Adapter Implementations

### 5.1 CricHeroes Adapter

```typescript
// src/services/scoring/CricHeroesAdapter.ts

export class CricHeroesAdapter implements IScoringAdapter {
  readonly provider: ScoringProvider = 'cricheroes';
  
  private apiKey: string;
  private baseUrl: string;
  
  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.cricheroes.com/v1';
  }

  async fetchMatchScore(externalMatchId: string): Promise<MatchScore> {
    // GET {baseUrl}/matches/{externalMatchId}/scorecard
    // Transform CricHeroes response → MatchScore
    throw new Error('CricHeroes API integration pending — needs API key and endpoint verification');
  }

  async fetchPlayerMatchStats(externalMatchId: string, playerId: string): Promise<PlayerMatchStats> {
    // GET {baseUrl}/matches/{externalMatchId}/players/{playerId}
    throw new Error('CricHeroes API integration pending');
  }

  syncLiveScore(externalMatchId: string, callback: (score: LiveScore) => void): () => void {
    // Poll {baseUrl}/matches/{externalMatchId}/live every pollIntervalMs
    // Or use WebSocket if CricHeroes supports it
    const interval = setInterval(async () => {
      try {
        // const response = await fetch(...)
        // callback(transformToLiveScore(response))
      } catch (err) {
        console.error('[CricHeroes] Live score fetch failed:', err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getProviderName(): string {
    return 'CricHeroes';
  }
}
```

### 5.2 Manual Scoring Adapter

```typescript
// src/services/scoring/ManualScoringAdapter.ts

export class ManualScoringAdapter implements IScoringAdapter {
  readonly provider: ScoringProvider = 'manual';
  
  private db: Database;
  private tenantId: string;
  
  constructor(db: Database, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  async fetchMatchScore(matchId: string): Promise<MatchScore> {
    // Read from tenants/{tenantId}/scoring/matches/{matchId}/final
    const scoreRef = ref(this.db, `tenants/${this.tenantId}/scoring/matches/${matchId}/final`);
    const snapshot = await get(scoreRef);
    if (!snapshot.exists()) throw new Error('Score not found');
    return snapshot.val() as MatchScore;
  }

  async fetchPlayerMatchStats(matchId: string, playerId: string): Promise<PlayerMatchStats> {
    const statsRef = ref(this.db, 
      `tenants/${this.tenantId}/scoring/playerStats/${playerId}/matches/${matchId}`);
    const snapshot = await get(statsRef);
    if (!snapshot.exists()) throw new Error('Stats not found');
    return snapshot.val() as PlayerMatchStats;
  }

  syncLiveScore(matchId: string, callback: (score: LiveScore) => void): () => void {
    // Subscribe to tenants/{tenantId}/scoring/matches/{matchId}/live
    const liveRef = ref(this.db, `tenants/${this.tenantId}/scoring/matches/${matchId}/live`);
    const unsub = onValue(liveRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as LiveScore);
      }
    });
    return unsub;
  }

  // ── Manual entry methods (not in IScoringAdapter) ──

  async updateLiveScore(matchId: string, score: Partial<LiveScore>): Promise<void> {
    const liveRef = ref(this.db, `tenants/${this.tenantId}/scoring/matches/${matchId}/live`);
    await set(liveRef, { ...score, lastUpdated: Date.now() });
  }

  async saveMatchScore(matchId: string, score: MatchScore): Promise<void> {
    const finalRef = ref(this.db, `tenants/${this.tenantId}/scoring/matches/${matchId}/final`);
    await set(finalRef, score);
  }

  async savePlayerStats(matchId: string, playerId: string, stats: PlayerMatchStats): Promise<void> {
    const statsRef = ref(this.db, 
      `tenants/${this.tenantId}/scoring/playerStats/${playerId}/matches/${matchId}`);
    await set(statsRef, stats);
  }

  isConfigured(): boolean {
    return true; // Always available
  }

  getProviderName(): string {
    return 'Manual Scoring';
  }
}
```

### 5.3 Scoring Service (Factory)

```typescript
// src/services/scoring/ScoringService.ts

export class ScoringService {
  private adapters: Map<string, IScoringAdapter> = new Map();
  private db: Database;
  private tenantId: string;

  constructor(db: Database, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
    // Always register manual adapter
    this.adapters.set('manual', new ManualScoringAdapter(db, tenantId));
  }

  /** Register a scoring adapter */
  registerAdapter(adapter: IScoringAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /** Get adapter for a specific match based on its config */
  async getAdapterForMatch(matchId: string): Promise<IScoringAdapter> {
    const configRef = ref(this.db, 
      `tenants/${this.tenantId}/scoring/matches/${matchId}/config`);
    const snapshot = await get(configRef);
    
    if (!snapshot.exists()) {
      return this.adapters.get('manual')!;
    }

    const config = snapshot.val() as MatchScoringConfig;
    const adapter = this.adapters.get(config.provider);
    
    if (!adapter || !adapter.isConfigured()) {
      console.warn(`[ScoringService] Adapter "${config.provider}" not available, falling back to manual`);
      return this.adapters.get('manual')!;
    }

    return adapter;
  }

  /** Configure scoring for a match */
  async configureMatch(matchId: string, config: MatchScoringConfig): Promise<void> {
    const configRef = ref(this.db, 
      `tenants/${this.tenantId}/scoring/matches/${matchId}/config`);
    await set(configRef, config);
  }

  /** Get available providers */
  getAvailableProviders(): { provider: ScoringProvider; name: string; configured: boolean }[] {
    return Array.from(this.adapters.values()).map(a => ({
      provider: a.provider,
      name: a.getProviderName(),
      configured: a.isConfigured(),
    }));
  }

  /** Aggregate player career stats from all matches */
  async aggregatePlayerCareerStats(playerId: string): Promise<PlayerCareerStats> {
    const matchesRef = ref(this.db, 
      `tenants/${this.tenantId}/scoring/playerStats/${playerId}/matches`);
    const snapshot = await get(matchesRef);
    
    if (!snapshot.exists()) {
      return createEmptyCareerStats(playerId);
    }

    const matchStats: Record<string, PlayerMatchStats> = snapshot.val();
    return aggregateStats(playerId, Object.values(matchStats));
  }
}
```

---

## 6. Database Schema

```
tenants/{tenantId}/scoring/
  matches/
    {matchId}/
      config/
        provider: "cricheroes" | "manual" | "cricbuzz" | "custom"
        externalMatchId?: string
        apiKey?: string
        pollIntervalMs?: number
      live/
        matchId: string
        currentInnings: number
        runs: number
        wickets: number
        overs: number
        runRate: number
        requiredRate?: number
        target?: number
        currentBatsmen: LiveBatsman[]
        currentBowler: LiveBowler
        lastBall: string
        recentOvers: string[]
        lastUpdated: number
      final/
        matchId: string
        status: string
        innings: Innings[]
        result: MatchResult
        toss: { wonBy, elected }
        venue: string
        date: string
        motm?: string
  playerStats/
    {playerId}/
      career/
        matchesPlayed: number
        batting: { innings, runs, highestScore, average, ... }
        bowling: { innings, overs, wickets, bestBowling, ... }
        fielding: { catches, runOuts, stumpings }
      matches/
        {matchId}/
          batting?: { runs, balls, fours, sixes, strikeRate, dismissal }
          bowling?: { overs, maidens, runs, wickets, economy }
          fielding?: { catches, runOuts, stumpings }
```

---

## 7. UI Components

### 7.1 Match Score Page (`/matches/:matchId/score`)

- Live scorecard with auto-updating runs/wickets/overs
- Current batsmen and bowler stats
- Recent overs timeline (last ball animation)
- Full innings scorecard tabs
- Fall of wickets graph
- Can be embedded as overlay in LivePage broadcast

### 7.2 Score Overlay (for LivePage broadcast)

- Compact scoreboard strip at bottom of broadcast
- Shows: TeamA vs TeamB, Score, Overs, RR
- Updates in real-time from Firebase listener
- Toggleable from LiveAdminPage broadcast controls

### 7.3 Admin Scoring Config (in AdminPanel)

- Per-match: select scoring provider from dropdown
- Enter external match ID (for CricHeroes link)
- API key configuration
- Manual score entry form (when provider = "manual")

---

## 8. Integration Points with CricHeroes

### Known CricHeroes Patterns

1. **Match URLs**: `https://cricheroes.com/scorecard/{matchId}` — public scorecards
2. **Match embed**: Some tournaments share embed links
3. **API**: CricHeroes has a mobile API (not officially documented for third-party use)
4. **Data format**: Standard cricket scorecard with innings, batsmen, bowlers, extras

### Integration Strategy

1. **Phase 1**: Build with ManualScoringAdapter + data models
2. **Phase 2**: Add CricHeroes scraper/API adapter when API access is available
3. **Phase 3**: Support webhooks from CricHeroes (if they offer push notifications)
4. **Fallback**: Always keep manual adapter as default

### API Key Management

- Store per-tenant API keys in: `tenants/{tenantId}/scoring/providerConfig/{provider}/apiKey`
- Never expose keys in client bundle — keys stored in Firebase RTDB (secured by rules)
- For third-party APIs requiring server-side auth, use Firebase Cloud Functions as proxy

---

## 9. Files to Create

```
src/services/scoring/
  ScoringAdapter.ts           ← IScoringAdapter interface
  CricHeroesAdapter.ts        ← CricHeroes implementation (stub)
  ManualScoringAdapter.ts     ← Manual entry implementation
  ScoringService.ts           ← Factory + aggregation
  index.ts                    ← barrel exports

src/types/
  scoring.ts                  ← All scoring type definitions

src/pages/
  MatchScorePage.tsx          ← Live score view page

src/components/LiveScore/
  Scorecard.tsx               ← Full innings scorecard
  ScoreOverlay.tsx            ← Compact broadcast overlay
  LiveScoreStrip.tsx          ← Bottom strip for broadcast
  BatsmanCard.tsx             ← Current batsman display
  BowlerCard.tsx              ← Current bowler display
  RecentOvers.tsx             ← Last few overs visual

src/components/AdminPanel/
  ScoringConfig.tsx           ← Admin scoring provider setup
  ManualScoreEntry.tsx        ← Manual score input form
```

---

## 10. Verification Checklist

- [ ] ManualScoringAdapter: write score → read score round-trip works
- [ ] ScoringService: falls back to manual when configured adapter unavailable
- [ ] LiveScore subscription: Firebase `onValue` listener fires on score update
- [ ] Player career aggregation: sums stats across multiple matches correctly
- [ ] Score overlay renders in LivePage without disrupting broadcast
- [ ] Admin can configure scoring provider per match
- [ ] API keys stored securely in Firebase (not in client code)
- [ ] TypeScript compiles clean with all scoring types

## 11. OBS DRS Review And Broadcast Scheduling

- In Scorer Admin > OBS WS, configure DRS capture duration (default 40 seconds), frames per step, replay video FPS, and the Go Live scene. Save settings and run Match Setup to create/update the separate DRS media and Replay Source inputs. Existing button enable/disable and Dock visibility choices are preserved.
- OBS has one built-in Replay Buffer. Its duration must cover the longer of normal replay and DRS. If the buffer is already running with a shorter duration, stop it and rerun Match Setup. Allow the buffer to fill before reviewing; a newly started buffer cannot recover video from before it started. Also allocate sufficient replay-buffer memory in OBS Output settings.
- DRS waits for the actual saved-file event, loads the separate media source at 60% speed, and pauses it for review. Reverse/forward frame controls pause before seeking. Set FPS to the recorded video's FPS; OBS WebSocket seeks in milliseconds, not codec frame numbers. Normal replay playback keeps its separate configured window.
- The DRS dock view hides other controls until Go Live. The OBS WS button editor controls Dock visibility and Main/DRS placement. Replay-only dock mode hides scoring sections and connected-state connection controls. Go Live remains available as a safety exit.
- In Matches, Broadcast schedules creates missing schedules in bulk. Time default creates missing fixture schedules at kickoff minus 10 minutes, including newly added fixtures. Existing entries are never overwritten by either action, even after a failed start.
- Scheduling requires a live app/Dock OBS connection and a configured YouTube output destination with a stream key (or an already-active YouTube output). The connected OBS owner checks readiness again when executing the start. Stream keys are not stored in bridge presence or schedule entries. OBS WebSocket cannot prove that a YouTube OAuth account is signed in or that a configured key is valid.
- Keep Matches or the Streaming tab open and the OBS owner connected for automatic starts. These are browser-driven OBS start schedules, not server-side timers or YouTube scheduled-event creation. Firebase schedule creation and start claims use transactions to prevent duplicate creation/start attempts across open clients.
- No real OBS/YouTube broadcast is started by automated tests. Perform a private YouTube/OBS smoke test on the target production machine before operating a live match.

## 12. Public Scoreboard Scorecard Corrections

- The public scoreboard filters All, Live, Upcoming, and Completed fixtures from the top bar. Completed fixtures open on Scorecards; live fixtures retain separate Scorecards and Ball-by-ball tabs. Points Table remains available from the top bar even when a fixture filter is empty.
- Edit scorecard is available in both Scorecards and Ball-by-ball. It prompts for the configured Auction Admin > Super Admin Mobile Access username/password. Completed edits recalculate the match result; live edits reconcile the current score and second-innings target/rate. Innings totals, extras, overs, wickets, and player figures are validated before an atomic innings/live/final write.
- Corrections do not rewrite historical ball events or recalculate persisted match award snapshots. The configured mobile credentials are checked in the browser only. Current Realtime Database rules allow public reads/writes, so this UI gate is not a security boundary; server-enforced authorization requires a separate Firebase rules/auth backend change.
