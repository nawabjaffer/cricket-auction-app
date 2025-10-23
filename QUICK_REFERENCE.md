# Quick Reference Card - Team Squad Features

## 🚀 Quick Start

### Open Team Squad
```javascript
// Press keyboard shortcuts
1-8      // View Team 1-8 squad
T        // Open team menu
ESC      // Close overlay
```

### Function Calls
```javascript
showTeamSlots(teamIndex)     // Show team squad overlay
fetchCaptainDetails(id)      // Get captain from BCC sheet
fetchPlayerStats(id)         // Get player stats from BCC sheet
hideTeamSlots()             // Close overlay
```

## 📊 Data Structure

### Captain Object
```javascript
{
  id: "P001",
  imageUrl: "https://...",
  name: "John Doe",
  role: "All-Rounder",
  dateOfBirth: "01/01/1990",
  stats: {
    matches: "42",
    innings: "38",
    runs: "1234",
    wickets: "45",
    average: "28.5"
  }
}
```

### Player Stats Object
```javascript
{
  matches: "42",    // Column R (17)
  innings: "38",    // Column S (18)
  runs: "1234",     // Column T (19)
  wickets: "45",    // Column U (20)
  average: "28.5"   // Column V (21)
}
```

## 🎨 CSS Classes Reference

### Captain Card
```css
.captain-card                    /* Main captain card */
.captain-card::before           /* Shine effect */
.captain-card .player-captain-badge    /* C badge */
.captain-card .player-role-icon        /* Role icon */
.captain-card .player-card-name        /* Captain name */
.captain-card .player-card-role        /* Captain role */
```

### Stats Tooltip
```css
.player-stats-tooltip           /* Tooltip container */
.stats-tooltip-title           /* "Cricket Stats" header */
.stats-tooltip-grid            /* Stats grid container */
.stats-tooltip-item            /* Individual stat row */
.stats-tooltip-label           /* Stat name */
.stats-tooltip-value           /* Stat value */
.stats-tooltip-item::before    /* Left accent line */
```

### Animations
```css
@keyframes captainGlow          /* Pulsing glow */
@keyframes captainCardEntry     /* 3D entrance */
@keyframes captainBadgePulse    /* Badge pulse */
@keyframes shine                /* Diagonal shine */
@keyframes tooltipBounce        /* Tooltip entrance */
@keyframes cardFadeIn           /* Player card entrance */
```

## 🎯 Key Features

