# Player Lifecycle — Design Doc

## 1. Overview

The full player lifecycle in the SaaS platform spans four stages:

```
┌─────────┐     ┌──────────┐     ┌────────────────┐     ┌───────────┐
│ TRIALS  │────▶│ AUCTION  │────▶│ SQUAD SELECTION │────▶│ MATCH DAY │
│         │     │          │     │                 │     │           │
│ Browse  │     │ Bid      │     │ Pick XI         │     │ Score     │
│ Rate    │     │ Sold     │     │ Captain         │     │ Stats     │
│ Shortl. │     │ Unsold   │     │ Substitutes     │     │ MOTM      │
└─────────┘     └──────────┘     └────────────────┘     └───────────┘
```

Each stage builds on data from the previous one. All data is tenant-scoped under `/tenants/{tenantId}/`.

---

## 2. Stage 1: Player Trials

### 2.1 Purpose

Before auction day, team owners can:
- Browse all registered players
- View player stats and CricHeroes profiles
- Rate players (1-5 stars) with notes
- Create private shortlists (prioritized)
- Attend trial sessions and mark attendance

### 2.2 Database Schema

```
tenants/{tenantId}/trials/
  players/
    {playerId}/
      ratings/
        {teamId}/
          score: number (1-5)
          notes: string
          ratedBy: string (admin email)
          timestamp: number
      shortlists/
        {teamId}/
          priority: number (1-N, lower = higher priority)
          notes: string
          addedBy: string
          timestamp: number
  sessions/
    {sessionId}/
      date: string (ISO)
      location: string
      description: string
      status: "scheduled" | "in-progress" | "completed"
      playerIds: string[]
      attendance/
        {playerId}/
          present: boolean
          notes: string
      createdBy: string
      createdAt: number
```

### 2.3 Access Control

| Role | Can Do |
|------|--------|
| Tournament Admin | Create trial sessions, view all ratings, manage shortlists |
| Team Owner/Admin | Rate players, manage own team's shortlist |
| Team Scout | View players, add ratings (read-only shortlist) |
| Player | Cannot access trials data |

### 2.4 UI: Trials Page (`/:tenantSlug/trials`)

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ HEADER: Tournament Name │ Trial Sessions │ My Team   │
├──────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌────────────────────────────┐ │
│ │ FILTERS         │  │ PLAYER GRID                │ │
│ │ ☐ Role          │  │ ┌──────┐ ┌──────┐ ┌──────┐│ │
│ │ ☐ Age Range     │  │ │Player│ │Player│ │Player││ │
│ │ ☐ Base Price    │  │ │Card  │ │Card  │ │Card  ││ │
│ │ ☐ Rating ≥      │  │ │★★★★☆│ │★★★☆☆│ │★★★★★││ │
│ │ ☐ Shortlisted   │  │ │[Rate]│ │[Rate]│ │[Rate]││ │
│ │                 │  │ └──────┘ └──────┘ └──────┘│ │
│ │ SHORTLIST       │  │                            │ │
│ │ 1. Player A     │  │ ┌──────┐ ┌──────┐ ┌──────┐│ │
│ │ 2. Player B     │  │ │Player│ │Player│ │Player││ │
│ │ 3. Player C     │  │ │Card  │ │Card  │ │Card  ││ │
│ │ [Reorder]       │  │ │★★☆☆☆│ │★★★★☆│ │★★★☆☆││ │
│ └─────────────────┘  │ │[Rate]│ │[Rate]│ │[Rate]││ │
│                      │ └──────┘ └──────┘ └──────┘│ │
│                      └────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Components:**
- `PlayerRatingCard` — player photo, name, role, stats, star rating, shortlist toggle
- `ShortlistManager` — draggable priority list, export to PDF
- `TrialSessionManager` — create sessions, mark attendance, filter by session

### 2.5 Service: `trialsService.ts`

