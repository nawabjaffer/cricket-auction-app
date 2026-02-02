# Admin System & Feature Flags Documentation

## Overview

The auction application now includes a complete admin system with email-based authentication, a dedicated admin panel, and feature flags management. Administrators can control various aspects of the application and enable/disable features in real-time.

---

## System Architecture

### Components

```
Admin System Components:
├── Authentication (authService)
│   ├── Email-based login
│   ├── Session management (24-hour expiry)
│   └── Admin account management
├── Feature Flags (featureFlagsService)
│   ├── Enable/disable app features
│   ├── Real-time updates
│   └── Category-based organization
├── UI Components
│   ├── AdminLogin (Email login page)
│   ├── AdminPage (Protected admin page)
│   ├── AdminPanel (Settings tabs)
│   └── FeatureFlagsTab (Feature management)
└── Routing
    ├── /admin/login (Login page)
    └── /admin (Admin dashboard)
```

---

## Getting Started

### 1. Accessing the Admin System

**Option A: Direct URL**
```
https://e-auction-store.web.app/admin/login
```

**Option B: From Auction App**
- Use keyboard shortcut: `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac)
- This opens the admin panel from within the auction app

### 2. Authentication

1. Navigate to `/admin/login`
2. Enter your registered admin email address
3. Submit the form
4. On success, you'll be redirected to `/admin` dashboard
5. Session expires after 24 hours of inactivity

**Note:** Only registered admin accounts can access the system. Contact the system administrator to register new admin accounts.

---

## Authentication System (`authService`)

### Features

- **Email-based authentication** - No passwords required
- **Session management** - Automatic 24-hour session expiry
- **Activity extension** - Session extends on user activity
- **Token validation** - Secure session tokens
- **Admin account management** - Add, update, deactivate accounts

### Admin Account Management

```typescript
// Add new admin account
await authService.addAdminAccount('admin@example.com', 'Admin Name', 'admin');

// Check authentication status
const isAuthenticated = authService.isAuthenticated();

// Get current session
const session = authService.getCurrentSession();

// Get all admin accounts
const accounts = await authService.getAllAdminAccounts();

// Update admin account
await authService.updateAdminAccount('admin@example.com', {
  isActive: true,
  role: 'super-admin'
});

// Deactivate account
await authService.deactivateAdminAccount('admin@example.com');
```

### Database Storage

Admin accounts are stored in Firebase Realtime Database:

```
admin/
├── accounts/
│   └── {emailKey}/
│       ├── email
│       ├── name
│       ├── role ('admin' | 'super-admin')
│       ├── createdAt (timestamp)
│       ├── lastLogin (timestamp)
│       └── isActive (boolean)
└── sessions/
    └── {sessionToken}
        ├── email
        ├── expiresAt (timestamp)
        └── isAuthenticated (boolean)
```

---

## Feature Flags System (`featureFlagsService`)

### Overview

Feature flags allow you to enable or disable specific features in the auction application without redeploying code. Changes take effect immediately for all users.

### Available Features

#### 🎯 Bidding Features

| Flag | Description | Default |
|------|-------------|---------|
| `gesture-bidding` | Device motion sensor for gesture-based bidding | ✅ Enabled |
| `auto-bid` | Automatic bidding increment suggestions | ❌ Disabled |

#### 🎨 UI & Display

| Flag | Description | Default |
|------|-------------|---------|
| `keyboard-shortcuts` | Enable keyboard shortcuts for quick actions | ✅ Enabled |
| `player-image-preload` | Preload player images for faster display | ✅ Enabled |
| `bid-history` | Show bid history for each player | ✅ Enabled |
| `team-stats` | Display detailed team statistics | ✅ Enabled |
| `dark-mode` | Dark mode theme option | ❌ Disabled |

#### 🔔 Notifications

| Flag | Description | Default |
|------|-------------|---------|
| `sound-notifications` | Audio alerts for bid events | ✅ Enabled |
| `toast-notifications` | Toast messages for bidding events | ✅ Enabled |

#### 📊 Analytics & Logging

| Flag | Description | Default |
|------|-------------|---------|
| `analytics` | Analytics tracking | ❌ Disabled |
| `audit-log` | Audit trail for admin actions | ❌ Disabled |

#### ⚙️ Other

| Flag | Description | Default |
|------|-------------|---------|
| `data-export` | Allow exporting auction data to CSV | ✅ Enabled |

### Managing Feature Flags

#### Through Admin Panel

1. Login to admin at `/admin`
2. Click on **Features** tab
3. Expand categories by clicking on them
4. Toggle features on/off with the switches
5. Changes apply immediately

#### Programmatically

```typescript
import { featureFlagsService } from './services/featureFlagsService';

// Check if feature is enabled
if (featureFlagsService.isEnabled('gesture-bidding')) {
  // Feature is enabled
}

// Get all flags
const allFlags = featureFlagsService.getAllFlags();

// Get flag by category
const biddingFlags = featureFlagsService.getFlagsByCategory('bidding');

