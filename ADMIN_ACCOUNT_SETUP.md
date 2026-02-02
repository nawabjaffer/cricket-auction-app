# Admin Account Setup Guide

## Quick Start - Adding Your First Admin Account

### Step 1: Access Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **e-auction-store**
3. Navigate to **Realtime Database**

### Step 2: Add Admin Account

#### Method A: Using Firebase Console (Easiest)

1. In Realtime Database, create the path: `admin/accounts`
2. For each admin email, replace dots and special characters with underscores in the email key

**Example: admin@example.com → admin@example_com**

3. Add the following structure:

```json
{
  "admin": {
    "accounts": {
      "admin@example_com": {
        "email": "admin@example.com",
        "name": "Admin Name",
        "role": "admin",
        "createdAt": <timestamp>,
        "lastLogin": null,
        "isActive": true
      }
    }
  }
}
```

**Where:**
- `email`: Full email address (must match login email)
- `name`: Display name for the admin
- `role`: `"admin"` or `"super-admin"`
- `createdAt`: Current timestamp (e.g., 1707000000000)
- `lastLogin`: Can be null initially
- `isActive`: `true` or `false`

#### Method B: Using Browser Console (Advanced)

1. Open application in browser (logged in)
2. Open DevTools (F12)
3. Go to Console tab
4. Run this code:

```javascript
import { authService } from './src/services/authService';

// Add admin account
await authService.addAdminAccount(
  'admin@example.com',
  'Admin Name',
  'admin'
);

console.log('Admin account created!');
```

### Step 3: Test Login

1. Go to: `https://e-auction-store.web.app/admin/login`
2. Enter the email: `admin@example.com`
3. Click "Access Admin Panel"
4. Should be redirected to `/admin` dashboard

---

## Managing Admin Accounts

### View All Admin Accounts

Navigate to Firebase Realtime Database and check `admin/accounts/`

### Update Admin Account

**Via Firebase Console:**
1. Click on the account to edit
2. Modify fields (name, role, isActive)
3. Update lastLogin timestamp

**Via Code:**
```javascript
await authService.updateAdminAccount('admin@example.com', {
  name: 'New Name',
  role: 'super-admin',
  isActive: true
});
```

### Deactivate Admin Account

**Via Firebase Console:**
Set `isActive` to `false`

**Via Code:**
```javascript
await authService.deactivateAdminAccount('admin@example.com');
```

### Delete Admin Account

**Warning:** This removes the account permanently.

In Firebase Console:
1. Go to `admin/accounts/{emailKey}`
2. Click the three dots menu
3. Click "Delete"

---

## Admin Roles

### `admin`
- Standard admin privileges
- Can manage teams, export data, reset auction
- Can toggle feature flags
- Can customize theme

### `super-admin`
- Full system access
- Can perform all admin tasks
- Can manage other admin accounts (future feature)

**Current Implementation Note:** Both roles have identical permissions in v1.0. Role differentiation will be added in future versions.

---

## Email Handling

### Email Address Format

Emails are stored with the domain intact but special characters replaced:

| Original Email | Database Key |
|---|---|
| `admin@example.com` | `admin@example_com` |
| `john.doe@company.com` | `john_doe@company_com` |
| `user+tag@site.org` | `user_tag@site_org` |

### Why This Format?

Firebase doesn't allow these characters in keys: `.`, `#`, `$`, `[`, `]`

The `authService` automatically handles this conversion in the `login()` function.

---

## Session Management

### Session Duration
- **Duration:** 24 hours
- **Storage:** Browser localStorage (key: `adminSession`)
- **Extension:** Extends on any user activity

### Check Session Status

In browser console:
```javascript
const session = authService.getCurrentSession();
console.log('Authenticated:', authService.isAuthenticated());
console.log('Time until expiry:', authService.getTimeUntilExpiry());
```

### Force Logout

Clear localStorage:
```javascript
localStorage.removeItem('adminSession');
location.reload();
```

---

## Troubleshooting

### Can't Create Account via Firebase Console

**Issue:** "Invalid characters in key"

**Solution:** Make sure to replace special characters:
- `.` → `_` (dot to underscore)
- `#` → `_` (hash to underscore)
- `$` → `_` (dollar to underscore)
- `[` → `_` (bracket to underscore)
- `]` → `_` (bracket to underscore)

### Admin Email Not Found

1. Check email spelling matches exactly
2. Verify email is in Firebase at `admin/accounts/{emailKey}`
3. Confirm `isActive` is `true`
4. Clear browser cache and try again

### Session Keeps Expiring

- Normal: 24 hours of inactivity = logout
- Check if browser is blocking localStorage
- Try a different browser
- Disable browser extensions that clear storage

---

## Example Setup - Multiple Admins

```json
{
  "admin": {
    "accounts": {
      "alice@company_com": {
        "email": "alice@company.com",
        "name": "Alice Johnson",
        "role": "super-admin",
        "createdAt": 1707000000000,
        "lastLogin": 1707100000000,
        "isActive": true
      },
      "bob@company_com": {
        "email": "bob@company.com",
        "name": "Bob Smith",
        "role": "admin",
        "createdAt": 1707010000000,
        "lastLogin": 1707095000000,
        "isActive": true
      },
      "charlie@company_com": {
        "email": "charlie@company.com",
        "name": "Charlie Brown",
        "role": "admin",
        "createdAt": 1707020000000,
        "lastLogin": null,
        "isActive": false
      }
    }
  }
}
```

---

## Firebase Security Rules

**Current Setup:** Uses default Firebase rules allowing authenticated users full access.

**For Production:** Implement these rules:

```json
{
  "rules": {
    "admin": {
      "accounts": {
        ".read": "root.child('admin').child('accounts').child(auth.uid).exists()",
        ".write": "root.child('admin').child('accounts').child(auth.uid).child('role').val() === 'super-admin'"
      },
      "featureFlags": {
        ".read": true,
        ".write": "root.child('admin').child('accounts').child(auth.uid).exists()"
      }
    }
  }
}
```

---

## Monitoring & Maintenance

### Weekly Checks
- [ ] Review `lastLogin` timestamps
- [ ] Deactivate unused accounts
- [ ] Check for suspicious activity

### Monthly Tasks
- [ ] Export audit logs (if enabled)
- [ ] Review admin account list
- [ ] Update admin names/roles if needed
- [ ] Test recovery procedures

### Backup Procedures
1. Export all data before major changes
2. Store admin account list offline
3. Document any custom changes

---

**Last Updated:** February 2, 2026  
**Status:** Production Ready

