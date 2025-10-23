# Testing Guide - Team Squad Implementation

## 🧪 Test Scenarios

### 1. Captain Details Display

#### Test Case 1.1: Captain ID exists in BCC Registration
**Steps:**
1. Ensure Teams sheet has captain ID in column I
2. Press number key (1-8) to view team squad
3. Verify captain card appears first (larger, golden)

**Expected Results:**
- ✅ Captain card is 2x2 grid size
- ✅ Golden border with glow effect
- ✅ Captain badge (C) visible at bottom-right
- ✅ Role icon visible at top-left
- ✅ Captain name in golden color
- ✅ Shine animation playing

#### Test Case 1.2: Captain ID does not exist
**Steps:**
1. Set invalid captain ID in Teams sheet
2. Press number key to view team squad

**Expected Results:**
- ✅ No captain card displayed
- ✅ Regular player cards shown normally
- ✅ No error in console (graceful handling)

#### Test Case 1.3: Captain ID is empty
**Steps:**
1. Leave captain field empty in Teams sheet
2. Press number key to view team squad

**Expected Results:**
- ✅ No captain card displayed
- ✅ Grid starts with regular player cards

### 2. Player Statistics Tooltip

#### Test Case 2.1: Player with complete stats
**Steps:**
1. Open team squad overlay
2. Hover over a player card with stats in columns R-V
3. Wait for tooltip to appear

**Expected Results:**
- ✅ Tooltip appears with bounce animation
- ✅ All non-N/A stats are displayed
- ✅ Stats show: Matches, Innings, Runs, Wickets, Average
- ✅ Team color border on tooltip
- ✅ Smooth hover effect on stat items

#### Test Case 2.2: Player with partial stats (some N/A)
**Steps:**
1. Set some stats to "N/A" in BCC Registration
2. Hover over that player's card

**Expected Results:**
- ✅ Only stats with valid values are shown
- ✅ N/A stats are completely hidden
- ✅ Tooltip adjusts size automatically

#### Test Case 2.3: Player with all stats as N/A
**Steps:**
1. Set all stats (R-V) to "N/A" for a player
2. Hover over that player's card

**Expected Results:**
- ✅ No tooltip appears (or tooltip is empty)
- ✅ No console errors
- ✅ Card still has hover effects

#### Test Case 2.4: Captain stats display
**Steps:**
1. Hover over captain card
2. Check if stats tooltip appears

**Expected Results:**
- ✅ Tooltip appears for captain
- ✅ Stats filtered same way as regular players
- ✅ Tooltip has team color theming

### 3. Animations & Transitions

#### Test Case 3.1: Initial load animation
**Steps:**
1. Press number key to open team squad
2. Observe loading sequence

**Expected Results:**
- ✅ Loading spinner appears first
- ✅ Header fades down (0.2s delay)
- ✅ Captain card enters with 3D animation
- ✅ Player cards stagger in (0.05s between each)
- ✅ All animations smooth (60fps)

#### Test Case 3.2: Captain card effects
**Steps:**
1. Open team squad with captain
2. Observe captain card for 10 seconds

**Expected Results:**
- ✅ Glow effect pulses (3s cycle)
- ✅ Shine sweeps diagonally (4s cycle)
- ✅ Badge pulses (2s cycle)
- ✅ All animations continuous

#### Test Case 3.3: Hover interactions
**Steps:**
1. Hover over captain card
2. Hover over regular player card
3. Move between cards quickly

**Expected Results:**
- ✅ Cards lift smoothly on hover
- ✅ Images zoom properly
- ✅ Border glows activate
- ✅ No animation jitter or lag

### 4. Responsive Design

#### Test Case 4.1: Desktop view (>1600px)
**Steps:**
1. Set viewport to 1920x1080
2. Open team squad

**Expected Results:**
- ✅ 6-column grid layout
- ✅ Captain card spans 2x2
- ✅ All cards visible without scrolling
- ✅ Proper spacing and gaps

#### Test Case 4.2: Tablet view (900-1200px)
**Steps:**
1. Set viewport to 1024x768
2. Open team squad

**Expected Results:**
- ✅ 4-column grid on tablet
- ✅ Captain card still 2x2
- ✅ Text sizes readable
- ✅ Stats tooltip fits screen

#### Test Case 4.3: Mobile view (<600px)
**Steps:**
1. Set viewport to 375x667 (iPhone)
2. Open team squad

**Expected Results:**
- ✅ 2-column grid
- ✅ Captain card becomes 1x1 on small screens
- ✅ Reduced text sizes
- ✅ Stats tooltip scrolls if needed
- ✅ All touch targets >44px

### 5. Data Integrity

#### Test Case 5.1: Multiple captains in same team
**Steps:**
1. Set same captain ID for multiple players
2. Open team squad

**Expected Results:**
- ✅ Only one captain card displayed
- ✅ Other instances shown as regular cards
- ✅ No duplicates

#### Test Case 5.2: Captain is also a sold player
**Steps:**
1. Captain ID matches a sold player
2. Open team squad

**Expected Results:**
- ✅ Captain shown only once (in captain card)
- ✅ Not duplicated in regular grid
- ✅ Stats available on captain card

#### Test Case 5.3: Missing player images
**Steps:**
1. Remove image URLs from some players
2. Open team squad

**Expected Results:**
- ✅ Placeholder avatars with initials
- ✅ No broken image icons
- ✅ Consistent sizing

### 6. Performance

#### Test Case 6.1: Large team (11 players)
**Steps:**
1. Open team with full 11 players
2. Monitor performance