```typescript
class TrialsService {
  // Player ratings
  async ratePlayer(playerId: string, teamId: string, score: number, notes: string): Promise<void>;
  async getPlayerRatings(playerId: string): Promise<Record<string, Rating>>;
  async getTeamRatings(teamId: string): Promise<Record<string, Rating>>;
  
  // Shortlists
  async addToShortlist(playerId: string, teamId: string, priority: number): Promise<void>;
  async removeFromShortlist(playerId: string, teamId: string): Promise<void>;
  async getTeamShortlist(teamId: string): Promise<ShortlistEntry[]>;
  async reorderShortlist(teamId: string, orderedPlayerIds: string[]): Promise<void>;
  
  // Trial sessions
  async createSession(session: TrialSession): Promise<string>;
  async updateAttendance(sessionId: string, playerId: string, present: boolean): Promise<void>;
  async getSessionPlayers(sessionId: string): Promise<PlayerAttendance[]>;
  async listSessions(): Promise<TrialSession[]>;
}
```

---

## 3. Stage 2: Auction (Existing — Enhanced)

### 3.1 Current State

The auction system is fully built and operational:
- Sequential/random player selection
- Real-time bidding with keyboard shortcuts
- Mobile bidding via Firebase Realtime Database
- Sold/unsold tracking with Firebase persistence
- Multiple rounds (unsold players re-enter)
- Live broadcast view with overlays

### 3.2 Enhancements for SaaS

| Enhancement | Description |
|-------------|-------------|
| Tenant scoping | All auction paths prefixed with `tenants/{tenantId}/` |
| Shortlist badges | Show "★ Shortlisted by N teams" on player card during auction |
| Trial ratings | Show average trial rating on player card |
| Franchise branding | Tenant logo, colors, theme loaded from tenant config |
| Auction analytics | Post-auction stats: spend distribution, role balance, etc. |

### 3.3 Auction → Squad Data Bridge

When a player is sold, the system already writes to `auction/soldPlayers/{playerId}`. The squad selection module reads this to populate the team roster.

```
Auction marks sold → auctionPersistence.saveSoldPlayer(player, teamName)
  → tenants/{tenantId}/auction/soldPlayers/{playerId}
    { playerName, role, teamName, teamId, soldAmount, basePrice, ... }

Squad selection reads → matchService.getTeamRoster(teamId)
  → filters soldPlayers where teamId matches
  → returns list for squad picker
```

---

## 4. Stage 3: Match Squad Selection

### 4.1 Purpose

After the auction, for each match in the tournament schedule:
- Team owners select their Playing XI from bought players
- Designate captain and vice-captain
- Pick substitutes
- Admin can set deadlines for squad submission

### 4.2 Database Schema

```
tenants/{tenantId}/matches/
  {matchId}/
    info/
      matchNumber: number
      date: string (ISO)
      time: string
      venue: string
      teams: [teamAId, teamBId]
      status: "scheduled" | "squad-selection" | "toss" | "live" | "completed"
      squadDeadline: number (timestamp)
      createdBy: string
      createdAt: number
    squads/
      {teamId}/
        playingXI: string[]         ← 11 player IDs
        substitutes: string[]       ← substitute player IDs
        captain: string             ← player ID
        viceCaptain: string         ← player ID
        submittedBy: string
        submittedAt: number
        isLocked: boolean           ← true after deadline
    toss/
      wonBy: string                 ← team ID
      elected: "bat" | "bowl"
      recordedBy: string
      recordedAt: number
    result/
      winner: string | null         ← team ID or null (tie/draw)
      margin: string                ← "5 wickets", "32 runs"
      method: string                ← "DLS", "Super Over", etc.
      motm: string                  ← player ID
      recordedBy: string
      recordedAt: number
```

### 4.3 Match Fixtures (Admin)

```
tenants/{tenantId}/matches/schedule/
  format: "league" | "knockout" | "group-stage" | "custom"
  totalMatches: number
  matchList: string[]              ← ordered match IDs
  groups/                          ← for group-stage format
    {groupName}/
      teams: string[]
      matchIds: string[]
  knockoutBracket/                 ← for knockout format
    rounds: { roundName, matchIds }[]
```

### 4.4 UI: Match Selection Page (`/:tenantSlug/matches`)

