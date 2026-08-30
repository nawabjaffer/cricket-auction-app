import { describe, it, expect } from 'vitest';
import { kabaddiService } from '../services/kabaddi';
import {
  createEmptyKabaddiLiveState, DEFAULT_KABADDI_RULES,
  isSuperTackle, isBonusAvailable, raidSecondsRemaining,
} from '../types/kabaddi';
import type { KabaddiLiveState } from '../types/kabaddi';
import {
  getKabaddiRoleCategory, isKabaddiRole, getKabaddiRoleBadgeClass,
} from '../utils/kabaddiRoles';
import { getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';

const RULES = DEFAULT_KABADDI_RULES;
const A = 'teamA';
const B = 'teamB';

function freshLive(overrides: Partial<KabaddiLiveState> = {}): KabaddiLiveState {
  return { ...createEmptyKabaddiLiveState('m1', A, B, RULES.playersPerSide), ...overrides };
}

describe('kabaddi rules helpers', () => {
  it('flags a super tackle only when the defence is thin', () => {
    expect(isSuperTackle(3, RULES)).toBe(true);
    expect(isSuperTackle(2, RULES)).toBe(true);
    expect(isSuperTackle(4, RULES)).toBe(false);
  });

  it('allows a bonus point only with enough defenders on the mat', () => {
    expect(isBonusAvailable(6, RULES)).toBe(true);
    expect(isBonusAvailable(7, RULES)).toBe(true);
    expect(isBonusAvailable(5, RULES)).toBe(false);
  });

  it('disables the bonus entirely when the rulebook turns the line off', () => {
    expect(isBonusAvailable(7, { ...RULES, bonusLineEnabled: false })).toBe(false);
  });

  it('counts down the 30-second raid clock', () => {
    const live = freshLive({ raidClockStartedAt: Date.now() - 5000 });
    expect(raidSecondsRemaining(live, RULES)).toBe(25);
  });

  it('returns no raid clock when no raid is running', () => {
    expect(raidSecondsRemaining(freshLive(), RULES)).toBeNull();
  });
});

describe('resolveRaid', () => {
  it('awards touch points and sends tagged defenders off the mat', () => {
    const live = freshLive({ raidingTeamId: A });
    const { live: next } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 2, bonus: false, raiderOut: false }, RULES,
    );
    expect(next.teamA.score).toBe(2);
    expect(next.teamB.playersOnCourt).toBe(5);
    expect(next.teamA.totalRaidPoints).toBe(2);
  });

  it('adds a bonus point on top of touches', () => {
    const live = freshLive({ raidingTeamId: A });
    const { live: next, celebration } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 1, bonus: true, raiderOut: false }, RULES,
    );
    expect(next.teamA.score).toBe(2);
    expect(next.teamA.totalBonusPoints).toBe(1);
    expect(celebration).toBeTruthy();
  });

  it('denies the bonus when the defence is already depleted', () => {
    const live = freshLive({ raidingTeamId: A, teamB: { ...freshLive().teamB, playersOnCourt: 4 } });
    const { live: next } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 0, bonus: true, raiderOut: false }, RULES,
    );
    expect(next.teamA.score).toBe(0);
    expect(next.teamA.totalBonusPoints).toBe(0);
  });

  it('celebrates a super raid at three or more points', () => {
    const live = freshLive({ raidingTeamId: A });
    const { celebration, events } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 3, bonus: false, raiderOut: false }, RULES,
    );
    expect(celebration).toBe('super_raid');
    expect(events.some(e => e.type === 'super_raid')).toBe(true);
  });

  it('gives the defence one point for an ordinary tackle', () => {
    const live = freshLive({ raidingTeamId: A });
    const { live: next, celebration } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 0, bonus: false, raiderOut: true }, RULES,
    );
    expect(next.teamB.score).toBe(1);
    expect(next.teamA.playersOnCourt).toBe(6);
    expect(celebration).toBeNull();
  });

  it('pays two points for a super tackle with a thin defence', () => {
    const base = freshLive();
    const live = freshLive({ raidingTeamId: A, teamB: { ...base.teamB, playersOnCourt: 3 } });
    const { live: next, celebration } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 0, bonus: false, raiderOut: true }, RULES,
    );
    expect(next.teamB.score).toBe(RULES.superTacklePoints);
    expect(celebration).toBe('super_tackle');
  });

  it('tracks consecutive empty raids', () => {
    let live = freshLive({ raidingTeamId: A });
    live = kabaddiService.resolveRaid(live, { raidingTeamId: A, touches: 0, bonus: false, raiderOut: false }, RULES).live;
    expect(live.teamA.consecutiveEmptyRaids).toBe(1);
    live = kabaddiService.resolveRaid(live, { raidingTeamId: A, touches: 0, bonus: false, raiderOut: false }, RULES).live;
    expect(live.teamA.consecutiveEmptyRaids).toBe(2);
  });

  it('flags the next raid as do-or-die after two empty raids', () => {
    const base = freshLive();
    const live = freshLive({
      raidingTeamId: B,
      teamA: { ...base.teamA, consecutiveEmptyRaids: 2 },
    });
    // B raids and is tackled, handing the raid back to A who are on 2 empties.
    const { live: next } = kabaddiService.resolveRaid(
      live, { raidingTeamId: B, touches: 1, bonus: false, raiderOut: false }, RULES,
    );
    expect(next.raidingTeamId).toBe(A);
    expect(next.isDoOrDie).toBe(true);
  });

  it('awards an all-out with bonus points and revives the emptied side', () => {
    const base = freshLive();
    const live = freshLive({ raidingTeamId: A, teamB: { ...base.teamB, playersOnCourt: 2 } });
    const { live: next, celebration } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 2, bonus: false, raiderOut: false }, RULES,
    );
    expect(celebration).toBe('all_out');
    // 2 touch points + 2 all-out bonus points
    expect(next.teamA.score).toBe(2 + RULES.allOutBonusPoints);
    expect(next.teamB.playersOnCourt).toBe(RULES.playersPerSide);
    expect(next.teamB.allOutsConceded).toBe(1);
    expect(next.teamA.allOutsInflicted).toBe(1);
  });

  it('hands the raid to the other side after every raid', () => {
    const live = freshLive({ raidingTeamId: A });
    const { live: next } = kabaddiService.resolveRaid(
      live, { raidingTeamId: A, touches: 1, bonus: false, raiderOut: false }, RULES,
    );
    expect(next.raidingTeamId).toBe(B);
    expect(next.raidClockStartedAt).toBe(0);
  });
});

