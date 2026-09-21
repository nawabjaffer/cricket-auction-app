import { describe, it, expect } from 'vitest';
import { resolveWidgetKind, resolveWidgetContent } from '../utils/scorecardDataBinding';
import type { ScorecardDataContext } from '../utils/scorecardDataBinding';
import {
  createEmptyLayout, createWidgetInstance, makeWidgetId,
  SPORT_WIDGET_CATALOG, DEFAULT_WIDGET_STYLE,
} from '../types/scorecardDesigner';
import type { ScorecardWidgetInstance } from '../types/scorecardDesigner';

function baseWidget(overrides: Partial<ScorecardWidgetInstance> = {}): ScorecardWidgetInstance {
  return {
    id: makeWidgetId(),
    kind: 'custom_text',
    label: 'Test',
    geometry: { xPct: 0, yPct: 0, wPct: 10, hPct: 10, rotationDeg: 0, zIndex: 1 },
    style: { ...DEFAULT_WIDGET_STYLE },
    visible: true,
    locked: false,
    ...overrides,
  };
}

describe('scorecard widget catalog', () => {
  it('only exposes sport-relevant widgets per catalog', () => {
    expect(SPORT_WIDGET_CATALOG.cricket.some(w => w.kind === 'cricket_score')).toBe(true);
    expect(SPORT_WIDGET_CATALOG.cricket.some(w => w.kind === 'football_score')).toBe(false);
    expect(SPORT_WIDGET_CATALOG.football.some(w => w.kind === 'football_score')).toBe(true);
    expect(SPORT_WIDGET_CATALOG.football.some(w => w.kind === 'kabaddi_raid_clock')).toBe(false);
    expect(SPORT_WIDGET_CATALOG.kabaddi.some(w => w.kind === 'kabaddi_raid_clock')).toBe(true);
  });

  it('includes universal widgets across every sport', () => {
    for (const sport of ['cricket', 'football', 'kabaddi'] as const) {
      expect(SPORT_WIDGET_CATALOG[sport].some(w => w.kind === 'team_a_logo')).toBe(true);
      expect(SPORT_WIDGET_CATALOG[sport].some(w => w.kind === 'custom_text')).toBe(true);
    }
  });

  it('creates a widget instance positioned at the drop point', () => {
    const entry = SPORT_WIDGET_CATALOG.cricket.find(w => w.kind === 'cricket_score')!;
    const instance = createWidgetInstance(entry, 30, 40);
    expect(instance.kind).toBe('cricket_score');
    expect(instance.geometry.xPct).toBe(30);
    expect(instance.geometry.yPct).toBe(40);
    expect(instance.geometry.wPct).toBe(entry.defaultW);
  });

  it('creates an empty layout scoped to a sport', () => {
    const layout = createEmptyLayout('kabaddi', 'My Layout');
    expect(layout.sport).toBe('kabaddi');
    expect(layout.widgets).toEqual([]);
    expect(layout.name).toBe('My Layout');
  });
});

describe('scorecard data binding — cricket', () => {
  const ctx: ScorecardDataContext = {
    sport: 'cricket',
    match: { id: 'm1', teamA: { id: 'a', name: 'Alpha' }, teamB: { id: 'b', name: 'Bravo' }, venue: 'Oval', date: '', maxOvers: 20, status: 'live', createdAt: 0, updatedAt: 0 },
    live: {
      matchId: 'm1', currentInnings: 1, battingTeamId: 'a', bowlingTeamId: 'b',
      runs: 120, wickets: 3, overs: 15.4, runRate: 7.65,
      currentBatsmen: [
        { playerId: 'p1', playerName: 'Striker One', runs: 40, balls: 30, fours: 3, sixes: 1, strikeRate: 133.3, isOnStrike: true },
        { playerId: 'p2', playerName: 'Partner Two', runs: 10, balls: 12, fours: 1, sixes: 0, strikeRate: 83.3, isOnStrike: false },
      ],
      currentBowler: { playerId: 'p3', playerName: 'Bowler Three', overs: 3, maidens: 0, runs: 22, wickets: 1, economy: 7.33, dots: 6 },
      lastBall: '4', lastBallRuns: 4, currentOverBalls: ['1', '4'], recentOvers: ['8'],
      partnership: { runs: 20, balls: 18 }, lastUpdated: 0,
      isPowerplay: false, powerplayOvers: 6, isFreehit: false,
    },
  };

  it('resolves score, overs and run rate', () => {
    expect(resolveWidgetKind('cricket_score', ctx).text).toBe('120/3');
    expect(resolveWidgetKind('cricket_overs', ctx).text).toBe('15.4 ov');
    expect(resolveWidgetKind('cricket_run_rate', ctx).text).toBe('RR 7.65');
  });

  it('resolves striker/non-striker/bowler cards', () => {
    expect(resolveWidgetKind('cricket_striker', ctx).text).toContain('Striker One');
    expect(resolveWidgetKind('cricket_non_striker', ctx).text).toContain('Partner Two');
    expect(resolveWidgetKind('cricket_bowler', ctx).text).toContain('Bowler Three');
  });

  it('resolves team names and logos from match setup', () => {
    expect(resolveWidgetKind('team_a_name', ctx).text).toBe('Alpha');
    expect(resolveWidgetKind('team_b_name', ctx).text).toBe('Bravo');
    expect(resolveWidgetKind('team_a_logo', ctx).hidden).toBe(true); // no logoUrl set
  });

  it('hides the target widget when there is no chase target', () => {
    expect(resolveWidgetKind('cricket_target', ctx).hidden).toBe(true);
  });
});

