#!/usr/bin/env node
// ============================================================================
// CricHeroes → Firebase RTDB Live Score Sync
// 
// Polls a CricHeroes public match scorecard page and writes live score data
// to Firebase RTDB so your custom OBS overlay can display it.
//
// Usage:
//   node scripts/cricheroes-sync.mjs <cricheroes-match-url> <firebase-match-id> [options]
//
// Examples:
//   node scripts/cricheroes-sync.mjs https://cricheroes.com/scorecard/12345/match-slug match_123
//   node scripts/cricheroes-sync.mjs 12345 match_123 --interval=5000
//   node scripts/cricheroes-sync.mjs 12345 match_123 --tenant=epl_2026
//
// Options:
//   --interval=<ms>   Poll interval in milliseconds (default: 8000)
//   --tenant=<slug>   Tenant slug (default: reads from .env or 'epl_2026')
//   --dry-run         Print data without writing to Firebase
//
// Requirements:
//   - Firebase service account credentials (GOOGLE_APPLICATION_CREDENTIALS env)
//   - OR the Firebase project initialized with default credentials
// ============================================================================

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Parse CLI args ──

const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    flags[key] = val ?? true;
  } else {
    positional.push(arg);
  }
}

const cricHeroesInput = positional[0];
const firebaseMatchId = positional[1];

if (!cricHeroesInput || !firebaseMatchId) {
  console.error(`
Usage: node scripts/cricheroes-sync.mjs <cricheroes-match-url-or-id> <firebase-match-id> [options]

Options:
  --interval=<ms>   Poll interval (default: 8000)
  --tenant=<slug>   Tenant slug (default: epl_2026)
  --dry-run         Print without writing to Firebase
`);
  process.exit(1);
}

const POLL_INTERVAL = parseInt(flags.interval || '8000', 10);
const TENANT = flags.tenant || process.env.TENANT_SLUG || 'epl_2026';
const DRY_RUN = !!flags['dry-run'];

// ── Extract CricHeroes match ID ──

function extractMatchId(input) {
  if (/^\d+$/.test(input.trim())) return input.trim();
  const m1 = input.match(/cricheroes\.com\/scorecard\/(\d+)/);
  if (m1) return m1[1];
  const m2 = input.match(/cricheroes\.com\/match\/(\d+)/);
  if (m2) return m2[1];
  return input.trim();
}

const chMatchId = extractMatchId(cricHeroesInput);
console.log(`[CricHeroes Sync] Match ID: ${chMatchId}`);
console.log(`[CricHeroes Sync] Firebase match: ${firebaseMatchId}`);
console.log(`[CricHeroes Sync] Tenant: ${TENANT}`);
console.log(`[CricHeroes Sync] Poll interval: ${POLL_INTERVAL}ms`);
console.log(`[CricHeroes Sync] Dry run: ${DRY_RUN}`);
console.log('');

// ── Initialize Firebase Admin ──

let db;
if (!DRY_RUN) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let appConfig = { databaseURL: 'https://e-auction-store-default-rtdb.firebaseio.com' };
  
  if (credPath && existsSync(credPath)) {
    const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
    appConfig.credential = cert(serviceAccount);
  } else {
    // Try loading from project root
    const localCred = resolve(process.cwd(), 'serviceAccountKey.json');
    if (existsSync(localCred)) {
      const serviceAccount = JSON.parse(readFileSync(localCred, 'utf8'));
      appConfig.credential = cert(serviceAccount);
    } else {
      console.warn('[CricHeroes Sync] No service account found. Using default credentials.');
      console.warn('  Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in project root.');
    }
  }

  const app = initializeApp(appConfig);
  db = getDatabase(app);
}

// ── Fetch CricHeroes scorecard page ──

async function fetchCricHeroesData(matchId) {
  // CricHeroes scorecard pages use Next.js SSR
  // The page HTML contains __NEXT_DATA__ with all scorecard info
  const url = `https://cricheroes.com/scorecard/${matchId}/live`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error(`[CricHeroes] HTTP ${response.status} from ${url}`);
      return null;
    }

    const html = await response.text();
    
    // Extract __NEXT_DATA__ JSON from the page
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const nextData = JSON.parse(nextDataMatch[1]);
      return extractFromNextData(nextData);
    }

    // Fallback: try to find JSON data in script tags
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try alternate data pattern
    const dataMatch = html.match(/"scorecard":\s*({[\s\S]*?})\s*[,}]/);
    if (dataMatch) {
      return JSON.parse(dataMatch[1]);
    }

    console.warn('[CricHeroes] Could not parse page data. The page structure may have changed.');
    return null;
  } catch (err) {
    console.error('[CricHeroes] Fetch error:', err.message);
    return null;
  }
}

