import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CARROM_OVERLAY_CONFIG, DEFAULT_CARROM_RULES, EMPTY_STROKE, applyCarromStroke, awardCarromBoard, startCarromMatch,
  type CarromMatchSetup,
} from '../types/carrom';
import { teamScoreboard, type TeamBroadcastState } from '../utils/teamScoreboard';
import { createTeamBroadcastState, isTeamSport, teamLayoutContext } from '../utils/teamBroadcastSource';
import { buildDockEvent, resolveDockSide, CARROM_DOCK_TRIGGERS } from '../utils/carromDock';
import { isWebRtcSource } from '../services/camera/multiCamService';

const NOW = 1_700_000_000_000;

const match: CarromMatchSetup = {
  id: 'm1',
  teamA: { id: 'a', name: 'Asha Rao', shortName: 'ASH' },
  teamB: { id: 'b', name: 'Bilal Khan', shortName: 'BIL', photoUrl: 'https://example.com/bilal.png' },
  date: '2026-10-14',
  status: 'live',
  stage: 'Semifinal',
  createdAt: NOW,
  updatedAt: NOW,
};

function carromState(live: ReturnType<typeof startCarromMatch> | null): Extract<TeamBroadcastState, { sport: 'carrom' }> {
  const base = createTeamBroadcastState('carrom');
  if (base.sport !== 'carrom') throw new Error('expected carrom state');
  return { ...base, match, live };
}

describe('team broadcast state', () => {
  it('recognises the team sports that share the camera pipeline', () => {
    expect(isTeamSport('football')).toBe(true);
    expect(isTeamSport('kabaddi')).toBe(true);
    expect(isTeamSport('carrom')).toBe(true);
    expect(isTeamSport('cricket')).toBe(false);
  });

  it('seeds carrom with the default rules and overlay theme', () => {
    const state = createTeamBroadcastState('carrom');
    expect(state.sport).toBe('carrom');
    expect(state.config).toEqual(DEFAULT_CARROM_OVERLAY_CONFIG);
    expect(state.sport === 'carrom' && state.rules).toEqual(DEFAULT_CARROM_RULES);
  });

  it('binds the designer data context to carrom match, live state and celebrations', () => {
    const live = startCarromMatch('m1', 'A', NOW);
    const overlay = { activeOverlay: 'queen_covered' as const, lastUpdated: NOW };
    const ctx = teamLayoutContext({ ...carromState(live), overlay });
    expect(ctx.sport).toBe('carrom');
    if (ctx.sport !== 'carrom') return;
    expect(ctx.match?.id).toBe('m1');
    expect(ctx.overlay).toEqual(overlay);
    expect(ctx.rules).toEqual(DEFAULT_CARROM_RULES);
  });
});

describe('carrom camera ticker scoreboard', () => {
  it('returns nothing until the match has live state', () => {
    expect(teamScoreboard(carromState(null))).toBeNull();
  });

  it('shows game score, board, games won and the stroke clock while in play', () => {
    const live = startCarromMatch('m1', 'A', Date.now());
    const board = teamScoreboard(carromState(live));
    expect(board).not.toBeNull();
    expect(board?.homeScore).toBe(0);
    expect(board?.awayScore).toBe(0);
    expect(board?.phase).toBe('Game 1 · Board 1');
    expect(board?.isLive).toBe(true);
    expect(board?.showClock).toBe(true);
    expect(board?.clock).toMatch(/^\d+s$/);
    expect(board?.details).toContain('Games 0–0');
    expect(board?.details).toContain('Queen on board');
    expect(board?.details).toContain('Coins W 9 · B 9');
    expect(board?.caption).toBe('Semifinal');
    expect(board?.away.logoUrl).toBe('https://example.com/bilal.png');
  });

  it('tracks coins left and credits points after a board is awarded', () => {
    let live = startCarromMatch('m1', 'A', NOW);
    live = applyCarromStroke(live, { ...EMPTY_STROKE, ownPocketed: 3 }, DEFAULT_CARROM_RULES, NOW).live;
    let board = teamScoreboard(carromState(live));
    expect(board?.details).toContain('Coins W 6 · B 9');

    live = awardCarromBoard(live, 'A', 4, false, DEFAULT_CARROM_RULES, NOW).live;
    board = teamScoreboard(carromState(live));
    expect(board?.homeScore).toBe(4);
    expect(board?.phase).toBe('Game 1 · Board 2');
  });

  it('hides the stroke clock once the match is over', () => {
    const live = { ...startCarromMatch('m1', 'A', NOW), phase: 'completed' as const, board: null, matchWinner: 'A' as const };
    const board = teamScoreboard(carromState(live));
    expect(board?.showClock).toBe(false);
    expect(board?.isLive).toBe(false);
    expect(board?.phase).toBe('Full time');
  });
});

describe('carrom dock triggers', () => {
  it('exposes every celebration the overlay can render', () => {
    expect(CARROM_DOCK_TRIGGERS.map(trigger => trigger.type)).toEqual(
      ['queen_covered', 'board_won', 'game_won', 'match_won', 'foul'],
    );
  });

  it('reuses the engine event (side and points) for the latest board', () => {
    const started = startCarromMatch('m1', 'A', NOW);
    const live = awardCarromBoard(started, 'B', 5, false, DEFAULT_CARROM_RULES, NOW).live;
    expect(resolveDockSide('board_won', live)).toBe('B');
    const event = buildDockEvent('board_won', live, 'B', NOW + 10);
    expect(event.side).toBe('B');
    expect(event.points).toBe(5);
    expect(event.id).not.toMatch(/^dock_/);
  });

  it('builds a synthetic event when the operator overrides the side', () => {
    const started = startCarromMatch('m1', 'A', NOW);
    const live = awardCarromBoard(started, 'B', 5, false, DEFAULT_CARROM_RULES, NOW).live;
    const event = buildDockEvent('board_won', live, 'A', NOW + 10);
    expect(event.id).toBe(`dock_${NOW + 10}`);
    expect(event.side).toBe('A');
    expect(event.description).toBe('Board won by side A');
  });

  it('falls back to a sensible side without any matching event', () => {
    expect(resolveDockSide('match_won', null)).toBe('A');
    const live = startCarromMatch('m1', 'B', NOW);
    expect(resolveDockSide('foul', live)).toBe('B');
    expect(buildDockEvent('match_won', live, 'A', NOW).description).toBe('Match won by side A (0–0)');
  });
});

describe('multi-camera sources', () => {
  it('treats sources without a transport as WebRTC and native RTSP sources as non-decodable', () => {
    expect(isWebRtcSource({})).toBe(true);
    expect(isWebRtcSource({ transport: 'webrtc' })).toBe(true);
    expect(isWebRtcSource({ transport: 'rtsp' })).toBe(false);
  });
});
