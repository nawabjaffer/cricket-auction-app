# Team Squad Screen - Visual Design Guide

## 🎨 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│                     TEAM SLOTS OVERLAY                       │
│  (Blurred background with team color gradient)              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Team Logo (Animated)                   │    │
│  │                 TEAM NAME                           │    │
│  │  [Players: 3/11] [Purse: ₹45,000] [Highest: ₹5000]│    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   PLAYER GRID                         │  │
│  │                                                        │  │
│  │  ┌─────────────────────┐  ┌──────┐  ┌──────┐        │  │
│  │  │                     │  │      │  │      │        │  │
│  │  │   CAPTAIN CARD      │  │ P2   │  │ P3   │        │  │
│  │  │   (2x2 Grid)        │  │      │  │      │        │  │
│  │  │   ┌───────────┐     │  └──────┘  └──────┘        │  │
│  │  │   │   Image   │     │                             │  │
│  │  │   │           │  [C]│  ┌──────┐  ┌──────┐        │  │
│  │  │   │           │     │  │ P4   │  │ P5   │        │  │
│  │  │   └───────────┘     │  │      │  │      │        │  │
│  │  │   [🏏] CAPTAIN NAME │  └──────┘  └──────┘        │  │
│  │  │   All-Rounder       │                             │  │
│  │  │                     │  [TBD]  [TBD]  [TBD]       │  │
│  │  └─────────────────────┘                             │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [ESC to close]                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Captain Card Design

```
┌─────────────────────────────────┐
│ 🏏                            ┌─┐│ ← Role Icon (Top-Left)
│                               │C││ ← Captain Badge (Bottom-Right)
│    ┌─────────────────┐        └─┘│   (Pulsing Animation)
│    │                 │            │
│    │  Captain Image  │            │
│    │   (Larger)      │            │
│    │                 │            │
│    └─────────────────┘            │
│                                   │
│      ⭐ CAPTAIN NAME ⭐           │ ← Golden Text
│         All-Rounder              │
│                                   │
│  [Golden Border with Glow]       │
│  [Shine Effect Animation]        │
└─────────────────────────────────┘
```

### Captain Card Specifications
- **Size**: 2x grid cells wide × 2 cells tall
- **Border**: 2px solid gold with glow
- **Background**: Golden gradient overlay
- **Badge**: 60px circular with pulse animation
- **Text Color**: #FFD700 (Gold)
- **Shadow**: Multi-layer with golden glow
- **Animation**: Continuous glow + shine sweep

## 📊 Stats Tooltip Design

```
When hovering over any player card:

┌──────────┐
│  PLAYER  │ ← Player Card
│  [Hover] │
└────┬─────┘
     │
     └──→ ┌──────────────────────────┐
          │    CRICKET STATS         │ ← Tooltip
          ├──────────────────────────┤
          │ │ Matches      42       │ ← Stat Item
          │ │ Innings      38       │   (Hover: Left accent)
          │ │ Runs         1,234    │
          │ │ Wickets      45       │
          │ │ Average      28.5     │
          └──────────────────────────┘
             ↑ Team Color Border
```

### Tooltip Specifications
- **Background**: Dark with blur effect
- **Border**: 2px team color
- **Width**: 280-320px
- **Padding**: 20px
- **Animation**: Bounce entrance (0.5s)
- **Stats**: Auto-filtered (no N/A values)

## 🎬 Animation Sequence

### 1. Opening Animation
```
Timeline:
0.0s  ━━━━━━━━━━━━━━━━━━━━━━
      │ Overlay fade in
      │
0.1s  ▼ Loading spinner
      │
0.2s  ▼ Header fade down
      │
0.3s  ▼ Captain card 3D entry
      │
0.35s ▼ Player 1 fade up
      │
0.40s ▼ Player 2 fade up
      │
0.45s ▼ Player 3 fade up
      │
      ... (staggered)
```

### 2. Hover Animation
```
Mouse Enter:
0.0s  ━━━━━━━━━━━━━━━━━━━━━━
      │ Card lift (-8px)
      │ Image zoom (1.08x)
      │ Border glow
      │
0.2s  ▼ Stats tooltip bounce in
      │
0.5s  ▼ Animation complete
```

### 3. Captain Card Effects
```
Continuous:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ Glow pulse (3s cycle)
│ Shine sweep (4s cycle)
│ Badge pulse (2s cycle)
└─→ Infinite loop
```

## 🎨 Color Palette

### Captain Card
- **Primary**: #FFD700 (Gold)
- **Secondary**: #FFA500 (Orange)
- **Glow**: rgba(255, 215, 0, 0.6)
- **Background**: Gold gradient 15% → Dark 50%

