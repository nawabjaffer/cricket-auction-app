import { describe, expect, it } from 'vitest';
import parserSource from '../../cricheroes-sync-extension/scorecard-parser.js?raw';

const parser = new Function('globalThis', `${parserSource}; return globalThis.CricHeroesScorecardParser;`)(globalThis) as {
  captureTeamRosters: (document: Document, selectors?: Record<string, string>) => Array<{
    teamId: string;
    teamName: string;
    logoUrl: string;
    players: Array<{ playerId: string; name: string; imageUrl: string; badges: string[] }>;
  }>;
  capture: (document: Document, selectors: Record<string, string>) => {
    selectedTeam: string;
    selectedInningsNumber: number | null;
    scorecards: Array<{ inningsNumber: number; battingTeam: string; runs: number | null; wickets: number | null; overs: number | null; extras: number | null; extrasBreakdown: { wides: number | null }; yetToBat: string; statsComplete: boolean }>;
  };
};

const selectors = {
  scorecardHead: '[class*="scorecardHead"]',
  scorecardWrapper: '[class*="scorecardWrapper"]',
  teamNameAndScore: '[class*="teamNameAndScore"]',
  scorecardOvers: '[class~="over"]',
  scorecardSelectedTeam: '[class*="selectedText"]',
};

describe('CricHeroes whole-scorecard capture', () => {
  it('pairs both innings by scorecard order and selects the team named in the dropdown', () => {
    document.body.innerHTML = `
      <div class="dropdown"><span class="selectedText">SULTHAN STRIKERS</span></div>
      <section class="scorecardHead"><span class="teamNameAndScore">SULTHAN STRIKERS 37/7</span><span class="over">5.0 ov</span></section>
      <div class="scorecardWrapper">
        <table><thead><tr><th>Batters</th><th>Batters</th><th></th><th>R</th><th>R(B)</th><th>B</th><th>4s</th><th>6s</th><th>SR</th><th>Min</th></tr></thead>
          <tbody><tr><td><a class="playerLink">Sujith TSK *</a></td><td>Sujith TSK</td><td>c Rahul b Shanavas</td><td><canvas data-value="6"></canvas></td><td><canvas data-value="6"></canvas></td><td>2</td><td>0</td><td>2</td><td>300.00</td><td>5</td></tr>
            <tr><td>Extras</td><td>Extras</td><td>(wd 1)</td><td>1</td><td>1</td></tr></tbody>
        </table>
        <table><thead><tr><th>Bowlers</th><th>O</th><th>M</th><th>R</th><th>W</th><th>0s</th><th>4s</th><th>6s</th><th>WD</th><th>NB</th><th>Eco</th></tr></thead>
          <tbody><tr><td><a class="playerLink">Nisam Nisam</a></td><td>1</td><td>0</td><td><canvas data-value="9"></canvas></td><td>2</td><td>3</td><td>0</td><td>1</td><td>0</td><td>0</td><td>9.00</td></tr></tbody>
        </table>
        <div class="extraInfo"><span class="title">Yet to Bat:</span>Vishnu A S</div>
        <div class="extraInfo"><span class="title">Fall Of Wickets:</span>3-1 (Noufal K, 0.3 ov)</div>
      </div>
      <section class="scorecardHead"><span class="teamNameAndScore">JUNGLEE BOYZZ 40/2</span><span class="over">4.0 ov</span></section>
      <div class="scorecardWrapper"><table><thead><tr><th>Batters</th><th>R</th></tr></thead><tbody></tbody></table></div>`;

    const result = parser.capture(document, selectors);

    expect(result.selectedTeam).toBe('SULTHAN STRIKERS');
    expect(result.selectedInningsNumber).toBe(1);
    expect(result.scorecards.map(card => [card.battingTeam, card.runs, card.wickets, card.overs])).toEqual([
      ['SULTHAN STRIKERS', 37, 7, 5],
      ['JUNGLEE BOYZZ', 40, 2, 4],
    ]);
    expect(result.scorecards[0].extras).toBe(1);
    expect(result.scorecards[0].extrasBreakdown.wides).toBe(1);
    expect(result.scorecards[0].yetToBat).toContain('Vishnu A S');
  });

  it('does not report blank canvas-backed statistics as zero', () => {
    const cell = document.createElement('td');
    cell.innerHTML = '<canvas class="numberCanvas"></canvas>';

    expect(parser.capture(document, selectors)).toBeDefined();
    expect((parser as unknown as { readNumber: (cell: Element) => number | null }).readNumber(cell)).toBeNull();
  });

  it('associates a single detailed wrapper with the selected innings but keeps both score totals', () => {
    document.body.innerHTML = `
      <span class="selectedText">JUNGLEE BOYZZ</span>
      <section class="scorecardHead"><span class="teamNameAndScore">SULTHAN STRIKERS 37/7</span><span class="over">5.0</span></section>
      <section class="scorecardHead"><span class="teamNameAndScore">JUNGLEE BOYZZ 40/2</span><span class="over">4.0</span></section>
      <div class="scorecardWrapper"><table><thead><tr><th>Batters</th></tr></thead><tbody></tbody></table><table><thead><tr><th>Bowlers</th></tr></thead><tbody></tbody></table></div>`;

    const result = parser.capture(document, selectors);

    expect(result.scorecards.map(card => [card.inningsNumber, card.runs, card.wickets])).toEqual([[1, 37, 7], [2, 40, 2]]);
    expect(result.selectedInningsNumber).toBe(2);
    expect(result.scorecards[0].statsComplete).toBe(false);
    expect(result.scorecards[1].statsComplete).toBe(true);
  });

  it('captures team roster IDs, player names, images, and squad badges from Members cards', () => {
    document.body.innerHTML = `
      <div class="currentTab">
        <div class="card">
          <a href="/team-profile/14627351/strikers-x1/members"><img src="team-logo.png">STRIKERS X1</a>
          <div class="playerCardWrapper">
            <a href="/player-profile/53976044/nishad-udyawara/matches">
              <div class="playerImage"><img src="player.png"></div>
              <div class="playerName">Nishad Udyawara</div>
              <div class="playerBadgeWrapper"><img alt="captain" src="captain.svg"></div>
              <div class="playerBadgeWrapper"><img alt="playing-squad" src="playing-squad.svg"></div>
            </a>
          </div>
        </div>
      </div>`;

    const rosters = parser.captureTeamRosters(document);

    expect(rosters).toHaveLength(1);
    expect(rosters[0]).toMatchObject({ teamId: '14627351', teamName: 'STRIKERS X1', logoUrl: 'team-logo.png' });
    expect(rosters[0].players[0]).toMatchObject({
      playerId: '53976044',
      name: 'Nishad Udyawara',
      imageUrl: 'player.png',
      badges: ['captain', 'playing-squad'],
    });
  });
});