function extractFromNextData(nextData) {
  // Navigate the Next.js page props to find scorecard data
  const pageProps = nextData?.props?.pageProps;
  if (!pageProps) return null;

  // CricHeroes typically puts match data under pageProps.matchData or pageProps.scorecard
  const matchData = pageProps.matchData || pageProps.scorecard || pageProps.match || pageProps;
  
  return matchData;
}

// ── Transform CricHeroes data to LiveScore format ──

function transformToLiveScore(data) {
  if (!data) return null;

  // Handle various CricHeroes data structures
  const innings = data.current_innings_data 
    || data.innings?.[(data.current_innings || 1) - 1]
    || data.live_innings
    || data.batting_scorecard;
  
  if (!innings && !data.runs && data.total_runs === undefined) {
    // Try to extract from a different structure
    if (data.teams && data.teams.length >= 2) {
      // Some CricHeroes pages structure data differently
      return transformTeamsFormat(data);
    }
    console.warn('[CricHeroes] No innings data found in response');
    return null;
  }

  // If innings is the data itself (flat structure)
  const src = innings || data;

  const totalRuns = src.total_runs ?? src.runs ?? src.score ?? 0;
  const totalWickets = src.total_wickets ?? src.wickets ?? 0;
  const totalOvers = parseFloat(String(src.total_overs ?? src.overs ?? 0));
  const runRate = src.run_rate ?? src.crr ?? (totalOvers > 0 ? +(totalRuns / totalOvers).toFixed(2) : 0);

  // Batsmen
  const rawBatsmen = src.current_batsmen || src.batsman || src.batsmen || src.batting || [];
  const activeBatsmen = Array.isArray(rawBatsmen) 
    ? rawBatsmen.filter(b => !b.is_out && !b.isOut).slice(0, 2)
    : [];

  const currentBatsmen = [
    transformBatsman(activeBatsmen[0], true),
    transformBatsman(activeBatsmen[1], false),
  ];

  // Bowler
  const rawBowlers = src.current_bowler || src.bowler || src.bowlers || src.bowling || [];
  const currentBowlerRaw = Array.isArray(rawBowlers) ? rawBowlers[0] : rawBowlers;
  const currentBowler = transformBowler(currentBowlerRaw);

  // Over balls
  const currentOverBalls = src.this_over || src.current_over || src.thisOver || [];

  // Partnership
  const partnership = src.partnership || { runs: 0, balls: 0 };

  // Teams
  const battingTeamId = String(src.batting_team_id || data.team_a?.id || '');
  const bowlingTeamId = String(src.bowling_team_id || data.team_b?.id || '');

  return {
    matchId: firebaseMatchId,
    currentInnings: (data.current_innings || 1),
    battingTeamId,
    bowlingTeamId,
    runs: totalRuns,
    wickets: totalWickets,
    overs: totalOvers,
    runRate: Math.round(runRate * 100) / 100,
    requiredRate: src.required_run_rate ?? src.rrr ?? undefined,
    target: src.target ?? undefined,
    currentBatsmen,
    currentBowler,
    lastBall: currentOverBalls[currentOverBalls.length - 1] || '0',
    lastBallRuns: 0,
    currentOverBalls: currentOverBalls.map(String),
    recentOvers: (src.recent_overs || []).map(String),
    partnership: { runs: partnership.runs || 0, balls: partnership.balls || 0 },
    lastUpdated: Date.now(),
    isPowerplay: totalOvers < 6,
    powerplayOvers: 6,
    isFreehit: false,
  };
}

