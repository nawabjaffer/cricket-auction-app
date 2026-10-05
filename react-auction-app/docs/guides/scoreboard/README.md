# Public Scoreboard Guide

The public cricket scoreboard is a read-only view for viewers. Open the tournament's scoreboard link, normally `/{tenantSlug}/cricket/scoreboard`.

## Find a match

1. Use the match filters to narrow the list by tournament status or category.
2. Choose a match from the brief match list to open its details.
3. Select another match from the list to switch the detail view.
4. Use the tournament-wide leaderboard view to compare player statistics across matches.

## Read the score

The match detail includes the current or final total, innings information, and available batter, bowler, and match statistics. A match in progress may update as the scorer records deliveries. If an innings is complete or play is interrupted, use the displayed status as the authoritative match state.

Player images and team names appear when available; a missing image does not mean the player or statistic is missing.

## Sharing and troubleshooting

- Share the tenant-prefixed tournament URL, not an admin or scorer URL.
- If a match does not appear, confirm the tenant is active, the match has been saved in scoring admin, and the selected filters include its status.
- If the score appears stale, refresh the page once and compare with the live scorer before reporting a discrepancy.
- The public scoreboard is not an editing surface. Report corrections to the tournament scorer or administrator.