### Regular Player Cards
- **Background**: Dark gradient (20,20,30 → 10,10,20)
- **Border**: rgba(255, 255, 255, 0.08)
- **Hover**: Team color accent
- **Text**: White with team color on hover

### Stats Tooltip
- **Background**: rgba(10, 10, 20, 0.98)
- **Border**: Team color (2px)
- **Title**: Team color with glow
- **Stats**: White text on dark

## 📐 Grid Layout

### Desktop (>1600px)
```
[Captain][P2][P3][P4][P5][P6]
[       ][P7][P8][P9][P10][P11]
```
6 columns, Captain spans 2x2

### Laptop (1200-1600px)
```
[Captain][P2][P3][P4][P5][P6]
[       ][P7][P8][P9][P10][P11]
```
6 columns, Captain spans 2x2

### Tablet (900-1200px)
```
[Captain][P2][P3][P4]
[       ][P5][P6][P7]
[P8][P9][P10][P11]
```
4 columns, Captain spans 2x2

### Mobile (600-900px)
```
[Captain][P2][P3]
[       ][P4][P5]
[P6][P7][P8]
```
3 columns, Captain spans 2x2

### Small Mobile (<600px)
```
[Captain][P2]
[P3][P4]
[P5][P6]
```
2 columns, Captain spans 1x1

## 🎭 States & Variations

### Loading State
```
┌─────────────────────┐
│   ⟳ Spinner         │
│                     │
│ Loading Team        │
│ Squad...            │
└─────────────────────┘
```

### Empty Slot (TBD)
```
┌─────────────┐
│   ○ - - -   │ ← Dashed border
│             │
│   Slot 5    │
│ To Be Decided│
└─────────────┘
```

### Player With Stats
```
┌─────────────┐
│   [Image]   │
│             │ ← Hover for stats
│  John Doe   │
│  Batsman    │
│  ₹5,000     │
│         🏏  │
└─────────────┘
```

### Captain (No Stats)
```
┌───────────────────┐
│ 🏏            [C] │
│                   │
│    [Image]        │
│                   │
│  ⭐ CAPTAIN ⭐    │
│   All-Rounder     │
└───────────────────┘
```

## 💡 Interactive Elements

### Hover Targets
1. **Player Cards** → Stats tooltip
2. **Stats Items** → Left accent + slide
3. **Captain Card** → Enhanced glow
4. **Team Logo** → Scale + rotation

### Click Targets
1. **Close Button** → Hide overlay
2. **ESC Key** → Hide overlay
3. **Outside Click** → (Optional) Hide overlay

## 🔍 Details & Polish

### Shadows
- **Captain**: `0 20px 60px rgba(255, 215, 0, 0.3)`
- **Players**: `0 10px 40px rgba(0, 0, 0, 0.6)`
- **Tooltip**: `0 15px 50px rgba(0, 0, 0, 0.9)`

### Border Radius
- **Captain**: 25px
- **Players**: 20px
- **Tooltip**: 15px
- **Stats Items**: 8px

### Transitions
- **Default**: `all 0.5s cubic-bezier(0.4, 0, 0.2, 1)`
- **Quick**: `all 0.3s ease`
- **Bounce**: `cubic-bezier(0.68, -0.55, 0.265, 1.55)`

### Z-Index Hierarchy
```
25001: Close Button
25000: Team Slots Overlay
  100: Stats Tooltip (relative to card)
   10: Card Content
    2: Captain Card Content
    1: Card Overlays/Effects
    0: Card Background
```

## ✨ Special Effects

### Glassmorphism
```css
backdrop-filter: blur(20px) saturate(180%);
background: rgba(10, 10, 20, 0.98);
border: 1px solid rgba(255, 255, 255, 0.1);
```

### Glow Effect
```css
box-shadow: 
  0 20px 60px rgba(255, 215, 0, 0.3),
  0 0 40px rgba(255, 215, 0, 0.2),
  0 0 0 1px rgba(255, 255, 255, 0.1) inset;
```

### Shine Sweep
```css
background: linear-gradient(45deg, 
  transparent 30%, 
  rgba(255, 255, 255, 0.1) 50%, 
  transparent 70%);
animation: shine 4s ease-in-out infinite;
```

## 🎯 UX Goals Achieved

✅ **Clear Hierarchy**: Captain immediately visible
✅ **Rich Information**: Stats on demand without clutter
✅ **Smooth Interactions**: All transitions feel natural
✅ **Visual Feedback**: Every interaction has response
✅ **Responsive Design**: Works on all screen sizes
✅ **Performance**: Smooth 60fps animations
✅ **Accessibility**: High contrast, clear indicators
✅ **Professional Feel**: Polished, modern design
