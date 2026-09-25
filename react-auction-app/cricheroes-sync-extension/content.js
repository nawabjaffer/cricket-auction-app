let hasLoggedRelayWarning = false;
let extensionContextStopped = false;
let hasLoggedInvalidation = false;
let scrapeTimer = null;
let scorecardSelectionObserver = null;
let scorecardSelectionTimer = null;
let observedSelectionSelector = '';
let lastObservedSelection = '';
let lastRosterSignature = '';
let extensionVersion = 'unknown';
try {
  extensionVersion = chrome.runtime.getManifest().version;
} catch {
  extensionContextStopped = true;
}

function stopForInvalidatedContext(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!/extension context invalidated/i.test(message)) return false;
  extensionContextStopped = true;
  if (scrapeTimer !== null) {
    window.clearInterval(scrapeTimer);
    scrapeTimer = null;
  }
  if (scorecardSelectionObserver) {
    scorecardSelectionObserver.disconnect();
    scorecardSelectionObserver = null;
  }
  if (scorecardSelectionTimer !== null) {
    window.clearTimeout(scorecardSelectionTimer);
    scorecardSelectionTimer = null;
  }
  if (!hasLoggedInvalidation) {
    console.info('[CricHeroes Sync] Extension was reloaded or disabled. Refresh this tab to reconnect.');
    hasLoggedInvalidation = true;
  }
  return true;
}

function isExtensionContextActive() {
  if (extensionContextStopped) return false;
  try {
    if (chrome.runtime.id) return true;
    stopForInvalidatedContext(new Error('Extension context invalidated'));
    return false;
  } catch (error) {
    stopForInvalidatedContext(error);
    return false;
  }
}

const defaultSyncSettings = {
  enabledTabs: ['scorecard', 'commentary', 'teams'],
  selectors: {
    teamContainers: '[class*="scoreWrapper"] [class*="teamScoreDetails"]',
    teamName: '[class*="teamName"]',
    teamActive: '[class*="isActive"]',
    teamOvers: '[class*="overSpan"]',
    batterTable: 'table[class*="table"]',
    bowlerTable: 'table[class*="table"]',
    latestCommentary: '[class*="commentary"], [class*="Commentary"] tr, div[class*="commentaryText"]',
    fullCommentaryTab: '[class*="dropdownSWrapper"]',
    scorecardHead: '[class*="scorecardHead"]',
    scorecardWrapper: '[class*="scorecardWrapper"]',
    teamNameAndScore: '[class*="teamNameAndScore"]',
    scorecardOvers: '[class~="over"]',
    scorecardSelectedTeam: '[class*="selectedText"]',
    teamRosterRoot: '.currentTab',
    teamRosterHeader: 'a[href*="/team-profile/"][href*="/members"]',
    teamRosterCard: '.card',
    teamRosterPlayerLink: 'a[href*="/player-profile/"]',
    teamRosterPlayerName: '.playerName',
    teamRosterPlayerImage: '.playerImage img',
    teamRosterBadges: '[class*="playerBadgeWrapper"] img'
  }
};

console.info(`[CricHeroes Sync] Content script v${extensionVersion} active at ${window.location.origin}`);

function scrapeAndDispatch() {
  if (!isExtensionContextActive()) return;
  try {
    chrome.storage.sync.get({ cricHeroesSyncSettings: defaultSyncSettings }, ({ cricHeroesSyncSettings }) => {
      if (!isExtensionContextActive()) return;
      try {
        const settings = { ...defaultSyncSettings, ...(cricHeroesSyncSettings || {}) };
        settings.selectors = { ...defaultSyncSettings.selectors, ...(settings.selectors || {}) };
        const section = window.location.pathname.split('/').filter(Boolean).at(-1) || 'summary';
        const normalizedSection = section === 'live' ? 'commentary' : section.toLowerCase();
        const isTeamMembersPage = /\/team-profile\/\d+\/[^/]+\/members\/?$/i.test(window.location.pathname);
        const isTeamSection = isTeamMembersPage || normalizedSection === 'teams';
        if (Array.isArray(settings.enabledTabs)
          && !settings.enabledTabs.includes(normalizedSection)
          && !(isTeamSection && settings.enabledTabs.includes('teams'))) return;

        const currentMatchId = window.location.pathname.match(/\/scorecard\/(\d+)/)?.[1];
        const configuredMatchId = settings.matchUrl?.match(/\/scorecard\/(\d+)/)?.[1];
        if (configuredMatchId && currentMatchId && configuredMatchId !== currentMatchId) return;

        if (isTeamSection) {
          scrapeTeamRosters(settings.selectors || defaultSyncSettings.selectors);
          return;
        }
        watchScorecardSelection(settings.selectors || defaultSyncSettings.selectors);
        scrapeConfiguredPage(settings.selectors || defaultSyncSettings.selectors);
      } catch (error) {
        if (!stopForInvalidatedContext(error)) console.warn('[CricHeroes Sync] Could not read sync settings:', error);
      }
    });
  } catch (error) {
    if (!stopForInvalidatedContext(error)) console.warn('[CricHeroes Sync] Could not request sync settings:', error);
  }
}

