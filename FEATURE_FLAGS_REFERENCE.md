# Feature Flags Reference Guide

## 🎯 Overview

Feature flags allow you to enable or disable specific features in the auction application in real-time without code changes or redeployment.

**12 Feature Flags Available:**
- 2 Bidding features
- 5 UI & Display features
- 2 Notification features
- 2 Analytics features
- 1 Other feature

---

## 📋 Complete Feature List

### 🎯 BIDDING FEATURES

#### 1. **gesture-bidding**
- **Name:** Gesture-Based Bidding
- **Description:** Enable device motion sensor for gesture-based bidding (shake to bid)
- **Category:** bidding
- **Default:** ✅ ENABLED
- **Impact:** High - Changes how users bid
- **Use Case:** Mobile users can bid by shaking device (Z-axis acceleration)
- **Requirements:** iOS 13+ or Android with DeviceMotion API

**When to Disable:**
- Testing traditional UI only
- Mobile devices without accelerometer
- Want to prevent accidental bids

**When to Enable:**
- Default setting for most events
- Want engaging mobile experience
- Have tested gesture detection

---

#### 2. **auto-bid**
- **Name:** Auto Bid
- **Description:** Enable automatic bidding increment suggestions
- **Category:** bidding
- **Default:** ❌ DISABLED
- **Impact:** Medium - Adds new UI elements
- **Use Case:** Suggest next valid bid amounts automatically
- **Requirements:** None (UI-only feature)

**When to Enable:**
- Want to speed up bidding process
- Help admins suggest next amounts
- Reduce manual calculation

**When to Disable:**
- Keep bidding traditional
- Don't want suggestions
- Minimize UI complexity

---

### 🎨 UI & DISPLAY FEATURES

#### 3. **keyboard-shortcuts**
- **Name:** Keyboard Shortcuts
- **Description:** Enable keyboard shortcuts for quick actions
- **Category:** ui
- **Default:** ✅ ENABLED
- **Impact:** Medium - Adds helper UI
- **Use Case:** Power users can use F1-F12, Ctrl+Key shortcuts
- **Requirements:** None

**When to Disable:**
- Using touch-only devices
- Want simplified interface
- Testing basic mode

**When to Enable:**
- Desktop users (default)
- Want faster operations
- Need quick access to features

---

#### 4. **player-image-preload**
- **Name:** Image Preloading
- **Description:** Preload player images for faster display
- **Category:** ui
- **Default:** ✅ ENABLED
- **Impact:** Low - Background operation
- **Use Case:** Images load before player selected
- **Requirements:** Image URLs in player data

**When to Disable:**
- Low bandwidth networks
- Testing without images
- Slow internet connections

**When to Enable:**
- Good internet connection
- Want smooth image loading
- Professional event (default)

---

#### 5. **bid-history**
- **Name:** Bid History
- **Description:** Show bid history for each player
- **Category:** ui
- **Default:** ✅ ENABLED
- **Impact:** Medium - Adds history UI
- **Use Case:** See all previous bids on a player
- **Requirements:** Bid history data stored

**When to Disable:**
- Keep interface simple
- Testing minimal mode
- Reduce UI clutter

**When to Enable:**
- Want transparency
- Professional events
- Need bid tracking (default)

---

#### 6. **team-stats**
- **Name:** Team Stats Display
- **Description:** Show detailed team statistics
- **Category:** ui
- **Default:** ✅ ENABLED
- **Impact:** Medium - Shows stats panel
- **Use Case:** Display team budgets, player counts, etc.
- **Requirements:** Team data available

**When to Disable:**
- Testing simple interface
- Focus on current player only
- Reduce distractions

**When to Enable:**
- Professional event
- Want team tracking
- Show management info (default)

---

#### 7. **dark-mode**
- **Name:** Dark Mode
- **Description:** Enable dark mode theme option
- **Category:** ui
- **Default:** ❌ DISABLED
- **Impact:** Low - UI theme only
- **Use Case:** Toggle dark theme in settings
- **Requirements:** Dark theme CSS implemented

**When to Enable:**
- Evening events (better for eyes)
- Professional branding
- User preference feature

**When to Disable:**
- Light-only events
- Don't want theme switching
- Simplify interface (default)

---

### 🔔 NOTIFICATION FEATURES