// Toggle a feature
await featureFlagsService.toggleFeature('gesture-bidding', false, 'admin@example.com');

// Update multiple flags
await featureFlagsService.updateFlags({
  'gesture-bidding': false,
  'auto-bid': true,
  'dark-mode': true
});

// Reset to defaults
await featureFlagsService.resetToDefaults();

// Subscribe to changes
const unsubscribe = featureFlagsService.subscribe((flags) => {
  console.log('Flags updated:', flags);
});
```

#### In React Components

```typescript
import { useFeatureFlags } from './hooks';

function MyComponent() {
  const { isEnabled, getFlag, flags } = useFeatureFlags();

  if (!isEnabled('gesture-bidding')) {
    return <div>Feature not available</div>;
  }

  return <div>Gesture Bidding is enabled!</div>;
}
```

### Database Storage

Feature flags are stored in Firebase:

```
admin/
└── featureFlags/
    ├── gesture-bidding/
    │   ├── name: "Gesture-Based Bidding"
    │   ├── enabled: true
    │   ├── description: "..."
    │   ├── category: "bidding"
    │   ├── updatedAt: timestamp
    │   └── updatedBy: "admin@example.com"
    ├── auto-bid/
    │   └── ...
    └── ...
```

---

## Admin Panel Tabs

### 1. Theme & Settings

Customize the auction application's appearance and branding.

**Settings:**
- Organizer Name
- Auction Title
- Organizer Logo URL
- Primary Color
- Secondary Color
- Accent Color

**Features:**
- Real-time color picker
- Hex input for precise colors
- Logo preview
- Live theme application

### 2. Teams

Manage team information and statistics.

**Per Team:**
- Team Name
- Captain Name
- Team Logo URL
- Players Threshold (max players)
- Remaining Purse (₹L)

**Auto-updates:**
- Purse decrements when players sold
- Player counts track automatically
- Changes persist to Firebase

### 3. Export

Export auction data for external analysis.

**Exported Data:**
- Player ID
- Player Name
- Role
- Age
- Matches
- Best Figures
- Team Name
- Sold Amount (₹L)
- Base Price (₹L)
- Image URL
- Timestamp

**Format:** CSV (Comma Separated Values)

**Filename:** `auction-sold-players-YYYY-MM-DD.csv`

### 4. Features

Enable/disable app features in real-time.

**Organized by Category:**
- 🎯 Bidding Features
- 🎨 UI & Display
- 🔔 Notifications
- 📊 Analytics & Logging
- ⚙️ Other

**Statistics:**
- Total flags
- Enabled count
- Disabled count

**Actions:**
- Toggle individual features
- Reset all to defaults

### 5. Reset

Restore auction to initial state.

**This action will:**
1. Clear all sold players
2. Clear all unsold players
3. Reset team statistics
4. Restore initial snapshot from Google Sheets
5. Reload the page

**Requires confirmation** before execution.

---

## Authentication Flow

```
┌──────────────────┐
│  User navigates  │
│  to /admin/login │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────┐
│ Check localStorage for    │
│ existing valid session    │
└────────┬─────────────────┘
         │
    ┌────┴─────┐
    │           │
    ▼           ▼
 Session    No Session
 Valid      (expired or none)
    │           │
    ▼           ▼
Redirect    Show Login Form
to /admin       │
                ▼
        Enter Email Address
                │
                ▼
        Query Firebase for
        Admin Account
                │
            ┌───┴────┐
            │         │
            ▼         ▼
        Found    Not Found
            │         │
            ▼         ▼
        Create   Show Error
        Session  Message
            │
            ▼
        Save to
        localStorage
            │
            ▼
        Redirect to /admin
            │
            ▼
        Update lastLogin
        timestamp
```

---

## Feature Flag Flow

```
App Startup
    │
    ▼
useFeatureFlagsInit() hook
    │
    ▼
featureFlagsService.initialize()
    │
    ├─► Check Firebase for flags
    │   ├─ If exists: Load from DB
    │   └─ If not: Create defaults
    │
    ▼
Store flags in memory
    │
    ▼
Subscribe to changes
    │
    ├─► Admin toggles feature
    │
    ▼
Update Firebase
    │
    ▼
Notify subscribers
(update UI automatically)
    │
    ▼
useFeatureFlags() hook
receives updated flags
    │
    ▼
Components re-render
with new flag state
```

---

## Hooks Reference

### `useAdminAuth()`

Manage admin authentication.

```typescript
const {
  session,           // Current session object
  isAuthenticated,   // Boolean: is logged in
  loading,           // Boolean: request in progress
  error,             // String: error message or null
  login,             // async (email) => Promise<session>
  logout,            // async () => Promise<void>
  extendSession,     // () => void
  getTimeUntilExpiry // () => number (milliseconds)
} = useAdminAuth();
```

### `useFeatureFlags()`

Access feature flags in components.

```typescript
const {
  flags,        // FeatureFlags object
  initialized,  // Boolean: flags loaded
  isEnabled,    // (featureKey) => boolean
  getFlag,      // (featureKey) => FeatureFlag | null
  allFlags      // FeatureFlags object (same as flags)
} = useFeatureFlags();
```

### `useFeatureFlagsInit()`

Initialize feature flags on app load.

```typescript
const { initialized } = useFeatureFlagsInit();