function scrapeTeamRosters(selectors) {
  try {
    const teams = globalThis.CricHeroesScorecardParser?.captureTeamRosters(document, selectors) || [];
    if (teams.length === 0) return;
    const signature = JSON.stringify(teams.map(team => ({
      teamId: team.teamId,
      teamName: team.teamName,
      players: team.players.map(player => ({ playerId: player.playerId, name: player.name, badges: player.badges })),
    })));
    if (signature === lastRosterSignature) return;
    lastRosterSignature = signature;
    const payload = {
      source: 'CRICHEROES_TEAM_ROSTER',
      data: { teams, capturedAt: Date.now() },
    };
    if (!isExtensionContextActive()) return;
    chrome.runtime.sendMessage(payload, response => {
      if (!isExtensionContextActive()) return;
      if (chrome.runtime.lastError) {
        if (!stopForInvalidatedContext(chrome.runtime.lastError)) console.warn('[CricHeroes Sync] Roster relay failed:', chrome.runtime.lastError.message);
      } else if (!response?.delivered && !hasLoggedRelayWarning) {
        console.warn('[CricHeroes Sync] No scorer app tab received the team roster. Open Scoring Admin and keep the Providers tab available.');
        hasLoggedRelayWarning = true;
      }
    });
  } catch (error) {
    if (!stopForInvalidatedContext(error)) console.warn('[CricHeroes Sync] Could not read team Members page:', error);
  }
}

