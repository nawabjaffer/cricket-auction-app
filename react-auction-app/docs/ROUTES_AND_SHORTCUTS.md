Routes
Source: main.tsx:66

Legacy top-level routes
/
/connect-bididng
/diagnostics
/admin/login
/admin
/camera
/live
/live-admin
/obs-overlay
/obs-dock
/platform-admin
Tenant-scoped routes
/:tenantSlug
/:tenantSlug/connect-bididng
/:tenantSlug/connect-bidding
/:tenantSlug/diagnostics
/:tenantSlug/admin/login
/:tenantSlug/admin
/:tenantSlug/camera
/:tenantSlug/live
/:tenantSlug/live-admin
/:tenantSlug/obs-overlay
/:tenantSlug/obs-dock
Notes:

Both /connect-bididng and /connect-bidding exist (the first is typo-compatible legacy).
/platform-admin currently exists only as non-tenant route.
Shortcuts
Main shortcut engine: useKeyboardShortcuts.ts:28
Applied in App: App.tsx:245
Extra App-level keys: App.tsx:293
Live page keys: LivePage.tsx:462

Auction page (App)
F: Open Jump To Player modal
1..8: Place bid for eligible team slot 1..8
/ then 1..8 within 1 second: Open Team Squad View for that team
Q: Increase bid multiplier (up to 10x in App flow)
W: Decrease bid multiplier (down to 1x)
Z: Undo/decrement bid
N: Next player
S: Mark sold
U: Mark unsold
Space: If overlay active, close overlay and move next
P: Toggle team squad display
T: Toggle player/team overlay view
=: Toggle header
-: Toggle analytics carousel
Escape: Close overlay (and escape handler)
Ctrl/Cmd + Shift + A: Toggle Admin panel
B: Toggle Break overlay
L: Trigger transition and go to /live
/: Toggle Top 3 Buys overlay
Top 3 Buys open state:
ArrowRight: Next card
ArrowLeft: Previous card
Escape: Close Top 3 Buys
When team overlay/squad is open:
[: Previous team
]: Next team
P: Open team display
Live page (/live)
L: Transition back to /
1..8: Raise bid for team slot
Q: Increase bid multiplier (doubling, capped)
W: Decrease bid multiplier (halving, floored)
=: Toggle header/menu bar
-: Toggle marquee/carousel
0: Toggle debug
S: Mark sold
U: Mark unsold
N: Next player
Z: Close overlay
Shift + R: Reset auction (with confirm)
T: Toggle team stats overlay
[: Previous team
]: Next team
P: Previous team and show team stats
O: Next team and show team stats
Escape: If setup screen open, go to /admin; else hide header
OBS Dock page
Enter: Trigger Connect action in OBS connection form
Source: OBSDockPage.tsx:96
If you want, I can also generate a one-page in-app shortcut cheat sheet modal mapped exactly to these keys so your operators can use it during live auction.