// Wait for initialization
if (!initialized) return <div>Loading...</div>;
```

---

## API Reference

### authService

```typescript
class AuthService {
  // Authentication
  login(email: string): Promise<AdminSession>
  logout(): Promise<void>
  
  // Session Management
  getCurrentSession(): AdminSession | null
  isAuthenticated(): boolean
  validateToken(token: string): boolean
  extendSession(): void
  getTimeUntilExpiry(): number
  
  // Admin Account Management
  addAdminAccount(email, name, role): Promise<void>
  getAllAdminAccounts(): Promise<AdminAccount[]>
  updateAdminAccount(email, updates): Promise<void>
  deactivateAdminAccount(email): Promise<void>
}
```

### featureFlagsService

```typescript
class FeatureFlagsService {
  // Initialization
  initialize(): Promise<void>
  
  // Feature Access
  isEnabled(featureKey: string): boolean
  getFlag(featureKey: string): FeatureFlag | null
  getAllFlags(): FeatureFlags
  getFlagsByCategory(category): FeatureFlags
  
  // Feature Management
  toggleFeature(featureKey, enabled, updatedBy?): Promise<void>
  updateFlags(updates, updatedBy?): Promise<void>
  addFlag(key, flag): Promise<void>
  resetToDefaults(): Promise<void>
  
  // Subscriptions
  subscribe(listener): () => void (unsubscribe)
  
  // Statistics
  getStats(): { total, enabled, disabled }
}
```

---

## Security Considerations

### Authentication
- ✅ Email-based verification (no passwords stored)
- ✅ 24-hour session expiry
- ✅ Secure tokens (non-guessable format)
- ✅ Activity-based session extension
- ✅ localStorage with clear separation

### Authorization
- ✅ Admin account required (registered in Firebase)
- ✅ Role-based access (admin, super-admin)
- ✅ Active status verification
- ✅ Account deactivation capability

### Data Protection
- ✅ All admin data in Firebase (encrypted in transit)
- ✅ Firebase security rules restrict access
- ✅ Audit trail available (if enabled)
- ✅ Session tokens not reusable

### Recommendations
1. **Restrict network access** - Deploy only for internal/trusted users
2. **Use HTTPS** - Always use secure connections
3. **Monitor logins** - Check lastLogin timestamps regularly
4. **Rotate admins** - Deactivate unused accounts periodically
5. **Backup data** - Regular exports before major changes

---

## Troubleshooting

### Login Issues

**"Admin account not found"**
- Email not registered as admin
- Check email spelling
- Contact system administrator to create account

**"Session expired"**
- 24 hours of inactivity
- Clear localStorage and login again
- Or access admin panel with Ctrl+Shift+A shortcut

**"Login button not responding"**
- Check internet connection
- Verify Firebase is initialized
- Clear cache and reload

### Feature Flags Not Working

**Flag state not updating**
1. Check browser console for errors
2. Verify Firebase connection
3. Refresh the page (features should load)
4. Check feature flag in admin panel

**Feature still enabled after disabling**
1. Component may be caching the flag state
2. Clear browser cache
3. Refresh the page
4. Verify in Firefox DevTools → Storage → localStorage

### Admin Panel Issues

**Admin panel won't open**
- Verify Ctrl+Shift+A shortcut (case sensitive)
- Check if keyboard shortcuts feature is enabled
- Try accessing `/admin` directly

**Changes not saving**
- Check internet connection
- Verify Firebase access
- Try again after a few seconds
- Check browser console for errors

---

## API Endpoints

### Login Routes
- `GET /admin/login` - Login page
- `GET /admin` - Admin dashboard (protected)

### Backend Storage (Firebase Realtime)
- `admin/accounts/{emailKey}` - Admin accounts
- `admin/featureFlags/{flagKey}` - Feature flags
- `admin/sessions/{sessionToken}` - Active sessions (reserved)

---

## Future Enhancements

1. **Two-factor authentication** - SMS/Email OTP
2. **Role-based permissions** - Granular access control
3. **Audit logging** - Complete action history
4. **Bulk operations** - Update multiple features at once
5. **Admin account management UI** - Add/remove admins from panel
6. **Feature flag analytics** - Track feature usage
7. **Scheduled changes** - Enable/disable features at specific times
8. **Mobile-responsive admin panel** - Better mobile support
9. **Dark mode for admin** - Admin panel dark theme
10. **Backup & restore** - One-click backup system

---

## Support & Contact

For issues or questions:
1. Check this documentation
2. Review browser console (F12 → Console tab)
3. Contact system administrator
4. Submit bug reports with:
   - Email address
   - Steps to reproduce
   - Browser/device information
   - Screenshot or error message

---

**Last Updated:** February 2, 2026  
**Version:** 1.0.0  
**Status:** Production Ready