**Expected Results:**
- ✅ Loads within 2 seconds
- ✅ All animations smooth
- ✅ No frame drops
- ✅ Memory usage stable

#### Test Case 6.2: Rapid hover on multiple cards
**Steps:**
1. Quickly move mouse over 5+ cards
2. Observe tooltip behavior

**Expected Results:**
- ✅ Only one tooltip visible at a time
- ✅ No tooltip flickering
- ✅ Smooth transitions between cards

#### Test Case 6.3: Multiple team switches
**Steps:**
1. Open Team 1, close
2. Open Team 2, close
3. Repeat for all teams

**Expected Results:**
- ✅ No memory leaks
- ✅ Consistent performance
- ✅ Clean state between teams

### 7. Edge Cases

#### Test Case 7.1: Team with no sold players
**Steps:**
1. View team with 0 sold players
2. Check display

**Expected Results:**
- ✅ Only TBD slots shown
- ✅ Captain card not shown (unless separately purchased)
- ✅ Clean empty state

#### Test Case 7.2: Team with only captain
**Steps:**
1. Team has only captain, no other players
2. Open team squad

**Expected Results:**
- ✅ Captain card displayed
- ✅ Remaining slots as TBD
- ✅ Grid layout correct

#### Test Case 7.3: Very long player names
**Steps:**
1. Add player with 30+ character name
2. Open team squad

**Expected Results:**
- ✅ Name truncates or wraps properly
- ✅ No layout breaks
- ✅ Tooltip still accessible

#### Test Case 7.4: Special characters in stats
**Steps:**
1. Add stats with special chars (e.g., "25*", "N/A", "—")
2. Hover over player

**Expected Results:**
- ✅ Stats display correctly
- ✅ Invalid values filtered out
- ✅ No XSS vulnerabilities

### 8. Accessibility

#### Test Case 8.1: Keyboard navigation
**Steps:**
1. Open team squad using keyboard
2. Try to navigate with Tab key

**Expected Results:**
- ✅ Close button is focusable
- ✅ Visual focus indicators
- ✅ ESC key closes overlay

#### Test Case 8.2: Color contrast
**Steps:**
1. Check text contrast ratios
2. Test with color blindness simulators

**Expected Results:**
- ✅ Text readable with >4.5:1 contrast
- ✅ Captain distinguishable without color alone
- ✅ Icons provide additional context

#### Test Case 8.3: Screen reader compatibility
**Steps:**
1. Use screen reader (NVDA/JAWS)
2. Navigate team squad

**Expected Results:**
- ✅ Captain role announced
- ✅ Stats read in logical order
- ✅ No redundant announcements

### 9. Browser Compatibility

#### Test Case 9.1: Chrome/Edge
**Expected:** ✅ All features work

#### Test Case 9.2: Firefox
**Expected:** ✅ All features work

#### Test Case 9.3: Safari
**Expected:** ✅ All features work, backdrop-filter supported

#### Test Case 9.4: Mobile browsers
**Expected:** ✅ Touch events work, animations smooth

### 10. Error Handling

#### Test Case 10.1: Network error during fetch
**Steps:**
1. Disconnect network
2. Try to open team squad

**Expected Results:**
- ✅ Error caught gracefully
- ✅ User-friendly message
- ✅ App doesn't crash

#### Test Case 10.2: Invalid data format
**Steps:**
1. Corrupt data in Google Sheet
2. Open team squad

**Expected Results:**
- ✅ Fallback to safe defaults
- ✅ Console warning logged
- ✅ Partial data still displayed

## 📋 Checklist for Production

### Visual Quality
- [ ] All animations smooth (60fps)
- [ ] Colors match design specs
- [ ] Typography consistent
- [ ] Spacing uniform
- [ ] Shadows and effects polished

### Functionality
- [ ] Captain details load correctly
- [ ] Stats tooltips work on all cards
- [ ] All hover states functional
- [ ] Loading states show properly
- [ ] Close button works

### Responsiveness
- [ ] Desktop layout correct
- [ ] Tablet layout correct
- [ ] Mobile layout correct
- [ ] Touch targets adequate
- [ ] No horizontal scroll

### Performance
- [ ] Initial load <2s
- [ ] Animations 60fps
- [ ] No memory leaks
- [ ] Image optimization
- [ ] Lazy loading working

### Accessibility
- [ ] Keyboard navigation
- [ ] Color contrast >4.5:1
- [ ] Screen reader friendly
- [ ] Focus indicators visible
- [ ] Alt text on images

### Browser Support
- [ ] Chrome tested
- [ ] Firefox tested
- [ ] Safari tested
- [ ] Edge tested
- [ ] Mobile browsers tested

### Data Integrity
- [ ] Captain ID mapping correct
- [ ] Stats columns correct (R-V)
- [ ] N/A filtering works
- [ ] No data leaks
- [ ] Error handling robust

## 🐛 Known Issues & Limitations

### Current Limitations
1. Stats fetched on hover (not pre-loaded)
2. Captain must exist in BCC Registration sheet
3. Maximum 1 captain per team
4. Tooltip not accessible on touch devices (tap to show?)

### Potential Improvements
1. Pre-load all stats for faster tooltips
2. Add tap event for mobile tooltips
3. Cache captain details
4. Add loading skeleton for cards
5. Implement virtual scrolling for 20+ players

## 🎯 Success Criteria

The implementation is successful if:
- ✅ Captain is clearly distinguished from other players
- ✅ Stats tooltips appear instantly on hover
- ✅ All animations are smooth and professional
- ✅ Works perfectly on all screen sizes
- ✅ No performance issues with full teams
- ✅ Error handling is graceful
- ✅ User experience feels polished and intuitive