function transformTeamsFormat(data) {
  // Handle CricHeroes team-oriented data structure
  const battingTeam = data.teams?.find(t => t.is_batting) || data.teams?.[0];
  if (!battingTeam) return null;
  
  return {
    matchId: firebaseMatchId,
    currentInnings: data.current_innings || 1,
    battingTeamId: String(battingTeam.id || ''),
    bowlingTeamId: String(data.teams?.find(t => !t.is_batting)?.id || ''),
    runs: battingTeam.runs || battingTeam.score || 0,
    wickets: battingTeam.wickets || 0,
    overs: parseFloat(String(battingTeam.overs || 0)),
    runRate: battingTeam.run_rate || 0,
    currentBatsmen: [
      transformBatsman(battingTeam.current_batsmen?.[0], true),
      transformBatsman(battingTeam.current_batsmen?.[1], false),
    ],
    currentBowler: transformBowler(battingTeam.current_bowler),
    lastBall: '0',
    lastBallRuns: 0,
    currentOverBalls: [],
    recentOvers: [],
    partnership: { runs: 0, balls: 0 },
    lastUpdated: Date.now(),
    isPowerplay: parseFloat(String(battingTeam.overs || 0)) < 6,
    powerplayOvers: 6,
    isFreehit: false,
  };
}

function transformBatsman(raw, isOnStrike) {
  if (!raw) {
    return { playerId: '', playerName: 'TBD', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike };
  }
  return {
    playerId: String(raw.player_id || raw.id || ''),
    playerName: raw.player_name || raw.name || 'Unknown',
    runs: raw.runs || 0,
    balls: raw.balls || raw.balls_faced || 0,
    fours: raw.fours || raw['4s'] || 0,
    sixes: raw.sixes || raw['6s'] || 0,
    strikeRate: raw.strike_rate || raw.sr || 0,
    isOnStrike: raw.is_on_strike ?? raw.on_strike ?? isOnStrike,
  };
}

function transformBowler(raw) {
  if (!raw) {
    return { playerId: '', playerName: 'TBD', overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, dots: 0 };
  }
  return {
    playerId: String(raw.player_id || raw.id || ''),
    playerName: raw.player_name || raw.name || 'Unknown',
    overs: parseFloat(String(raw.overs || 0)),
    maidens: raw.maidens || 0,
    runs: raw.runs ?? raw.runs_conceded ?? 0,
    wickets: raw.wickets || 0,
    economy: raw.economy || raw.eco || 0,
    dots: raw.dots || raw.dot_balls || 0,
  };
}

// ── Main polling loop ──

const basePath = `tenants/${TENANT}/scoring`;
const livePath = `${basePath}/matches/${firebaseMatchId}/live`;
let lastScore = null;
let pollCount = 0;

async function poll() {
  pollCount++;
  const data = await fetchCricHeroesData(chMatchId);
  
  if (!data) {
    if (pollCount === 1) {
      console.error('[CricHeroes Sync] First poll failed. Check the match URL/ID.');
      console.error(`  Tried: https://cricheroes.com/scorecard/${chMatchId}/live`);
    }
    return;
  }

  const liveScore = transformToLiveScore(data);
  if (!liveScore) {
    console.warn(`[Poll #${pollCount}] Could not extract live score from CricHeroes data`);
    return;
  }

  // Only write if score changed
  const scoreKey = `${liveScore.runs}/${liveScore.wickets} (${liveScore.overs})`;
  if (scoreKey !== lastScore) {
    lastScore = scoreKey;
    
    const striker = liveScore.currentBatsmen[0];
    const bowler = liveScore.currentBowler;
    console.log(`[Poll #${pollCount}] ${scoreKey} | ${striker.playerName} ${striker.runs}(${striker.balls}) | ${bowler.playerName} ${bowler.overs}-${bowler.wickets}-${bowler.runs}`);

    if (!DRY_RUN && db) {
      // Strip undefined values (Firebase RTDB rejects them)
      const cleaned = JSON.parse(JSON.stringify(liveScore));
      await db.ref(livePath).set(cleaned);
      console.log(`  → Written to Firebase: ${livePath}`);
    } else if (DRY_RUN) {
      console.log('  [DRY RUN] Would write:', JSON.stringify(liveScore, null, 2).slice(0, 200) + '...');
    }
  } else {
    // No change
    if (pollCount % 10 === 0) {
      console.log(`[Poll #${pollCount}] No change (${scoreKey})`);
    }
  }
}

// ── Start ──

console.log(`\n[CricHeroes Sync] Starting... (Ctrl+C to stop)\n`);
console.log(`  CricHeroes URL: https://cricheroes.com/scorecard/${chMatchId}/live`);
console.log(`  Firebase path:  ${livePath}`);
console.log('');

// Initial poll
await poll();

// Periodic polling
const interval = setInterval(poll, POLL_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[CricHeroes Sync] Stopped.');
  clearInterval(interval);
  process.exit(0);
});
