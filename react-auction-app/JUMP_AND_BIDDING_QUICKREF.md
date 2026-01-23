# Quick Reference: Jump & Alternating Bidding

## 🎯 Jump to Player (F Key)

| Action | Result |
|--------|--------|
| Press **F** | Opens jump modal |
| Enter number | Player number to jump to (1-based) |
| Press **Enter** or click **Go** | Navigate to that player |
| Press **ESC** | Close modal without changing |

**Example**: Press F → Type "25" → Enter → Player 25 is now selected

**Requirements**:
- ✅ Must be in **sequential mode** (not random)
- ✅ Player must be available (not sold/unsold)
- ✅ Modal shows valid range automatically

## 🔄 Alternating Team Bidding

| Scenario | What Happens |
|----------|--------------|
| **Team A bids** | ✅ Team A selected, bid placed, `lastBidTeamId = A` |
| **Team A presses hotkey again** | ❌ Error: "Team A must wait..." |
| **Team B presses hotkey** | ✅ Team B selected, bid increases, `lastBidTeamId = B` |
| **Team B presses hotkey again** | ❌ Error: "Team B must wait..." |
| **Team A presses hotkey** | ✅ Allowed, `lastBidTeamId = A` |
| **Press Z (undo)** | ↩️ Returns to previous team/bid |
| **Press N (next player)** | 🔄 Rule resets for new player |

## ✨ Key Features

### Jump Modal
```
╔════════════════════════════════╗
║    Jump to Player              ║
├────────────────────────────────┤
│ Enter player number:           │
│                                │
│ [Input Field    ] [Go Button]  │
│ Hotkey: Press F                │
│                                │
│ (Shows error if any)           │
╚════════════════════════════════╝
```

### Alternating Rule
- **Per Player**: Rule is per-player auction (resets on new player)
- **No Penalty**: Wrong key just shows warning notification
- **Undoable**: Z key restores previous state including team
- **Smart**: Only prevents immediate consecutive bids

## 🎮 Hotkeys Reference

| Key | Action | Enforces Alternating? |
|-----|--------|----------------------|
| **F** | Jump to player number | N/A |
| **1-9** | Team 1-9 bids (+multiplier steps) | ✅ Yes |
| **Q** | Increase bid multiplier | N/A |
| **W** | Decrease bid multiplier | N/A |
| **Z** | Undo bid (decrement) | Restores state |
| **N** | Next player | Resets rule |
| **S** | Mark sold | N/A |
| **U** | Mark unsold | N/A |

## 📊 State Tracking

### lastBidTeamId
Internal state that prevents same team from bidding twice:

```
New Player → lastBidTeamId = null
Team A bids → lastBidTeamId = "team-a"
Team B bids → lastBidTeamId = "team-b"
Team A undo → lastBidTeamId = "team-a" (restored)
Next player → lastBidTeamId = null (reset)
```

## 🔧 Technical Notes

### Jump Validation
- Input is parsed as integer
- Must be between 1 and total available players
- Automatically reorders queue to that player
- Clears bid state for that player
- Works only in sequential mode

### Bid Validation
- Checks team budget (max bid)
- Checks alternation rule (lastBidTeamId)
- Checks minimum player base price
- Shows appropriate error if any fail

## 💡 Usage Tips

1. **For Manual Selection**: Use F key instead of scrolling
2. **For Testing**: Quickly jump to test players
3. **For Recovery**: Jump back if you made a mistake
4. **Multiplier**: Adjust Q/W before number key for bulk bids
5. **Undo**: Press Z if alternation prevents your bid

## 🚀 Performance

- **Jump**: <100ms (instant)
- **Modal Open**: Animated in 300ms
- **Bid Check**: <1ms (O(1) lookup)
- **No Network**: All local operations

## 📱 Mobile Support

- Input field shows numeric keyboard
- Focus auto-managed for better UX
- Touch-friendly modal size
- Error messages are readable

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Jump only works in sequential" | Switch from random mode to sequential (T key) |
| Modal won't open | Check if F key is already bound elsewhere |
| Team bid rejected | Check if another team just bid (press N to see rule) |
| Jump not working | Make sure player number is between 1 and available count |
| Input focus lost | Modal re-focuses automatically when opened |

## 🎬 Example Auction Flow

```
1. Start with Player 1 (John)
   Press F → 15 → Player 15 selected

2. Team A presses 1 → Team A selected, bid = 100
   (lastBidTeamId = team-a)

3. Team B presses 2 → Team B selected, bid = 200
   (lastBidTeamId = team-b)

4. Team A presses 1 → Error! "Team A must wait..."
   Player image shows: ⚠️ Notification

5. Team C presses 3 → Team C selected, bid = 300
   (lastBidTeamId = team-c)

6. Team A presses 1 → Team A selected, bid = 400
   (lastBidTeamId = team-a)

7. Team B presses 2 → Team B selected, bid = 500
   (lastBidTeamId = team-b)

8. Press S → Mark as SOLD to Team B for ₹500L
   Next player loads, rule resets
```

## 📚 See Also

- Full documentation: [JUMP_AND_ALTERNATING_BIDDING.md](./JUMP_AND_ALTERNATING_BIDDING.md)
- Hotkey config: [src/config/index.ts](./src/config/index.ts)
- Store logic: [src/store/auctionStore.ts](./src/store/auctionStore.ts)
