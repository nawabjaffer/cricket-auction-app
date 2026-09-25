let hasLoggedDelivery = false;
let hasLoggedNoReceiver = false;
console.info(`[CricHeroes Sync] Service worker v${chrome.runtime.getManifest().version} started`);
const appHosts = new Set([
  'localhost',
  '127.0.0.1',
  'e-auction-store.web.app',
  'e-auction-store.firebaseapp.com'
]);

async function deliverToAppTab(tab, message) {
  const origin = new URL(tab.url).origin;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    if (response?.received) return { origin, delivered: true };
  } catch { /* Inject the receiver if this app tab missed the static content script. */ }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const response = await chrome.tabs.sendMessage(tab.id, message);
    return { origin, delivered: response?.received === true };
  } catch (error) {
    return { origin, delivered: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source === 'CRICHEROES_SYNC_CONFIG' && message.data && sender.tab?.id) {
    chrome.storage.sync.get({ cricHeroesSyncSettings: {} }, ({ cricHeroesSyncSettings }) => {
      const current = cricHeroesSyncSettings || {};
      chrome.storage.sync.set({
        cricHeroesSyncSettings: {
          ...current,
          selectors: { ...(current.selectors || {}), ...(message.data.selectors || {}) },
        },
      }, () => sendResponse({ saved: !chrome.runtime.lastError, error: chrome.runtime.lastError?.message }));
    });
    return true;
  }

  if (!['CRICHEROES_SYNC_ADAPTER', 'CRICHEROES_TEAM_ROSTER'].includes(message?.source) || !message.data || !sender.tab?.id) return;

  chrome.tabs.query({}, (tabs) => {
    const targets = tabs.filter((tab) => {
      if (tab.id === sender.tab.id || tab.id === undefined || !tab.url) return false;
      try { return appHosts.has(new URL(tab.url).hostname); } catch { return false; }
    });

    Promise.all(targets.map((tab) => deliverToAppTab(tab, message))).then((results) => {
      const deliveredOrigins = [...new Set(results.filter((result) => result.delivered).map((result) => result.origin))];
      const failedOrigins = [...new Set(results.filter((result) => !result.delivered).map((result) =>
        `${result.origin}${result.error ? ` (${result.error})` : ''}`
      ))];
      const delivered = deliveredOrigins.length;
      if (delivered > 0 && !hasLoggedDelivery) {
        console.info(`[CricHeroes Sync] Feed delivered to: ${deliveredOrigins.join(', ')}.`);
        hasLoggedDelivery = true;
      } else if (delivered === 0 && !hasLoggedNoReceiver) {
        console.warn(`[CricHeroes Sync] No receiving app tab acknowledged ${message.source === 'CRICHEROES_TEAM_ROSTER' ? 'the team roster' : 'the score feed'}. Tried: ${failedOrigins.join(', ') || 'no supported scorer app tab is open'}. Add the scorer origin to appHosts and content_scripts.matches in manifest.json, then reload the extension.`);
        hasLoggedNoReceiver = true;
      }
      sendResponse({ delivered, deliveredOrigins, failedOrigins });
    });

  });
  return true;
});