# Team Squad Implementation - Complete Feature Documentation

## Overview
This document outlines the comprehensive implementation of the enhanced Team Squad viewing screen with captain details, player statistics tooltips, and improved UX animations.

## ✨ Features Implemented

### 1. **Captain Details Integration**
- ✅ Fetches captain details from BCC Tournament Registration sheet based on captain ID from Teams sheet
- ✅ Displays captain in a prominent **2x2 grid card** with special styling
- ✅ Golden theme with animated glow effects
- ✅ Captain badge (C) positioned at bottom-right corner
- ✅ Role-based icon positioned at top-left corner
- ✅ Larger profile image and enhanced visibility

### 2. **Player Statistics Tooltips**
- ✅ Hover over any player card to view cricket statistics
- ✅ Stats fetched from columns 18-22 (R-V) of BCC Tournament Registration sheet:
  - Matches
  - Innings
  - Runs
  - Wickets
  - Average
- ✅ Smart filtering: Only displays stats that have values (excludes N/A entries)
- ✅ Animated tooltip with bounce effect
- ✅ Microinteractions on individual stat items

### 3. **Enhanced Visual Design**

#### Captain Card Features
- **Size**: 2x2 grid cells (double the size of regular player cards)
- **Golden Theme**: Special gold gradient background with animated glow
- **Shine Effect**: Diagonal shine animation for premium feel
- **Pulsing Badge**: Animated captain badge with pulse effect
- **Enhanced Shadow**: Multi-layer shadow with golden glow
- **Hover Effects**: Subtle lift and scale on hover

#### Regular Player Cards
- **Stats Tooltip**: Appears on hover with smooth bounce animation
- **Enhanced Images**: Brightness and contrast adjustments on hover
- **Team Color Integration**: Dynamic theming based on team colors
- **Staggered Entry**: Cards animate in with staggered delays for visual appeal

### 4. **Animations & Transitions**

#### Card Entry Animations
- **Captain Card**: Special 3D entry animation with rotation
- **Player Cards**: Fade-in from bottom with staggered delays
- **Stagger Pattern**: 0.05s delay between each card (up to 12 cards)

#### Hover Animations
- **Player Cards**: 
  - Lift effect (-8px translateY)
  - Image zoom and color enhancement
  - Border glow with team colors
- **Stats Tooltip**:
  - Bounce entrance
  - Left border accent on stat item hover
  - Smooth slide-in effect

#### Background Animations
- **Team Color Overlay**: Pulsing gradient background
- **Captain Shine**: Continuous diagonal shine effect
- **Badge Pulse**: Breathing animation on captain badge

### 5. **Loading States**
- ✅ Loading spinner shown while fetching team data
- ✅ "Loading Team Squad..." message
- ✅ Smooth transition from loading to content

### 6. **Responsive Design**
- **Desktop (>1600px)**: 6-column grid, full-size captain card (2x2)
- **Laptop (1200-1600px)**: 6-column grid, captain card (2x2)
- **Tablet (900-1200px)**: 4-column grid, captain card (2x2)
- **Mobile (600-900px)**: 3-column grid, captain card (2x2)
- **Small Mobile (<600px)**: 2-column grid, captain card (1x1), reduced text sizes

## 🎨 Design Highlights

