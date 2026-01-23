# Jump-to-Player & Alternating Team Bidding - Implementation Guide

## Overview
This update adds two critical auction features:
1. **Jump-to-Player (F hotkey)**: Navigate to any player in sequential order with a simple modal
2. **Alternating Team Bidding**: Enforce rules so the same team cannot bid twice consecutively

## Feature 1: Jump-to-Player Sequential Navigation

### How It Works

**Activation**: Press **F** key
- Opens a modal dialog asking for player number
- Input field is automatically focused
- Modal shows valid player range (1 to Total available)

**Input Handling**:
- Enter player number and press Enter or click "Go"
- ESC key closes modal without selection
- Invalid input shows helpful error messages

**Behind the Scenes**:
```typescript
jumpToPlayerIndex(playerNumber) {
  1. Validate the player number exists
  2. Find player at that index in available players
  3. Reorder array: [target, ...remaining]
  4. Select target player and clear bid history
  5. Reset lastBidTeamId to allow any team to bid first
}
```

### Use Cases
- **Skipped Player**: Jump back to a player you meant to bid on
- **Demo/Testing**: Quickly navigate to specific players
- **Multi-Round Auctions**: Jump to next player after reviewing stats
- **Recovery**: Go to a specific player number without scrolling

### Example Flow
```
Press F → Modal opens "Jump to Player"
Enter: 25 → Player #25 becomes current, reordered to first
App selects that player → Teams can bid
Next/Previous buttons now navigate from this player
```

### UI/UX Details
- Modal styled with dark background and blur effect
- Input field shows valid range as placeholder
- "Go" button or Enter key to submit
- Hint text at bottom: "Hotkey: Press F"
- Error messages in red below input
- Auto-focus on input ensures quick typing

### Limitations
- Only works in **sequential mode** (not random mode)
- Cannot jump to sold/unsold players
- Jumping resets bid history for that player
- Last bid team tracking resets

## Feature 2: Alternating Team Bidding Rule

### Problem Solved
Previously, a team could bid multiple times in a row on a player, which breaks realistic auction dynamics. Now enforces alternating bidding.

### How It Works

**Tracking**: Store `lastBidTeamId` for each player auction
- Updated whenever a team places a bid
- Reset when new player is selected
- Reset on undo (decrementBid)
- Reset on bid reset

**Enforcement**: When team tries to bid
```typescript
if (lastBidTeamId === team.id && bidHistory.length > 0) {
  Show error: "Team X must wait for another team to bid first"
  Return false - bid rejected
}
```

**Implementation**: Uses new `raiseBidForTeam(team, steps)` action
- Called by number hotkeys (1-9)
- Called by increment bid when team selected
- Checks alternation rule before incrementing
- Returns false if bid rejected

### Example Scenario

```
Initial: lastBidTeamId = null
Team A bids 100 → lastBidTeamId = A, currentBid = 100
Team A presses 1 again → Error: "Team A must wait..."
Team B presses 2 → Allowed, lastBidTeamId = B, currentBid = 200
Team B presses 2 again → Error: "Team B must wait..."
Team A presses 1 → Allowed, lastBidTeamId = A, currentBid = 300
```

### When Rules Apply
- ✅ Number key shortcuts (1-9)
- ✅ Increment bid with team selected (Q increases multiplier)
- ✅ Direct placeBid call
- ❌ Decrement bid (undo) - restores previous team/state
- ❌ Reset bid - clears lastBidTeamId

### User Feedback
When alternation rule violated:
```
Notification Type: Warning
Message: "{TeamName} must wait for another team to bid before bidding again"
Location: Top notification toast
Duration: Auto-clear after 3 seconds
```

## Implementation Details

### Store Changes (auctionStore.ts)

**New State Field**:
```typescript
lastBidTeamId: string | null;  // Tracks which team bid last
```

**New Actions**:
```typescript
raiseBidForTeam(team, steps = 1): boolean
  - Enforces alternation rule
  - Multiplies bid increase by steps
  - Returns success status
  - Shows error notifications

jumpToPlayerIndex(index): boolean
  - Validates player index (1-based)
  - Reorders available players
  - Selects target player
  - Resets bid state
```

**Modified Actions**:
```typescript
placeBid()
  - Now checks lastBidTeamId rule
  - Updates lastBidTeamId on success

decrementBid()
  - Restores lastBidTeamId from bid history

selectPlayer()
  - Resets lastBidTeamId to null

resetBid()
  - Resets lastBidTeamId to null
```

### Hook Changes (useAuction.ts)

**New Methods**:
```typescript
raiseBidForTeam(team, steps)   // Wrapper for store action
jumpToPlayerIndex(index)        // Wrapper for store action
```

### Keyboard Handler Changes (useKeyboardShortcuts.ts)

