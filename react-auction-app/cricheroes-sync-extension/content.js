let hasLoggedRelayWarning = false;
const extensionVersion = chrome.runtime.getManifest().version;
const defaultSyncSettings = {
  enabledTabs: ['scorecard', 'commentary'],
  selectors: {
    teamContainers: '[class*="scoreWrapper"] [class*="teamScoreDetails"]',
    teamName: '[class*="teamName"]',
    teamActive: '[class*="isActive"]',
    teamOvers: '[class*="overSpan"]',
    batterTable: 'table[class*="table"]',
    bowlerTable: 'table[class*="table"]',
    latestCommentary: '[class*="commentary"], [class*="Commentary"] tr, div[class*="commentaryText"]',
    fullCommentaryTab: '[class*="dropdownSWrapper"]'
  }
};

console.info(`[CricHeroes Sync] Content script v${extensionVersion} active at ${window.location.origin}`);

function scrapeAndDispatch() {
  chrome.storage.sync.get({ cricHeroesSyncSettings: defaultSyncSettings }, ({ cricHeroesSyncSettings }) => {
    const settings = { ...defaultSyncSettings, ...(cricHeroesSyncSettings || {}) };
    settings.selectors = { ...defaultSyncSettings.selectors, ...(settings.selectors || {}) };
    const section = window.location.pathname.split('/').filter(Boolean).at(-1) || 'summary';
    const normalizedSection = section === 'live' ? 'commentary' : section.toLowerCase();
    if (Array.isArray(settings.enabledTabs) && !settings.enabledTabs.includes(normalizedSection)) return;

    const currentMatchId = window.location.pathname.match(/\/scorecard\/(\d+)/)?.[1];
    const configuredMatchId = settings.matchUrl?.match(/\/scorecard\/(\d+)/)?.[1];
    if (configuredMatchId && currentMatchId && configuredMatchId !== currentMatchId) return;

    scrapeConfiguredPage(settings.selectors || defaultSyncSettings.selectors);
  });
}

