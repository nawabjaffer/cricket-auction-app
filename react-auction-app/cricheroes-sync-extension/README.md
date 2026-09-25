# CricHeroes Live Sync

This Chrome extension reads selected sections of a CricHeroes match and relays the scorecard/commentary to the scorer app in the same Chrome profile. It does not call an external API or need an API key.

## Install

1. Download `cricheroes-live-sync.zip` from **Scoring Admin → Providers** and extract it.
2. In Chrome, type `chrome://extensions/` in the address bar and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `cricheroes-live-sync` folder. Chrome requires this explicit user action; downloading an extension cannot silently install it.
4. Open the extension from Chrome’s Extensions menu. Enter the CricHeroes scorecard URL, enable **Scorecard**, **Commentary**, and **Teams**, then save.
5. Keep the scorer app’s **Providers** page open in another tab in the same Chrome profile. Select the app match below, then open the configured CricHeroes scorecard.

## Capture Team Rosters

With **Teams** enabled, open each CricHeroes team profile’s **Members** tab once and wait for the player cards to load. The open Providers page receives and saves the roster for the current tenant in this browser. Map the captured CricHeroes team to its app team, then map the players. The feed console on Providers is optional; it is only for troubleshooting.

If no roster appears, confirm the extension is enabled, reload the CricHeroes Members tab and the Providers tab, and make sure the player cards have finished loading. If live scores do not appear, confirm the configured match URL is the same scorecard and both tabs use the same Chrome profile.

When updating, open `chrome://extensions/`, choose **Reload** on the extension card, then reload the Providers and CricHeroes tabs.

## Use

The popup stores the match URL and selected CricHeroes tabs in Chrome sync storage. The scraper reads configured selectors every poll, so selector changes saved from scorer admin apply without reinstalling the extension. The generated download is refreshed by `npm run dev` and `npm run build`.

## Mid-Innings Import

Open the scorer update page for the fixture, then select **Start from current live score** when the feed arrives. Choose the innings/team and map CricHeroes players to the app roster. Exact player-name matches are preselected; unresolved or ambiguous names need a manual match. The import seeds the current cumulative totals and player figures. It retains the captured commentary, but does not fabricate past ball-by-ball events, so those deliveries are not available in the app's undo/history.

The extension forwards team totals, batting/bowling scorecard rows, current players, over count, latest commentary, and text found in the Full Commentary section.

## Troubleshooting

- If the Providers page says it is waiting, verify both tabs are in the same Chrome profile, reload them, and check that this extension is enabled. The optional feed console shows diagnostic logs.
- If the feed is stale, keep the CricHeroes live scorecard active long enough for its scorecard/commentary to render, then revisit the admin tab.
- If a player is not in the selector, set up that match's lineup or auction team roster first.
- If Chrome shows an extension error after editing files, open the extension card in `chrome://extensions`, choose **Reload**, then reload both browser tabs.
- Browser sync is tab-to-tab and browser-local. It is not a server-side feed and does not sync across devices.

The extension is limited to CricHeroes, `localhost`, `127.0.0.1`, and the configured Firebase Hosting domains. If the scorer app uses another deployed domain, add that exact host to both `content_scripts.matches` and `host_permissions` in `manifest.json`, and to `appHosts` in `background.js`, then reload the extension.