### Color Scheme
- **Captain Card**: Gold (#FFD700) with orange gradient (#FFA500)
- **Regular Cards**: Dark theme with team color accents
- **Stats Tooltip**: Semi-transparent dark with team color borders

### Typography
- **Captain Name**: 26px, bold, golden color, increased letter-spacing
- **Player Names**: 16px, uppercase, team color on hover
- **Stats Labels**: 12px, uppercase, 70% opacity
- **Stats Values**: 14px, bold, white with glow

### Shadows & Effects
- Multi-layer shadows for depth
- Backdrop blur for glassmorphism effect
- Dynamic team color glows
- Smooth cubic-bezier transitions

## 🔧 Technical Implementation

### Configuration Updates (`config.js`)
```javascript
// Extended player stats columns
stats: {
  matches: 17,   // Column R
  innings: 18,   // Column S
  runs: 19,      // Column T
  wickets: 20,   // Column U
  average: 21    // Column V
}

// Extended data range to include stats columns
ranges: {
  players: 'BCC Tournament Registration!A2:V'
}
```

### New Functions
1. **`fetchCaptainDetails(captainId)`**
   - Fetches captain data from BCC Tournament Registration
   - Returns complete player object with stats

2. **`fetchPlayerStats(playerId)`**
   - Fetches individual player statistics
   - Returns stats object or null

### Modified Functions
1. **`showTeamSlots(teamIndex)`**
   - Added loading indicator
   - Integrated captain details fetching
   - Enhanced HTML generation with captain card
   - Added stats tooltips for all players

## 📱 User Experience Enhancements

### Interactive Elements
1. **Hover States**: Rich feedback on all interactive elements
2. **Loading States**: Clear indication of data loading
3. **Smooth Transitions**: All state changes are animated
4. **Visual Hierarchy**: Captain clearly distinguished from other players

### Accessibility
- Clear visual indicators for captain role
- Role icons for quick identification
- High contrast text for readability
- Smooth animations that respect user preferences

### Performance
- Asynchronous data fetching
- Image lazy loading with placeholders
- Efficient grid rendering
- Optimized animations using CSS transforms

## 🎯 Key CSS Classes

### Captain Card
- `.captain-card` - Main captain card styling
- `.captain-card::before` - Shine effect overlay
- `.captain-card .player-captain-badge` - Animated C badge
- `.captain-card .player-role-icon` - Enhanced role icon

### Stats Tooltip
- `.player-stats-tooltip` - Tooltip container
- `.stats-tooltip-title` - "Cricket Stats" header
- `.stats-tooltip-grid` - Stats items container
- `.stats-tooltip-item` - Individual stat row
- `.stats-tooltip-item::before` - Left accent border

### Animations
- `@keyframes captainGlow` - Pulsing glow effect
- `@keyframes captainCardEntry` - 3D entrance animation
- `@keyframes captainBadgePulse` - Badge breathing effect
- `@keyframes shine` - Diagonal shine sweep
- `@keyframes tooltipBounce` - Tooltip entrance
- `@keyframes backgroundPulse` - Background color pulse

## 🚀 Usage

### Viewing Team Squad
1. Press number keys 1-8 to view respective team squads
2. Or press 'T' to open team selection menu
3. Captain appears first in a larger golden card
4. Hover over any player to see their cricket statistics
5. Press 'Escape' to close the overlay

### Keyboard Shortcuts
- **1-8**: View Team 1-8 squad
- **T**: Toggle team selection menu
- **Escape**: Close team squad overlay

## 📊 Data Flow

```
Teams Sheet (Captain ID) 
    ↓
BCC Tournament Registration (Captain Details + Stats)
    ↓
Team Squad Overlay (Enhanced Captain Card)
    ↓
Player Cards (Hover → Stats Tooltip)
```

## 🎨 Visual Hierarchy

```
Team Logo & Header
    ↓
Team Stats Summary
    ↓
Captain Card (2x2, Golden)
    ↓
Regular Player Cards (1x1, Grid)
    ↓
TBD Slots (Dashed borders)
```

## 🔄 Animation Timeline

1. **Overlay Opens**: Fade in background (0.4s)
2. **Loading**: Spinner appears
3. **Header**: Fade down (0.6s, 0.2s delay)
4. **Captain Card**: 3D entry (0.8s, 0.1s delay)
5. **Player Cards**: Staggered fade-up (0.6s each, 0.05s stagger)
6. **Hover**: Stats tooltip bounce (0.5s)

## 📝 Notes

- Captain card uses `grid-column: span 2; grid-row: span 2` for prominence
- Grid uses `grid-auto-flow: dense` to fill gaps efficiently
- All stats showing "N/A" are automatically filtered out
- Team colors are dynamically applied from team logo
- Loading state prevents layout shift during data fetch

## 🎉 Result

A highly polished, interactive team squad view that:
- Clearly highlights the team captain
- Provides detailed player statistics on demand
- Delivers smooth, professional animations
- Adapts beautifully to all screen sizes
- Maintains consistent visual language with the rest of the app
