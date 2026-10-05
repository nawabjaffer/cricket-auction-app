# Administration Guide

Open **Admin** from the auction app and sign in with an administrator account. Admin settings are tournament-scoped; confirm the tournament shown in the app before changing data.

## Recommended setup order

1. **Auction settings:** Set tournament identity, sport, role order, currency, screen layout, bidding rules, branding, and access.
2. **Teams:** Create the participating teams and verify names, logos, and enabled bidding access.
3. **Match Type:** Configure match formats, pools, schedule, and scoring options used by the tournament.
4. **Purse control:** Set or reconcile each team's available budget before the auction.
5. **Players:** Review imported or manually entered player records; remove duplicates and correct roles and prices.
6. **Registration form:** Choose the fields shown to players and whether registration is open.
7. **Sponsors:** Add sponsor names and media used in supported displays.
8. **Streaming:** Configure OBS connection, overlays, and scoring links before match day.
9. **Export data:** Download and verify auction results after the event.

## Manage settings carefully

- Save each section before leaving it and check the visible success or error message.
- Test access with a non-admin team account when changing team credentials or permissions.
- Use the **Features** section to control optional capabilities. Hiding a feature does not erase its stored data.
- Use **Reset** only after confirming which auction state will be cleared. Export results first and obtain event-owner approval.
- Keep administrator credentials private; do not publish credentials in a README, QR code, or public registration page.

## Tenant access

The tournament can be unavailable when its tenant is inactive. Ask a platform administrator to verify the tenant's activation and URL. Tenant status is managed in **Platform Admin**, separately from tournament-level settings.

## Troubleshooting

- **A setting is missing:** Check the selected sport and feature flags; some controls are conditional.
- **A public page is unavailable:** Verify the tournament URL, tenant activation, and whether that public feature is enabled.
- **A save fails:** Check the connection indicator, retry once, and confirm the saved value after reloading before repeating a change.
- **A team cannot bid:** Confirm that the team exists, bidding is enabled, and its login details are current.