**Layout (Team View):**
```
┌──────────────────────────────────────────────────────┐
│ HEADER: Match #3 │ Team A vs Team B │ Deadline: 2h   │
├──────────────────────────────────────────────────────┤
│ ┌─────────────────────┐  ┌──────────────────────────┐│
│ │ MY ROSTER (15)      │  │ PLAYING XI              ││
│ │ ┌─────────────────┐ │  │                          ││
│ │ │ ★ Player A (C)  │ │  │  1. ★ Player A (C)     ││
│ │ │   Batsman       │◀├──│  2. Player D (VC)       ││
│ │ │   ₹5000 │ ★4.2  │ │  │  3. Player E            ││
│ │ ├─────────────────┤ │  │  4. Player G            ││
│ │ │   Player B      │ │  │  5. Player H            ││
│ │ │   Bowler        │ │  │  6. Player J            ││
│ │ │   ₹3000 │ ★3.8  │ │  │  7. Player K            ││
│ │ ├─────────────────┤ │  │  8. Player L            ││
│ │ │   Player C      │ │  │  9. Player M            ││
│ │ │   All-Rounder   │ │  │ 10. Player N            ││
│ │ │   ₹4500 │ ★4.5  │ │  │ 11. Player O            ││
│ │ └─────────────────┘ │  │                          ││
│ │ [+ Add to XI]       │  │ SUBSTITUTES             ││
│ │                     │  │  Sub 1. Player B         ││
│ │ COMPOSITION:        │  │  Sub 2. Player C         ││
│ │ BAT: 4 BWL: 3      │  │                          ││
│ │ AR: 2  WK: 1       │  │ [Submit Squad] [Reset]   ││
│ └─────────────────────┘  └──────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Admin View adds:**
- Match fixture creation (date, venue, teams)
- Squad deadline management
- Toss recording
- Result recording
- Lock/unlock squads

### 4.5 Service: `matchService.ts`

```typescript
class MatchService {
  // Match management (admin)
  async createMatch(info: MatchInfo): Promise<string>;
  async updateMatch(matchId: string, info: Partial<MatchInfo>): Promise<void>;
  async deleteMatch(matchId: string): Promise<void>;
  async listMatches(): Promise<MatchInfo[]>;
  async getMatch(matchId: string): Promise<FullMatchData>;
  
  // Schedule management (admin)
  async setScheduleFormat(format: ScheduleConfig): Promise<void>;
  async getSchedule(): Promise<ScheduleConfig>;
  
  // Squad selection (team)
  async getTeamRoster(teamId: string): Promise<SoldPlayer[]>;
  async submitSquad(matchId: string, teamId: string, squad: SquadSubmission): Promise<void>;
  async getSquad(matchId: string, teamId: string): Promise<SquadData | null>;
  async lockSquad(matchId: string, teamId: string): Promise<void>;
  
  // Toss & result (admin)
  async recordToss(matchId: string, toss: TossData): Promise<void>;
  async recordResult(matchId: string, result: ResultData): Promise<void>;
  
  // Points table (computed)
  async getPointsTable(): Promise<PointsTableEntry[]>;
}
```

### 4.6 Points Table

Computed from match results. Stored at `tenants/{tenantId}/matches/pointsTable/`:

```typescript
interface PointsTableEntry {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  netRunRate: number;
  position: number;
}
```

---

## 5. Stage 4: Match Day (Scoring)

See `docs/SCORING_INTEGRATION.md` for the full scoring adapter design.

### 5.1 Data Flow on Match Day

```
Match Status: "live"
  │
  ├── Manual Scorer enters ball-by-ball updates
  │   OR
  ├── CricHeroes adapter syncs live score
  │
  ▼
tenants/{tenantId}/scoring/matches/{matchId}/live
  │
  ├── MatchScorePage subscribes → shows live scorecard
  ├── LivePage ScoreOverlay subscribes → shows score strip on broadcast
  └── After match completes:
      ├── Write to scoring/matches/{matchId}/final
      ├── Aggregate to scoring/playerStats/{playerId}/career
      └── Update matches/{matchId}/result