### Captain Card Features
- ✨ **Size**: 2x2 grid cells
- ✨ **Color**: Golden (#FFD700)
- ✨ **Badge**: Animated C at bottom-right
- ✨ **Icon**: Role icon at top-left
- ✨ **Effects**: Glow + shine + pulse

### Stats Tooltip Features
- 📊 Shows on hover
- 📊 Auto-filters N/A values
- 📊 Team color border
- 📊 Bounce animation
- 📊 Microinteractions on items

### Grid Layout
```
Desktop  : 6 columns
Laptop   : 6 columns
Tablet   : 4 columns
Mobile   : 3 columns
Small    : 2 columns

Captain  : Always 2x2 (except <600px = 1x1)
```

## 🔧 Configuration

### Column Mappings (config.js)
```javascript
CONFIG.columnMappings.players = {
  id: 1,              // Column B
  imageUrl: 2,        // Column C
  name: 3,            // Column D
  role: 9,            // Column J
  stats: {
    matches: 17,      // Column R
    innings: 18,      // Column S
    runs: 19,         // Column T
    wickets: 20,      // Column U
    average: 21       // Column V
  }
}

CONFIG.columnMappings.teams = {
  ...
  captain: 8          // Column I
}
```

### Sheet Range
```javascript
CONFIG.googleSheets.ranges = {
  players: 'BCC Tournament Registration!A2:V',
  teams: 'Teams!A2:I'
}
```

## 🎨 Color Variables

### CSS Custom Properties
```css
--team-color              /* Dynamic team color */
--team-color-light        /* Lighter variant */
--team-color-border       /* Border color */
--team-color-glow         /* Glow effect color */
```

### Captain Colors
```css
Gold:     #FFD700
Orange:   #FFA500
Glow:     rgba(255, 215, 0, 0.6)
```

## 📏 Sizing

### Captain Card
```
Desktop:  ~460px × 620px (2x2 grid)
Mobile:   ~160px × 213px (1x1 grid)
Badge:    60px × 60px
Icon:     50px × 50px
```

### Stats Tooltip
```
Width:    280-320px
Padding:  20px
Border:   2px
Radius:   15px
```

### Grid Gaps
```
Desktop:  24px
Laptop:   20px
Tablet:   18px
Mobile:   14px
Small:    12px
```

## ⚡ Performance Tips

### Optimization
1. **Async Loading**: Use async/await for data fetching
2. **Image Preload**: Preload captain image
3. **Lazy Tooltips**: Fetch stats on hover
4. **CSS Transforms**: Use for animations
5. **Will-change**: Apply to animated elements

### Best Practices
```css
/* Use transforms for animations */
transform: translateY(-8px);

/* Not margin/top (causes reflow) */
margin-top: -8px; /* ❌ Avoid */

/* Use will-change for smooth animations */
.captain-card {
  will-change: transform, opacity;
}
```

## 🐛 Debugging

### Console Logs
```javascript
// Check if captain details loaded
console.log('Captain:', captainDetails);

// Check if stats loaded
console.log('Stats:', playerStats);

// Check grid layout
console.log('Grid class:', gridClass);
```

### Common Issues
```javascript
// Captain not showing?
// 1. Check captain ID in Teams sheet (Column I)
// 2. Verify ID exists in BCC Registration
// 3. Check console for errors

// Stats not showing?
// 1. Verify columns R-V have data
// 2. Check if values are "N/A"
// 3. Hover long enough for tooltip

// Animations laggy?
// 1. Check GPU acceleration
// 2. Reduce number of simultaneous animations
// 3. Use CSS transforms only
```

## 🎬 Animation Timeline

### Opening Sequence
```
0.0s  Overlay fade in
0.1s  Loading spinner
0.2s  Header fade down
0.3s  Captain 3D entry
0.35s Player 1 fade up
0.40s Player 2 fade up
...   (0.05s stagger)
```

### Hover Sequence
```
0.0s  Card lift + image zoom + border glow
0.2s  Tooltip bounce in
0.5s  Complete
```

### Continuous Effects
```
Glow:   3s cycle (infinite)
Shine:  4s cycle (infinite)
Badge:  2s cycle (infinite)
BG:     8s cycle (infinite)
```

## 📱 Responsive Breakpoints

```javascript
CONFIG.ui.breakpoints = {
  desktop:  1600,    // Large screens
  laptop:   1200,    // Laptops
  tablet:   900,     // Tablets
  mobile:   768,     // Mobile devices
  small:    600      // Small phones
}
```

## 🎯 Event Handlers

### Keyboard Events
```javascript
// In keydown listener
'1'-'8'   → showTeamSlots(index)
't'       → toggleTeamSelectionMenu()
'Escape'  → hideTeamSlots()
```

### Mouse Events
```javascript
// On player card
mouseenter  → Show stats tooltip
mouseleave  → Hide stats tooltip

// On close button
click       → hideTeamSlots()
```

## 🔗 Dependencies

### External APIs
```
Google Sheets API v4
- Sheet ID: 1-ZcLNOcy-iAKsLVQelBXOaXX6DhgPevy4kx1nvT9WCs
- API Key: Required for data fetching
```

### Browser APIs
```javascript
fetch()              // Data fetching
CSS Grid             // Layout
CSS Animations       // Visual effects
backdrop-filter      // Blur effects
```

## 📦 File Structure

```
auctionApp/
├── index.html              (Main implementation)
├── config.js              (Configuration)
├── assets/
│   └── man.jpg           (Placeholder image)
└── docs/
    ├── TEAM_SQUAD_IMPLEMENTATION.md
    ├── VISUAL_DESIGN_GUIDE.md
    └── TESTING_GUIDE.md
```

## 🚦 Status Indicators

### Loading State
```html
<div class="team-slots-loading">
  <div class="team-slots-loading-spinner"></div>
  <div class="team-slots-loading-text">Loading...</div>
</div>
```

### Empty State (TBD)
```html
<div class="player-card tbd">
  <div class="player-avatar-tbd">...</div>
  <h3>Slot 5</h3>
  <p>To Be Decided</p>
</div>
```

## 💡 Pro Tips

1. **Captain Priority**: Captain always renders first
2. **Stats Filtering**: N/A values auto-removed
3. **Grid Flow**: Use `grid-auto-flow: dense` for efficiency
4. **Color Sync**: Team colors extracted from logo
5. **Async Loads**: Show loading state during data fetch
6. **Hover Delay**: Small delay prevents tooltip flicker
7. **Z-Index**: Tooltip at 100, badges at 3, content at 2
8. **Stagger**: 0.05s between cards for smooth cascade
9. **Mobile First**: Test on smallest screen first
10. **Performance**: Use Chrome DevTools Performance tab

## 🎓 Learning Resources

### CSS Grid
- Grid Template Areas
- Grid Auto Flow
- Grid Span

### CSS Animations
- Keyframes
- Cubic Bezier
- Transform vs Transition

### JavaScript Async
- Async/Await
- Promise.all()
- Try/Catch

### Performance
- RequestAnimationFrame
- Will-change
- GPU Acceleration