**F Key Handler**:
```typescript
if (key === hotkeys.jumpToPlayer) {
  onCustomAction('jumpToPlayer')  // Triggers modal open
}
```

**Number Key Enhancement**:
```typescript
// Now uses raiseBidForTeam instead of separate selectTeam + incrementBid
auction.selectTeam(team)
auction.raiseBidForTeam(team, bidMultiplier)
```

### App Component Changes (App.tsx)

**New State**:
```typescript
showJumpModal: boolean              // Modal visibility
jumpInput: string                   // User input value
jumpError: string                   // Error message
jumpInputRef: Ref                   // For auto-focus
```

**New Handler**:
```typescript
handleJumpSubmit()
  - Validates input
  - Checks sequential mode
  - Calls jumpToPlayerIndex
  - Shows errors or closes modal
```

**Modal Rendering**:
- Portal to document.body (z-index 11000)
- Dark overlay with blur
- Input field with numeric mode
- "Go" button
- Error display below input

**Auto-Focus**:
```typescript
useEffect(() => {
  if (showJumpModal) {
    requestAnimationFrame(() => jumpInputRef.current?.focus())
  }
}, [showJumpModal])
```

## Testing Scenarios

### Jump-to-Player Tests

1. **Basic Jump**
   - Press F, enter "5", press Enter
   - Verify: Player 5 now selected, becomes first in queue

2. **Invalid Number**
   - Press F, enter "999", press Enter
   - Verify: Error message shows "Enter a number between 1 and N"

3. **Invalid Input**
   - Press F, enter "abc", press Enter
   - Verify: Error message shows "Enter a player number"

4. **ESC Close**
   - Press F, press ESC
   - Verify: Modal closes, no player change

5. **Enter Key Submit**
   - Press F, type "10", press Enter
   - Verify: Modal closes, player 10 selected

6. **Go Button**
   - Press F, type "3", click "Go"
   - Verify: Modal closes, player 3 selected

### Alternating Team Bidding Tests

1. **Basic Alternation**
   - Team A bids (press 1)
   - Team A presses 1 again → Shows error
   - Team B presses 2 → Works
   - Team B presses 2 again → Shows error
   - Team A presses 1 → Works

2. **Undo (Z key)**
   - Team A bids 100
   - Team B bids 200
   - Team B presses Z (undo)
   - Team A can now bid again (previous state restored)

3. **New Player**
   - Team A bids on Player 1
   - Press N to go to Player 2
   - Team A can bid first on Player 2 (rule resets per player)

4. **Reset Bid**
   - Team A bids
   - Press R to reset bid
   - Team A can bid again (bid history cleared)

5. **Multiplier Bidding**
   - Q (increase multiplier to 2x)
   - Team A presses 1 → Bids 2 steps
   - Team A presses 1 again → Error (rule enforced)
   - Team B presses 2 → Works

## Error Messages

| Scenario | Message |
|----------|---------|
| Team bids twice | "{Team} must wait for another team to bid first" |
| Jump in random mode | "Jump works in sequential mode only" |
| Jump with no players | "No available players to jump to" |
| Invalid jump number | "Enter a player number between 1 and N" |
| Non-numeric input | "Enter a player number" |
| Team already bid | "Team X cannot bid more than ₹XXL" |

## Performance Impact

- **Modal**: Instant open/close (CSS animations)
- **Jump**: O(N) reordering of player array (negligible for ~450 players)
- **Bid Check**: O(1) lastBidTeamId comparison
- **No Network**: All operations local/synchronous

## Browser Compatibility

- ✅ Auto-focus via requestAnimationFrame
- ✅ Numeric input mode (mobile keyboards)
- ✅ ESC key handling
- ✅ Portal rendering to document.body
- ✅ CSS custom properties for theme colors

## Accessibility

- Modal has proper z-index layering
- Input has clear placeholder
- Error messages in plain text
- Keyboard navigation (Tab, Enter, ESC)
- Color contrast meets WCAG standards
- Focus outline visible on input field

## Git Info

```
Commit: 97a4d5bcec5f75d4683e0ffab760533540d9604f
Branch: feature/v2-major-upgrade
Files: 5 changed, 429 insertions(+)
Changes:
  - src/store/auctionStore.ts: +240 lines (state, actions)
  - src/hooks/useAuction.ts: +15 lines (wrappers)
  - src/hooks/useKeyboardShortcuts.ts: +20 lines (F key handler)
  - src/App.tsx: +154 lines (modal, state, handlers)
```

## Future Enhancements

- [ ] Save jump history for quick re-access
- [ ] Numeric keypad support
- [ ] Voice input for player numbers
- [ ] Bidding statistics showing alternation patterns
- [ ] Configure min teams before same team can bid again (instead of always 1)
- [ ] Visualization of bid history tree
- [ ] Replay auction from any point with alternation preserved