#### 8. **sound-notifications**
- **Name:** Sound Notifications
- **Description:** Enable audio alerts for bid events
- **Category:** notifications
- **Default:** ✅ ENABLED
- **Impact:** High - Audible alerts
- **Use Case:** Beep/chime when bids happen
- **Requirements:** Audio service initialized

**When to Disable:**
- Mute events (streaming/video)
- Quiet environments
- Testing without sound

**When to Enable:**
- Live events (default)
- Need audible alerts
- Get attention on bids

---

#### 9. **toast-notifications**
- **Name:** Toast Notifications
- **Description:** Show toast messages for bidding events
- **Category:** notifications
- **Default:** ✅ ENABLED
- **Impact:** Medium - Shows toast messages
- **Use Case:** Brief notifications appear/disappear
- **Requirements:** Toast component available

**When to Disable:**
- Keep interface minimal
- Testing without messages
- Accessibility requirements

**When to Enable:**
- Want user feedback
- Need status messages (default)
- Professional event

---

### 📊 ANALYTICS & LOGGING FEATURES

#### 10. **analytics**
- **Name:** Analytics
- **Description:** Enable analytics tracking
- **Category:** analytics
- **Default:** ❌ DISABLED
- **Impact:** Low - Background tracking
- **Use Case:** Track user actions for analytics
- **Requirements:** Analytics service setup

**When to Enable:**
- Collect usage data
- Analyze user behavior
- Improve UX based on data

**When to Disable:**
- Privacy-focused events
- Don't need analytics
- Testing mode (default)

---

#### 11. **audit-log**
- **Name:** Audit Logging
- **Description:** Log all admin actions for audit trail
- **Category:** analytics
- **Default:** ❌ DISABLED
- **Impact:** Low - Background logging
- **Use Case:** Track who did what and when
- **Requirements:** Audit log storage

**When to Enable:**
- Compliance requirements
- Need action history
- High-security events

**When to Disable:**
- No audit requirements
- Testing mode (default)
- Private events

---

### ⚙️ OTHER FEATURES

#### 12. **data-export**
- **Name:** Data Export
- **Description:** Allow exporting auction data to CSV
- **Category:** other
- **Default:** ✅ ENABLED
- **Impact:** Medium - Adds export button
- **Use Case:** Download sold players to Excel
- **Requirements:** Export utility available

**When to Disable:**
- Don't allow data export
- Keep data internal
- Testing without export

**When to Enable:**
- Allow admin data access (default)
- Need external analysis
- Professional event

---

## 🎮 Managing Flags

### Access Admin Panel

**Option 1: Direct URL**
```
https://e-auction-store.web.app/admin/login
```

**Option 2: From Auction App**
```
Ctrl+Shift+A (Windows/Linux)
Cmd+Shift+A (Mac)
```

### Toggle a Flag

1. **Login** with your admin email
2. **Click "Features"** tab
3. **Expand category** (click category header)
4. **Toggle switch** on/off
5. ✅ **Change applies immediately**

No page reload needed!

---

## 🚀 Real-World Scenarios

### Scenario 1: Mobile-Only Event
```
gesture-bidding      ✅ ON   (let users shake to bid)
auto-bid             ❌ OFF
keyboard-shortcuts   ❌ OFF  (touch devices)
player-image-preload ✅ ON
sound-notifications  ✅ ON
dark-mode            ❌ OFF
```

### Scenario 2: Professional/High-Security Event
```
gesture-bidding      ❌ OFF  (precise control only)
auto-bid             ✅ ON   (prevent mistakes)
keyboard-shortcuts   ✅ ON   (fast operations)
bid-history          ✅ ON   (transparency)
team-stats           ✅ ON   (tracking)
audit-log            ✅ ON   (full logging)
sound-notifications  ✅ ON
data-export          ✅ ON   (reports)
```

### Scenario 3: Testing/Development
```
All analytics        ❌ OFF
All notifications    ✅ ON   (see changes)
All UI features      ✅ ON   (test everything)
sound-notifications  ❌ OFF  (silent mode)
```

### Scenario 4: Quiet/Streaming Event
```
sound-notifications  ❌ OFF  (no audio)
toast-notifications  ✅ ON   (visual only)
gesture-bidding      ✅ ON   (alternative input)
player-image-preload ✅ ON   (smooth display)
```

---

## 📊 Impact Matrix