```

### 5.2 Post-Match Stats Integration

After each match, player career stats are aggregated:

```typescript
// After match completes
async function postMatchProcessing(matchId: string): Promise<void> {
  const matchScore = await scoringService.fetchMatchScore(matchId);
  
  for (const innings of matchScore.innings) {
    // Update batting stats
    for (const batsman of innings.batsmen) {
      await updateCareerBattingStats(batsman.playerId, batsman);
    }
    // Update bowling stats
    for (const bowler of innings.bowlers) {
      await updateCareerBowlingStats(bowler.playerId, bowler);
    }
  }
}
```

These career stats can then be displayed:
- On player cards during next season's auction
- In the trials page for team owners to evaluate
- In the team roster view

---

## 6. Cross-Stage Data Relationships

```
                    TRIALS                 AUCTION              SQUAD                MATCH
                    ──────                 ───────              ─────                ─────
Player ID ─────┬── ratings/{teamId}   ┬── soldPlayers/{id}  ┬── squads/{teamId}  ┬── playerStats/{id}
               │   shortlists/{teamId}│   teamId, amount    │   playingXI[]      │   batting, bowling
               │                      │                     │   captain           │   fielding
               ▼                      ▼                     ▼                     ▼
Team ID ───┬── rates & shortlists  ┬── buys players     ┬── submits squad    ┬── team results
           │   for specific team   │   with budget       │   for each match   │   points table
           │                      │                     │                     │
           ▼                      ▼                     ▼                     ▼
Match ID ──────────────────────────────────────────────── fixtures              scoring/matches/{id}
```

### Key Lookups

| Query | Path | Purpose |
|-------|------|---------|
| "Players my team shortlisted" | `trials/players/*/shortlists/{myTeamId}` | Pre-auction prep |
| "Players my team bought" | `auction/soldPlayers` where `teamId === myTeamId` | Build roster |
| "My squad for match 5" | `matches/{match5Id}/squads/{myTeamId}` | Squad selection |
| "Player X's career stats" | `scoring/playerStats/{playerXId}/career` | Scouting |
| "All match results" | `matches/*/result` | Points table |

---

## 7. Files to Create

### Phase 3: Trials

```
src/pages/TrialsPage.tsx
src/pages/TrialsPage.css
src/services/trialsService.ts
src/components/Trials/
  PlayerRatingCard.tsx
  PlayerRatingCard.css
  ShortlistManager.tsx
  ShortlistManager.css
  TrialSessionManager.tsx
  index.ts
src/types/trials.ts     ← or add to existing types/index.ts
```

### Phase 3: Match Selection

```
src/pages/MatchSelectionPage.tsx
src/pages/MatchSelectionPage.css
src/services/matchService.ts
src/components/MatchSelection/
  SquadPicker.tsx
  SquadPicker.css
  MatchCard.tsx
  MatchFixtureCreator.tsx
  PointsTable.tsx
  TossRecorder.tsx
  index.ts
src/components/AdminPanel/MatchFixtures.tsx    ← integrate into existing admin
src/types/matches.ts    ← or add to existing types/index.ts
```

---

## 8. Implementation Order

1. **Match fixtures admin** (create matches, set schedule) — needed before squads
2. **Team roster view** (read from `soldPlayers`) — needed before squad picking
3. **Squad selection UI** (pick XI, captain, subs) — core feature
4. **Player trials** (rate, shortlist) — can be built in parallel
5. **Points table** (computed from results) — after match results exist
6. **Post-match stats aggregation** — after scoring integration (Phase 4)

---

## 9. Verification Checklist

- [ ] Trial ratings persist to Firebase under correct tenant path
- [ ] Shortlist reordering maintains priority numbers correctly
- [ ] Team can only see their own shortlist (other teams' lists are private)
- [ ] Sold players appear in team roster for squad selection
- [ ] Squad picker enforces exactly 11 players
- [ ] Squad submission respects deadline (cannot submit after lock)
- [ ] Captain and vice-captain must be from playing XI
- [ ] Match creation validates: no overlapping fixtures for same team
- [ ] Points table computes correctly from match results
- [ ] Player career stats aggregate across matches
- [ ] All data isolated per tenant (no cross-tenant data leaks)