function watchScorecardSelection(selectors) {
  if (!document.documentElement || typeof MutationObserver === 'undefined') return;
  if (scorecardSelectionObserver && observedSelectionSelector === selectors.scorecardSelectedTeam) return;
  scorecardSelectionObserver?.disconnect();
  observedSelectionSelector = selectors.scorecardSelectedTeam;
  const readSelection = () => document.querySelector(observedSelectionSelector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
  lastObservedSelection = readSelection();
  scorecardSelectionObserver = new MutationObserver(() => {
    const nextSelection = readSelection();
    if (!nextSelection || nextSelection === lastObservedSelection) return;
    lastObservedSelection = nextSelection;
    if (scorecardSelectionTimer !== null) window.clearTimeout(scorecardSelectionTimer);
    scorecardSelectionTimer = window.setTimeout(() => {
      scorecardSelectionTimer = null;
      scrapeAndDispatch();
    }, 150);
  });
  scorecardSelectionObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
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
    const fullCommentaryText = commentaryCandidates
      .map(element => element.innerText.trim())
      .sort((left, right) => right.length - left.length)[0]
      || latestEventText;
    const fullCommentary = fullCommentaryText.length > 60000
      ? `${fullCommentaryText.slice(0, 30000)}\n...commentary truncated...\n${fullCommentaryText.slice(-30000)}`
      : fullCommentaryText;
    const sourceMatchId = window.location.pathname.match(/\/scorecard\/(\d+)/)?.[1] || '';
    const scorecardCapture = globalThis.CricHeroesScorecardParser?.capture(document, selectors);
    const selectedInnings = scorecardCapture?.scorecards.find(card => card.inningsNumber === scorecardCapture.selectedInningsNumber);
    const liveInnings = scorecardCapture?.scorecards.find(card => card.battingTeam.toLocaleLowerCase() === battingTeam.toLocaleLowerCase());
    const normalizedPage = (window.location.pathname.split('/').filter(Boolean).at(-1) || '').toLowerCase();
    const isScorecardSelection = Boolean(selectedInnings && normalizedPage !== 'commentary' && normalizedPage !== 'live');
    if (isScorecardSelection) {
      battingTeam = selectedInnings.battingTeam;
      bowlingTeam = scorecardCapture.scorecards.find(card => card.inningsNumber !== selectedInnings.inningsNumber)?.battingTeam || bowlingTeam;
      runs = selectedInnings.runs ?? runs;
      wickets = selectedInnings.wickets ?? wickets;
      currentOvers = String(selectedInnings.overs ?? currentOvers);
      strikerName = '';
      strikerBalls = '0';
      strikerSixes = '0';
      nonStrikerName = '';
      bowlerName = '';
      batsmen.length = 0;
      bowlers.length = 0;
      for (const batter of selectedInnings.batsmen) {
        if (!batter.statsComplete) continue;
        batsmen.push(batter);
      }
      for (const bowler of selectedInnings.bowlers) {
        if (!bowler.statsComplete) continue;
        bowlers.push(bowler);
      }
    }
    const liveEventText = isScorecardSelection ? '' : latestEventText;

    // The Unified Live Package
    const payload = {
      source: "CRICHEROES_SYNC_ADAPTER",
      data: {
        sourceMatchId,
        inningsNumber: isScorecardSelection ? selectedInnings.inningsNumber : liveInnings?.inningsNumber ?? null,
        scorecardSelection: isScorecardSelection,
        selectedTeam: scorecardCapture?.selectedTeam || '',
        scorecards: scorecardCapture?.scorecards || [],
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
        latestTextEvent: liveEventText,
        batsmen,
        bowlers,
        fullCommentary
      }
    };

    if (!isExtensionContextActive()) return;
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (!isExtensionContextActive()) return;
        try {
          if (chrome.runtime.lastError) {
            if (stopForInvalidatedContext(chrome.runtime.lastError)) return;
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
        } catch (error) {
          if (!stopForInvalidatedContext(error)) console.warn('[CricHeroes Sync] Relay response failed:', error);
        }
      });
    } catch (error) {
      if (!stopForInvalidatedContext(error)) console.warn('[CricHeroes Sync] Could not relay score feed:', error);
    }
  } catch (error) {
    if (!stopForInvalidatedContext(error)) console.error('[CricHeroes Sync] Could not read CricHeroes page. Check the scraper selectors in app admin.', error);
  }
}

if (/cricheroes\.(com|in)$/i.test(window.location.hostname)) {
  scrapeAndDispatch();
  if (isExtensionContextActive()) scrapeTimer = window.setInterval(scrapeAndDispatch, 2500);
} else {
  let hasLoggedReceive = false;
  window.addEventListener('message', (event) => {
    if (event.data?.source === 'CRICHEROES_SYNC_BRIDGE_PING') {
      window.postMessage({
        source: 'CRICHEROES_SYNC_BRIDGE_READY',
        data: { version: extensionVersion },
      }, window.location.origin);
      return;
    }
    if (event.data?.source !== 'CRICHEROES_SYNC_CONFIG') return;
    if (!isExtensionContextActive()) return;
    try {
      chrome.runtime.sendMessage({ source: 'CRICHEROES_SYNC_CONFIG', data: event.data.data }, (response) => {
        if (!isExtensionContextActive()) return;
        try {
          window.postMessage({
            source: 'CRICHEROES_SYNC_CONFIG_RESULT',
            data: { saved: response?.saved === true, error: response?.error },
          }, window.location.origin);
        } catch (error) {
          stopForInvalidatedContext(error);
        }
      });
    } catch (error) {
      stopForInvalidatedContext(error);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.source === "CRICHEROES_SYNC_ADAPTER" || message?.source === "CRICHEROES_TEAM_ROSTER") {
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
        console.info(`[CricHeroes Sync] ${message.source === 'CRICHEROES_TEAM_ROSTER' ? 'Team roster' : 'Score feed'} relayed to app tab:`, window.location.origin);
        hasLoggedReceive = true;
      }
      sendResponse({ received: true });
    }
  });
}