| Feature | Users Affected | Reload Needed | Real-Time |
|---------|---|---|---|
| gesture-bidding | All bidders | No | Yes |
| auto-bid | Admins | No | Yes |
| keyboard-shortcuts | Desktop users | No | Yes |
| player-image-preload | All | On next load | Yes |
| bid-history | All | No | Yes |
| team-stats | All | No | Yes |
| dark-mode | All | No | Yes |
| sound-notifications | All | No | Yes |
| toast-notifications | All | No | Yes |
| analytics | Background | No | Yes |
| audit-log | Admins | No | Yes |
| data-export | Admins | No | Yes |

---

## ⚡ Quick Enable/Disable Decisions

### Enable for Better User Experience
- ✅ gesture-bidding (mobile friendly)
- ✅ player-image-preload (faster loading)
- ✅ sound-notifications (feedback)
- ✅ toast-notifications (status messages)

### Disable for Simpler Interface
- ❌ auto-bid (reduce suggestions)
- ❌ dark-mode (single theme)
- ❌ audit-log (don't need logs)

### Enable for Security/Compliance
- ✅ audit-log (track actions)
- ✅ bid-history (transparency)
- ✅ team-stats (oversight)

### Disable for Privacy
- ❌ analytics (no tracking)
- ❌ audit-log (minimal logs)

---

## 💡 Best Practices

### 1. **Test Before Disabling**
- Disable in test event first
- Ensure functionality still works
- Document any issues

### 2. **Communicate Changes**
- Let admins know about changes
- Update user interface hints
- Document feature changes

### 3. **Monitor Impact**
- Check for user complaints
- Review error logs
- Adjust as needed

### 4. **Keep Defaults Sensible**
- Most features enabled by default
- Disable only when necessary
- Re-enable if users complain

### 5. **Document Custom Configurations**
- Keep notes on why flags are toggled
- Document event-specific settings
- Share with team

---

## 🔍 How to Check Flag Status

### In Admin Panel
1. Login to `/admin`
2. Click "Features" tab
3. See statistics at top:
   - Total flags
   - Enabled count
   - Disabled count
4. Expand categories to see details

### In Browser Console
```javascript
// Import and check
import { featureFlagsService } from './services/featureFlagsService';

// Get all flags
const flags = featureFlagsService.getAllFlags();
console.log(flags);

// Check specific flag
const isGestureOn = featureFlagsService.isEnabled('gesture-bidding');
console.log('Gesture bidding:', isGestureOn);

// Get stats
console.log(featureFlagsService.getStats());
// Output: { total: 12, enabled: 9, disabled: 3 }
```

### In Code
```typescript
const { flags, isEnabled } = useFeatureFlags();

// Check all
Object.entries(flags).forEach(([key, flag]) => {
  console.log(`${flag.name}: ${flag.enabled}`);
});

// Check one
if (isEnabled('gesture-bidding')) {
  console.log('Gesture bidding is available');
}
```

---

## 📱 Mobile Considerations

### Features to Check on Mobile

| Feature | Mobile Friendly | Notes |
|---------|---|---|
| gesture-bidding | ✅ Yes | Requires accelerometer |
| keyboard-shortcuts | ❌ No | Desktop only, disable |
| player-image-preload | ✅ Yes | Check on slow networks |
| sound-notifications | ✅ Yes | May vibrate device |
| touch-friendly | ✅ Yes | Enable tap targets |

### Mobile-Optimized Config
```
Keep Enabled:
- gesture-bidding
- player-image-preload
- sound-notifications
- team-stats

Consider Disabling:
- keyboard-shortcuts
- dark-mode (if not responsive)
```

---

## 🐛 Debugging Flags

### Flag Not Toggling

Check:
1. Are you logged in as admin?
2. Is Firebase connected? (Check console)
3. Is the feature in the correct category?
4. Try refreshing the page

### Changes Not Applying

Check:
1. Is the flag actually enabled/disabled in admin?
2. Is component using `useFeatureFlags()` hook?
3. Are there cached versions? (Clear cache)
4. Check browser console for errors

### Flag Not Visible in Code

Check:
1. Is flag name spelled correctly?
2. Is featureFlagsService initialized?
3. Use `isEnabled()` not direct access
4. Check useFeatureFlags() hook is imported

---

## 📚 Further Reading

- `ADMIN_SYSTEM_DOCUMENTATION.md` - Technical details
- `ADMIN_PANEL_GUIDE.md` - User guide
- `ADMIN_QUICK_REFERENCE.md` - Quick reference

---

**Last Updated:** February 2, 2026 | **Status:** Production Ready ✅

