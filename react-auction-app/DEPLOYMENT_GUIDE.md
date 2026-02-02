# Firebase Deployment Guide

## ✅ Completed Steps

### 1. Hosting Deployed
Your app is now live at: **https://e-auction-store.web.app**

- Main Auction App: https://e-auction-store.web.app
- Mobile Bidding: https://e-auction-store.web.app/mobile-bidding

## 🔧 Next Steps - Enable Realtime Database

The Firebase Realtime Database needs to be created manually:

### Step 1: Create Database Instance
1. Go to [Firebase Console - Database](https://console.firebase.google.com/project/e-auction-store/database)
2. Click **"Create Database"** under **Realtime Database** section
3. Choose location: **us-central1** (or closest to your users)
4. Start in **test mode** (we'll deploy security rules after)

### Step 2: Deploy Database Rules
After creating the database instance, run:
```bash
cd /Users/nsalahud/Postman/auctionApp/react-auction-app
firebase deploy --only database
```

This will deploy the security rules from `database.rules.json`.

### Step 3: Update Database URL (if needed)
If Firebase creates a database with a different URL, update `src/services/realtimeSync.ts`:
```typescript
databaseURL: 'https://e-auction-store-default-rtdb.firebaseio.com',
```

## 📱 Testing Cross-Device Sync

Once the database is set up:

1. **Desktop**: Open https://e-auction-store.web.app
2. **Mobile**: Open https://e-auction-store.web.app/mobile-bidding
3. Login with team credentials
4. Place bids from mobile - they should appear on desktop in real-time!

## 🔄 Future Deployments

After setup is complete, deploy everything with:
```bash
npm run deploy        # Hosting only
npm run deploy:rules  # Database rules only
npm run deploy:all    # Both hosting and database
```

## 🔑 Team Credentials

Default team credentials are in `src/services/auth.ts`:
- CSK: password 'csk123'
- MI: password 'mi123'
- RCB: password 'rcb123'
- etc.

## 📊 Firebase Console Links

- **Project Overview**: https://console.firebase.google.com/project/e-auction-store/overview
- **Hosting**: https://console.firebase.google.com/project/e-auction-store/hosting
- **Realtime Database**: https://console.firebase.google.com/project/e-auction-store/database
- **Authentication**: https://console.firebase.google.com/project/e-auction-store/authentication

## 🐛 Troubleshooting

### Mobile can't connect
- Check if Realtime Database is created
- Verify database URL in `realtimeSync.ts`
- Check browser console for errors

### Bids not syncing
- Open browser DevTools Network tab
- Look for WebSocket connections to Firebase
- Check database rules allow read/write

### Build errors
```bash
npm run build
```
Fix any TypeScript errors before deploying.