describe('kabaddi auction roles', () => {
  it('detects raiders and defenders from roster strings', () => {
    expect(getKabaddiRoleCategory('Raider')).toBe('Raider');
    expect(getKabaddiRoleCategory('raider')).toBe('Raider');
    expect(getKabaddiRoleCategory('Defender')).toBe('Defender');
    expect(getKabaddiRoleCategory('Left Corner')).toBe('Defender');
    expect(getKabaddiRoleCategory('Right Cover')).toBe('Defender');
  });

  it('treats explicitly kabaddi all-rounders as all-rounders', () => {
    expect(getKabaddiRoleCategory('Kabaddi All-Rounder')).toBe('All-Rounder');
    expect(getKabaddiRoleCategory('Raider All-Rounder')).toBe('All-Rounder');
  });

  it('leaves cricket roles untouched', () => {
    expect(getKabaddiRoleCategory('Batsman')).toBeNull();
    expect(getKabaddiRoleCategory('Bowler')).toBeNull();
    expect(getKabaddiRoleCategory('All-Rounder')).toBeNull();
    expect(isKabaddiRole('Wicket Keeper Batsman')).toBe(false);
  });

  it('maps kabaddi roles to their own badge classes', () => {
    expect(getKabaddiRoleBadgeClass('Raider')).toBe('role-raider');
    expect(getKabaddiRoleBadgeClass('Left Corner')).toBe('role-defender');
    expect(getKabaddiRoleBadgeClass('Batsman')).toBeNull();
  });

  it('surfaces kabaddi roles through the shared auction helpers', () => {
    expect(getRoleLabel('Raider')).toBe('Raider');
    expect(getRoleLabel('Right Corner')).toBe('Defender');
    expect(getRoleBadgeClass('Raider')).toBe('role-raider');
    // Cricket behaviour is preserved
    expect(getRoleLabel('Batsman')).toBe('Batsman');
    expect(getRoleBadgeClass('Bowler')).toBe('role-bowler');
  });
});