describe('scorecard data binding — football & kabaddi', () => {
  it('resolves football score and half label', () => {
    const ctx: ScorecardDataContext = {
      sport: 'football',
      match: { id: 'm', teamA: { id: 'a', name: 'Home', shortName: 'HOM' }, teamB: { id: 'b', name: 'Away', shortName: 'AWY' }, venue: 'Park', date: '', halfDurationMin: 45, status: 'live', createdAt: 0, updatedAt: 0 },
      live: { matchId: 'm', homeScore: 2, awayScore: 1, half: 'second_half', running: true, clockStartedAt: Date.now(), baseElapsedSec: 3000, addedTimeMin: 0, events: [], lastUpdated: 0 },
    };
    expect(resolveWidgetKind('football_score', ctx).text).toBe('2 - 1');
    expect(resolveWidgetKind('football_half_label', ctx).text).toBe('2nd Half');
  });

  it('resolves kabaddi score and do-or-die flag', () => {
    const ctx: ScorecardDataContext = {
      sport: 'kabaddi',
      match: { id: 'm', teamA: { id: 'a', name: 'Home', shortName: 'HOM' }, teamB: { id: 'b', name: 'Away', shortName: 'AWY' }, venue: 'Arena', date: '', halfDurationMin: 20, status: 'live', createdAt: 0, updatedAt: 0 },
      live: {
        matchId: 'm', teamAId: 'a', teamBId: 'b',
        teamA: { score: 20, playersOnCourt: 5, consecutiveEmptyRaids: 0, allOutsConceded: 0, allOutsInflicted: 0, totalRaidPoints: 10, totalTacklePoints: 5, totalBonusPoints: 1 },
        teamB: { score: 15, playersOnCourt: 6, consecutiveEmptyRaids: 0, allOutsConceded: 0, allOutsInflicted: 0, totalRaidPoints: 8, totalTacklePoints: 4, totalBonusPoints: 0 },
        half: 'first_half', running: true, clockStartedAt: Date.now(), baseElapsedSec: 0,
        raidingTeamId: 'a', raidNumber: 5, raidClockStartedAt: 0, isDoOrDie: true, events: [], lastUpdated: 0,
      },
    };
    expect(resolveWidgetKind('kabaddi_score', ctx).text).toBe('20 - 15');
    expect(resolveWidgetKind('kabaddi_do_or_die_flag', ctx).text).toBe('DO OR DIE');
    expect(resolveWidgetKind('kabaddi_players_on_mat', ctx).text).toBe('5 - 6');
  });
});

describe('resolveWidgetContent — custom widget overrides', () => {
  const ctx: ScorecardDataContext = { sport: 'cricket', match: null, live: null };

  it('renders static text for custom_text widgets', () => {
    const widget = baseWidget({ kind: 'custom_text', staticText: 'Sponsored by Acme' });
    expect(resolveWidgetContent(widget, ctx).text).toBe('Sponsored by Acme');
  });

  it('renders static image for custom_image widgets', () => {
    const widget = baseWidget({ kind: 'custom_image', staticImageUrl: 'https://example.com/logo.png' });
    expect(resolveWidgetContent(widget, ctx).imageUrl).toBe('https://example.com/logo.png');
  });

  it('hides custom_image widgets with no image set', () => {
    const widget = baseWidget({ kind: 'custom_image' });
    expect(resolveWidgetContent(widget, ctx).hidden).toBe(true);
  });
});
