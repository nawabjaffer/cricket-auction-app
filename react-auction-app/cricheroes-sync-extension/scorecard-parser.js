(() => {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();

  const numericValue = value => {
    const match = normalize(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

  function readNumber(cell) {
    const direct = numericValue(cell?.innerText || cell?.textContent);
    if (direct !== null) return direct;

    const elements = [cell, ...(cell?.querySelectorAll?.('*') || [])].filter(Boolean);
    for (const element of elements) {
      for (const attribute of ['data-value', 'aria-label', 'title', 'value']) {
        const value = numericValue(element.getAttribute?.(attribute));
        if (value !== null) return value;
      }
      for (const key of Object.keys(element)) {
        if (!key.startsWith('__reactProps$') && !key.startsWith('__reactFiber$')) continue;
        const reactData = element[key]?.memoizedProps || element[key];
        if (!reactData || typeof reactData !== 'object') continue;
        for (const prop of ['value', 'text', 'number', 'score', 'runs']) {
          const value = numericValue(reactData[prop]);
          if (value !== null) return value;
        }
      }
    }
    return null;
  }

  function columnIndex(headers, pattern, fallback) {
    const index = headers.findIndex(header => pattern.test(header));
    return index >= 0 ? index : fallback;
  }

  function readBatters(table) {
    const headers = [...table.querySelectorAll('thead th')].map(cell => normalize(cell.innerText || cell.textContent).toLowerCase());
    const columns = {
      runs: columnIndex(headers, /^r$/, 3),
      balls: columnIndex(headers, /^b$/, 5),
      fours: columnIndex(headers, /^4s$/, 6),
      sixes: columnIndex(headers, /^6s$/, 7),
      strikeRate: columnIndex(headers, /^sr$/, 8),
    };
    return [...table.querySelectorAll('tbody tr')].flatMap(row => {
      const link = row.querySelector('a.playerLink');
      if (!link) return [];
      const cells = [...row.querySelectorAll('td')];
      const name = normalize(link.innerText || link.textContent).replace(/\s*\(c\)\s*$/i, '').replace(/\*/g, '');
      if (!name) return [];
      const dismissal = normalize(cells[2]?.innerText || cells[2]?.textContent);
      const values = Object.fromEntries(Object.entries(columns).map(([key, index]) => [key, readNumber(cells[index])]));
      return [{
        name,
        runs: values.runs,
        balls: values.balls,
        fours: values.fours,
        sixes: values.sixes,
        strikeRate: values.strikeRate,
        dismissal,
        isStriker: /\*/.test(normalize(cells[0]?.innerText || cells[0]?.textContent)),
        isOut: Boolean(dismissal && !/^not out$/i.test(dismissal)),
        statsComplete: Object.values(values).every(value => value !== null),
      }];
    });
  }

  function readBowlers(table) {
    const headers = [...table.querySelectorAll('thead th')].map(cell => normalize(cell.innerText || cell.textContent).toLowerCase());
    const columns = {
      overs: columnIndex(headers, /^o$/, 1),
      maidens: columnIndex(headers, /^m$/, 2),
      runs: columnIndex(headers, /^r$/, 3),
      wickets: columnIndex(headers, /^w$/, 4),
      dots: columnIndex(headers, /^0s$/, 5),
      wides: columnIndex(headers, /^wd$/, 8),
      noBalls: columnIndex(headers, /^nb$/, 9),
      economy: columnIndex(headers, /^eco$/, 10),
    };
    return [...table.querySelectorAll('tbody tr')].flatMap(row => {
      const cells = [...row.querySelectorAll('td')];
      const name = normalize(cells[0]?.querySelector('a.playerLink')?.textContent || cells[0]?.innerText || cells[0]?.textContent);
      if (!name || /^bowlers?$/i.test(name)) return [];
      const values = Object.fromEntries(Object.entries(columns).map(([key, index]) => [key, readNumber(cells[index])]));
      return [{
        name: name.replace(/\*/g, ''),
        ...values,
        statsComplete: Object.values(values).every(value => value !== null),
      }];
    });
  }

  function capture(document, selectors) {
    const heads = [...document.querySelectorAll(selectors.scorecardHead)];
    const wrappers = [...document.querySelectorAll(selectors.scorecardWrapper)];
    const dropdownText = normalize(document.querySelector(selectors.scorecardSelectedTeam)?.textContent);
    const selectedHeadIndex = heads.findIndex(head => normalize(head.querySelector(selectors.teamNameAndScore)?.textContent || head.textContent)
      .toLocaleLowerCase().includes(dropdownText.toLocaleLowerCase()));
    const activeHeadIndex = heads.findIndex(head => head.querySelector('[class*="isActive"], [aria-current="true"]'));
    const detailedHeadIndex = selectedHeadIndex >= 0 ? selectedHeadIndex : activeHeadIndex >= 0 ? activeHeadIndex : 0;
    const scorecards = heads.flatMap((head, index) => {
      const wrapper = wrappers.length >= heads.length
        ? wrappers[index]
        : wrappers.length === 1
          ? (index === detailedHeadIndex ? wrappers[0] : null)
          : wrappers[index] || (index === detailedHeadIndex ? wrappers.at(-1) : null);
      const header = normalize(head.querySelector(selectors.teamNameAndScore)?.textContent || head.textContent);
      const scoreMatch = header.match(/(\d+)\s*[-/]\s*(\d+)/);
      const battingTeam = normalize(scoreMatch ? header.slice(0, scoreMatch.index) : header);
      if (!battingTeam) return [];
      const overText = normalize(head.querySelector(selectors.scorecardOvers)?.textContent);
      const overs = numericValue(overText);
      const tables = [...(wrapper?.querySelectorAll('table') || [])];
      const battingTable = tables.find(table => [...table.querySelectorAll('thead th')].some(cell => /batters?/i.test(normalize(cell.textContent))));
      const bowlingTable = tables.find(table => [...table.querySelectorAll('thead th')].some(cell => /bowlers?/i.test(normalize(cell.textContent))));
      const batsmen = battingTable ? readBatters(battingTable) : [];
      const bowlers = bowlingTable ? readBowlers(bowlingTable) : [];
      const extrasRow = battingTable && [...battingTable.querySelectorAll('tbody tr')].find(row => /^extras$/i.test(normalize(row.querySelector('td')?.textContent)));
      const extraCells = extrasRow ? [...extrasRow.querySelectorAll('td')] : [];
      const extrasText = normalize(extraCells[2]?.textContent);
      const extraAmount = type => {
        const match = extrasText.match(new RegExp(`\\b${type}\\s*(\\d+)`, 'i'));
        return match ? Number(match[1]) : null;
      };
      const extras = extrasRow ? readNumber(extraCells[3]) ?? readNumber(extraCells[4]) : null;
      const extraInfo = [...(wrapper?.querySelectorAll('[class*="extraInfo"]') || [])];
      return [{
        inningsNumber: index + 1,
        battingTeam,
        runs: scoreMatch ? Number(scoreMatch[1]) : null,
        wickets: scoreMatch ? Number(scoreMatch[2]) : null,
        overs,
        batsmen,
        bowlers,
        extras,
        extrasBreakdown: {
          wides: extraAmount('wd'),
          noBalls: extraAmount('nb'),
          byes: extraAmount('b'),
          legByes: extraAmount('lb'),
        },
        yetToBat: normalize(extraInfo.map(element => element.textContent).find(text => /yet to bat/i.test(text))),
        fallOfWickets: normalize(extraInfo.map(element => element.textContent).find(text => /fall of wickets/i.test(text))),
        selected: dropdownText.toLocaleLowerCase().includes(battingTeam.toLocaleLowerCase()),
        statsComplete: Boolean(battingTable && bowlingTable)
          && batsmen.every(player => player.statsComplete)
          && bowlers.every(player => player.statsComplete),
      }];
    });

    let selected = scorecards.find(scorecard => scorecard.selected);
    if (!selected) {
      if (activeHeadIndex >= 0) selected = scorecards.find(scorecard => scorecard.inningsNumber === activeHeadIndex + 1);
    }
    return { selectedTeam: dropdownText, selectedInningsNumber: selected?.inningsNumber ?? null, scorecards };
  }

  function captureTeamRosters(document, selectors = {}) {
    const root = document.querySelector(selectors.teamRosterRoot || '.currentTab') || document;
    const teamLinks = [...root.querySelectorAll(selectors.teamRosterHeader || 'a[href*="/team-profile/"][href*="/members"]')];
    return teamLinks.flatMap(teamLink => {
      const profileUrl = teamLink.getAttribute('href') || '';
      const teamId = profileUrl.match(/\/team-profile\/(\d+)/)?.[1];
      const teamName = normalize(teamLink.textContent);
      if (!teamId || !teamName) return [];
      const teamCard = teamLink.closest(selectors.teamRosterCard || '.card') || teamLink.parentElement?.parentElement;
      const players = [...(teamCard?.querySelectorAll(selectors.teamRosterPlayerLink || 'a[href*="/player-profile/"]') || [])]
        .flatMap(playerLink => {
          const playerProfileUrl = playerLink.getAttribute('href') || '';
          const playerId = playerProfileUrl.match(/\/player-profile\/(\d+)/)?.[1];
          const name = normalize(playerLink.querySelector(selectors.teamRosterPlayerName || '.playerName')?.textContent || playerLink.textContent);
          if (!playerId || !name) return [];
          const image = playerLink.querySelector(selectors.teamRosterPlayerImage || '.playerImage img');
          const badges = [...playerLink.querySelectorAll(selectors.teamRosterBadges || '[class*="playerBadgeWrapper"] img')]
            .map(badge => normalize(badge.getAttribute('alt') || badge.getAttribute('src')?.split('/').at(-1)?.split('.')[0]))
            .filter(Boolean);
          return [{
            playerId,
            name,
            profileUrl: playerProfileUrl,
            imageUrl: image?.getAttribute('src') || '',
            badges,
          }];
        });
      const logoUrl = teamLink.querySelector('img')?.getAttribute('src') || '';
      return [{ teamId, teamName, profileUrl, logoUrl, players }];
    });
  }

  globalThis.CricHeroesScorecardParser = { capture, captureTeamRosters, readNumber };
})();