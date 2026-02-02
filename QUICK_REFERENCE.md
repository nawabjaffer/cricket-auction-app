# 🚀 Quick Reference - Firebase Mobile Bidding Sync

## URLs
```
🌐 Desktop: https://e-auction-store.web.app
📱 Mobile:  https://e-auction-store.web.app/mobile-bidding
🔧 Debug:   https://e-auction-store.web.app/diagnostics
```

## Network Setup
- ✅ Both devices on same WiFi (or same internet)
- ✅ Mobile shows "Connecting..." → then "Waiting for auction"
- ✅ Desktop shows green banner: "Firebase Connected"

## Desktop → Mobile: See Current Player
1. Desktop starts auction
2. Mobile automatically shows current player
3. All state updates sync in real-time (< 1 second)

## Mobile → Desktop: Place Bid
1. Mobile selects team
2. Mobile clicks "Raise Bid"
3. Desktop immediately shows bid applied
4. Desktop broadcasts new state back to mobile

## Check Connection
- **Desktop Console**: Look for `✅ Desktop sync initialized`
- **Mobile Console**: Look for `✅ Mobile sync initialized`
- **Visit**: https://e-auction-store.web.app/diagnostics

## If Not Working
1. Hard refresh both: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. Check browser console (F12) for red errors
3. Verify network - must be WiFi or internet
4. Check Firebase: https://console.firebase.google.com/project/e-auction-store

## Key Files
- `realtimeSync.ts` - Firebase service
- `useRealtimeSync.ts` - React hooks
- `App.tsx` - Line 99: Desktop sync
- `MobileBidding.tsx` - Mobile UI

## Deploy Changes
```bash
cd react-auction-app
npm run build
firebase deploy --only hosting
```

## Firebase Details
- Project: e-auction-store
- Region: asia-southeast1
- Database: https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Mobile shows "Connecting..." forever | Hard refresh, check internet, try diagnostics page |
| Desktop not showing bid | Refresh desktop, check console for mobile bid message |
| No real-time updates | Check Firebase Console → Database → Rules deployed |
| Both devices stuck | Close all tabs, clear cache, restart browser |

## Console Messages (Good)
✅ `[RealtimeSync] Firebase initialized successfully`
✅ `[useRealtimeDesktopSync] ✅ Desktop sync initialized`
✅ `[useRealtimeMobileSync] ✅ Mobile sync initialized`
✅ `[useRealtimeSync] 📡 Broadcasting state update`
✅ `[useRealtimeSync] 📱 Mobile bid received`

## Status
✅ Live and deployed
✅ All features working
✅ Ready for production use

---

For more details, see: `FIREBASE_REALTIME_SYNC_COMPLETE.md` or `FIREBASE_SYNC_TROUBLESHOOTING.md`