function scrapeConfiguredPage(selectors) {
  try {
    const scoreContainers = document.querySelectorAll(selectors.teamContainers);
    let battingTeam = "", bowlingTeam = "", currentOvers = "", runs = 0, wickets = 0;

    scoreContainers.forEach((container) => {
      const teamName = container.querySelector(selectors.teamName)?.innerText.trim() || '';
      if (!teamName) return;
      const overSpan = container.querySelector(selectors.teamOvers);
      const oversText = overSpan ? overSpan.innerText.replace(/[()]/g, '').trim() : "0.0";
      const scoreMatch = container.innerText.match(/(\d+)\s*[/-]\s*(\d+)/);

      if (container.querySelector(selectors.teamActive)) {
        battingTeam = teamName;
        currentOvers = oversText.split(" ")[0]; // Extracts just numerical "5.3" from "5.3 Ov"
        if (scoreMatch) {
          runs = Number.parseInt(scoreMatch[1], 10) || 0;
          wickets = Number.parseInt(scoreMatch[2], 10) || 0;
        }
      } else {
        bowlingTeam = teamName;
      }
    });

    const batterTables = document.querySelectorAll(selectors.batterTable);
    const bowlerTables = document.querySelectorAll(selectors.bowlerTable);
    let strikerName = "", strikerBalls = "0", strikerSixes = "0";
    let nonStrikerName = "", bowlerName = "";
    const batsmen = [];
    const bowlers = [];

    if (batterTables.length > 0) {
      const batterRows = batterTables[0].querySelectorAll('tbody tr');
      batterRows.forEach((row, i) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          const name = cells[0].innerText.trim();
          const playerName = name.replace('*', '').trim();
          const runsScored = Number.parseInt(cells[1].innerText.replace(/\D/g, ''), 10) || 0;
          const balls = Number.parseInt(cells[2].innerText.replace(/\D/g, ''), 10) || 0;
          const fours = Number.parseInt(cells[3].innerText.replace(/\D/g, ''), 10) || 0;
          const sixes = Number.parseInt(cells[4].innerText.replace(/\D/g, ''), 10) || 0;
          const strikeRate = Number.parseFloat(cells[5]?.innerText.replace(/[^\d.]/g, '') || '0') || 0;
          const rowText = row.innerText.trim();
          const dismissal = cells[6]?.innerText.trim() || (/not out/i.test(rowText) ? 'not out' : '');
          batsmen.push({
            name: playerName,
            runs: runsScored,
            balls,
            fours,
            sixes,
            strikeRate,
            dismissal,
            isStriker: name.includes('*'),
            isOut: Boolean(dismissal && dismissal.toLowerCase() !== 'not out') || (!name.includes('*') && /\b(?:b|c|lbw|stumped|run out|hit wicket)\b/i.test(rowText))
          });
          if (name.includes('*')) {
            strikerName = playerName;
            strikerBalls = String(balls);
            strikerSixes = String(sixes);
          } else if (i < 2) {
            nonStrikerName = playerName;
          }
        }
      });
    }

    if (bowlerTables.length > 0) {
      const rows = bowlerTables.length > 1 ? bowlerTables[1].querySelectorAll('tbody tr') : bowlerTables[0].querySelectorAll('tbody tr');
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;
        const name = cells[0].innerText.replace('*', '').trim();
        const overs = Number.parseFloat(cells[1].innerText.replace(/[^\d.]/g, '')) || 0;
        const maidens = Number.parseInt(cells[2].innerText.replace(/\D/g, ''), 10) || 0;
        const runsConceded = Number.parseInt(cells[3].innerText.replace(/\D/g, ''), 10) || 0;
        const wicketsTaken = Number.parseInt(cells[4].innerText.replace(/\D/g, ''), 10) || 0;
        const economy = Number.parseFloat(cells[5]?.innerText.replace(/[^\d.]/g, '') || '0') || 0;
        bowlers.push({ name, overs, maidens, runs: runsConceded, wickets: wicketsTaken, economy });
      });
      const bowlerRow = [...rows].find(row => row.querySelector('[class*="active"], [class*="Active"]') || row.querySelector('td')?.innerText.includes('*')) || rows[0];
      const bowlerCell = bowlerRow?.querySelector('td');
      bowlerName = bowlerCell ? bowlerCell.innerText.replace('*', '').trim() : "";
    }

    // Extract the latest live event sentence text
    const latestCommentaryEl = document.querySelector(selectors.latestCommentary);
    const latestEventText = latestCommentaryEl ? latestCommentaryEl.innerText.trim() : "";
    const commentaryDropdown = [...document.querySelectorAll(selectors.fullCommentaryTab)]
      .find(element => /full commentary/i.test(element.innerText));
    const commentaryCandidates = [
      commentaryDropdown?.nextElementSibling,
      commentaryDropdown?.parentElement?.nextElementSibling,
      commentaryDropdown?.parentElement?.parentElement,
    ].filter(Boolean);
    const fullCommentary = commentaryCandidates
      .map(element => element.innerText.trim())
      .sort((left, right) => right.length - left.length)[0]
      ?.slice(-30000) || latestEventText;

    // The Unified Live Package
    const payload = {
      source: "CRICHEROES_SYNC_ADAPTER",
      data: {
        battingTeam,
        bowlingTeam,
        overs: parseFloat(currentOvers || 0),
        runs,
        wickets,
        striker: strikerName,
        ballsFaced: parseInt(strikerBalls || 0),
        sixes: parseInt(strikerSixes || 0),
        nonStriker: nonStrikerName,
        bowler: bowlerName,
        latestTextEvent: latestEventText,
        batsmen,
        bowlers,
        fullCommentary
      }
    };

    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        if (!hasLoggedRelayWarning) {
          console.warn('[CricHeroes Sync] Relay failed:', chrome.runtime.lastError.message);
          hasLoggedRelayWarning = true;
        }
      } else if (!response?.delivered && !hasLoggedRelayWarning) {
        const attempted = response?.failedOrigins?.join(', ') || 'no other web tabs';
        console.warn(`[CricHeroes Sync] No scorer app tab received the feed. Tried: ${attempted}. Confirm the app origin is listed in manifest.json, reload the extension, then reload both tabs.`);
        hasLoggedRelayWarning = true;
      } else if (response?.delivered) {
        hasLoggedRelayWarning = false;
      }
    });
  } catch (error) {
    console.error('[CricHeroes Sync] Could not read CricHeroes page. Check the scraper selectors in app admin.', error);
  }
}

if (/cricheroes\.(com|in)$/i.test(window.location.hostname)) {
  scrapeAndDispatch();
  setInterval(scrapeAndDispatch, 2500);
} else {
  let hasLoggedReceive = false;
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'CRICHEROES_SYNC_CONFIG') return;
    chrome.runtime.sendMessage({ source: 'CRICHEROES_SYNC_CONFIG', data: event.data.data }, (response) => {
      window.postMessage({
        source: 'CRICHEROES_SYNC_CONFIG_RESULT',
        data: { saved: response?.saved === true, error: response?.error },
      }, window.location.origin);
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.source === "CRICHEROES_SYNC_ADAPTER") {
      if (!hasLoggedReceive) {
        window.postMessage({
          source: "CRICHEROES_SYNC_DIAGNOSTIC",
          data: {
            message: "Extension relay reached the app tab",
            sourceUrl: sender.url,
            version: extensionVersion,
            timestamp: Date.now()
          }
        }, window.location.origin);
      }
      window.postMessage(message, window.location.origin);
      if (!hasLoggedReceive) {
        console.info('[CricHeroes Sync] Score feed relayed to app tab:', window.location.origin);
        hasLoggedReceive = true;
      }
      sendResponse({ received: true });
    }
  });
}