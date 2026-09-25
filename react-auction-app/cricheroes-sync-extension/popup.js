const tabs = [
  ['summary', 'Summary'],
  ['scorecard', 'Scorecard'],
  ['commentary', 'Commentary'],
  ['analysis', 'Analysis'],
  ['cricheroes', 'Heroes'],
  ['mvp', 'MVP'],
  ['teams', 'Teams'],
  ['gallery', 'Gallery'],
];

const tabsRoot = document.getElementById('tab-options');
const urlInput = document.getElementById('match-url');
const status = document.getElementById('status');

function saveSyncSettings(matchUrl, enabledTabs, callback) {
  chrome.storage.sync.get({ cricHeroesSyncSettings: {} }, ({ cricHeroesSyncSettings }) => {
    chrome.storage.sync.set({
      cricHeroesSyncSettings: {
        ...(cricHeroesSyncSettings || {}),
        matchUrl,
        enabledTabs,
      },
    }, callback);
  });
}

for (const [value, label] of tabs) {
  const wrapper = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = value;
  checkbox.checked = value === 'scorecard' || value === 'commentary' || value === 'teams';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(checkbox, text);
  tabsRoot.append(wrapper);
}

chrome.storage.sync.get({ cricHeroesSyncSettings: {} }, ({ cricHeroesSyncSettings }) => {
  const settings = cricHeroesSyncSettings || {};
  if (settings.matchUrl) urlInput.value = settings.matchUrl;
  if (Array.isArray(settings.enabledTabs)) {
    tabsRoot.querySelectorAll('input').forEach(input => {
      input.checked = settings.enabledTabs.includes(input.value);
    });
  }
});

document.getElementById('save').addEventListener('click', () => {
  const enabledTabs = [...tabsRoot.querySelectorAll('input:checked')].map(input => input.value);
  const matchUrl = urlInput.value.trim();
  if (enabledTabs.length === 0) {
    status.textContent = 'Select at least one tab to read.';
    return;
  }
  if (matchUrl && !/^https:\/\/(www\.)?cricheroes\.(com|in)\//i.test(matchUrl)) {
    status.textContent = 'Enter a valid CricHeroes scorecard URL.';
    return;
  }
  saveSyncSettings(matchUrl, enabledTabs, () => {
    status.textContent = 'Sync settings saved.';
  });
});

document.getElementById('open-match').addEventListener('click', () => {
  const matchUrl = urlInput.value.trim();
  if (!/^https:\/\/(www\.)?cricheroes\.(com|in)\//i.test(matchUrl)) {
    status.textContent = 'Enter a valid CricHeroes scorecard URL first.';
    return;
  }
  saveSyncSettings(matchUrl, [...tabsRoot.querySelectorAll('input:checked')].map(input => input.value), () => {
    chrome.tabs.create({ url: matchUrl });
  });
});