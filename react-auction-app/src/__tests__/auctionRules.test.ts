import { describe, it, expect } from 'vitest';
import { AuctionRulesService } from '../services/auctionRules';
import type { Team } from '../types';

const defaultConfig = {
  minimumPlayerBasePrice: 1,
  safeFundBufferPercent: 1.2,
  underAgeLimit: 19,
  maxUnderAgePlayers: 2,
};

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'T1',
    name: 'Test Team',
    logoUrl: '',
    playersBought: 5,
    totalPlayerThreshold: 11,
    remainingPlayers: 6,
    allocatedAmount: 100,
    remainingPurse: 50,
    highestBid: 10,
    captain: '',
    underAgePlayers: 0,
    ...overrides,
  };
}

describe('AuctionRulesService', () => {
  const rules = new AuctionRulesService(defaultConfig);

  describe('calculateMaxBid', () => {
    it('calculates max bid correctly', () => {
      const team = makeTeam({ remainingPurse: 50, remainingPlayers: 6 });
      // maxBid = 50 - (6-1)*1 = 45
      expect(rules.calculateMaxBid(team)).toBe(45);
    });

    it('returns 0 when no remaining players', () => {
      const team = makeTeam({ remainingPlayers: 0 });
      expect(rules.calculateMaxBid(team)).toBe(0);
    });

    it('returns 0 when purse too low', () => {
      const team = makeTeam({ remainingPurse: 3, remainingPlayers: 6 });
      // maxBid = 3 - (5)*1 = -2 → 0
      expect(rules.calculateMaxBid(team)).toBe(0);
    });

    it('returns full purse when 1 remaining player', () => {
      const team = makeTeam({ remainingPurse: 20, remainingPlayers: 1 });
      expect(rules.calculateMaxBid(team)).toBe(20);
    });
  });

  describe('validateTotalBudget', () => {
    it('approves bid within budget', () => {
      const team = makeTeam({ allocatedAmount: 100, remainingPurse: 50 });
      expect(rules.validateTotalBudget(team, 30)).toBe(true);
    });

    it('rejects bid exceeding budget', () => {
      const team = makeTeam({ allocatedAmount: 100, remainingPurse: 50 });
      expect(rules.validateTotalBudget(team, 60)).toBe(false);
    });

    it('approves bid at exact budget', () => {
      const team = makeTeam({ allocatedAmount: 100, remainingPurse: 50 });
      expect(rules.validateTotalBudget(team, 50)).toBe(true);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid bid amount %s', (bidAmount) => {
      expect(rules.validateTotalBudget(makeTeam(), bidAmount)).toBe(false);
    });
  });

  describe('validatePlayerCount', () => {
    it('allows when under threshold', () => {
      expect(rules.validatePlayerCount(makeTeam({ playersBought: 5, totalPlayerThreshold: 11 }))).toBe(true);
    });

    it('rejects when at threshold', () => {
      expect(rules.validatePlayerCount(makeTeam({ playersBought: 11, totalPlayerThreshold: 11 }))).toBe(false);
    });
  });

  describe('validateMinimumBalance', () => {
    it('allows when purse >= basePrice', () => {
      expect(rules.validateMinimumBalance(makeTeam({ remainingPurse: 5 }), 5)).toBe(true);
    });

    it('rejects when purse < basePrice', () => {
      expect(rules.validateMinimumBalance(makeTeam({ remainingPurse: 3 }), 5)).toBe(false);
    });
  });

  describe('validateUnderAgeLimit', () => {
    it('allows adult players', () => {
      expect(rules.validateUnderAgeLimit(makeTeam(), 25)).toBe(true);
    });

    it('allows under-age when under limit', () => {
      expect(rules.validateUnderAgeLimit(makeTeam({ underAgePlayers: 1 }), 17)).toBe(true);
    });

    it('rejects under-age when at limit', () => {
      expect(rules.validateUnderAgeLimit(makeTeam({ underAgePlayers: 2 }), 17)).toBe(false);
    });

    it('allows null age', () => {
      expect(rules.validateUnderAgeLimit(makeTeam(), null)).toBe(true);
    });
  });

  describe('validateBid (comprehensive)', () => {
    it('validates a valid bid', () => {
      const team = makeTeam();
      const result = rules.validateBid(team, 10, 5, 25);
      expect(result.valid).toBe(true);
    });

    it('rejects when team is full', () => {
      const team = makeTeam({ playersBought: 11, totalPlayerThreshold: 11 });
      const result = rules.validateBid(team, 10);
      expect(result.valid).toBe(false);
      expect(result.ruleId).toBe('RULE_004');
    });

    it('rejects when over budget', () => {
      const team = makeTeam({ allocatedAmount: 100, remainingPurse: 50 });
      const result = rules.validateBid(team, 60);
      expect(result.valid).toBe(false);
      expect(result.ruleId).toBe('RULE_003');
    });

    it('rejects when balance too low for base price', () => {
      const team = makeTeam({ remainingPurse: 3 });
      const result = rules.validateBid(team, 2, 5);
      expect(result.valid).toBe(false);
      expect(result.ruleId).toBe('RULE_005');
    });

    it('rejects under-age limit', () => {
      const team = makeTeam({ underAgePlayers: 2 });
      const result = rules.validateBid(team, 10, 5, 17);
      expect(result.valid).toBe(false);
      expect(result.ruleId).toBe('RULE_009');
    });

    it('rejects bid exceeding max bid', () => {
      const team = makeTeam({ remainingPurse: 10, remainingPlayers: 6 });
      // maxBid = 10 - 5*1 = 5
      const result = rules.validateBid(team, 8, 1, 25);
      expect(result.valid).toBe(false);
      expect(result.ruleId).toBe('RULE_001');
    });

    it('allows a bid exactly at the calculated maximum', () => {
      const team = makeTeam({ remainingPurse: 10, remainingPlayers: 6 });
      const result = rules.validateBid(team, 5, 1, 25);
      expect(result.valid).toBe(true);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid bid amount %s', (bidAmount) => {
      const result = rules.validateBid(makeTeam(), bidAmount, 1, 25);
      expect(result.valid).toBe(false);
      expect(result.ruleId).toBe('RULE_003');
    });

    it('warns on unsafe fund threshold', () => {
      const team = makeTeam({ remainingPurse: 50, remainingPlayers: 6 });
      // maxBid = 50 - 5 = 45; safe threshold = 5*1*1.2 = 6; after 45 bid: 5 < 6 → warning
      const result = rules.validateBid(team, 45, 1, 25);
      expect(result.valid).toBe(true);
      expect(result.isWarning).toBe(true);
      expect(result.ruleId).toBe('RULE_006');
    });
  });

  describe('getTeamStatus', () => {
    it('returns safe for healthy team', () => {
      const team = makeTeam({ remainingPurse: 50, remainingPlayers: 6 });
      expect(rules.getTeamStatus(team, 5, 0.5)).toBe('safe');
    });

    it('returns danger for full team', () => {
      const team = makeTeam({ playersBought: 11, totalPlayerThreshold: 11 });
      expect(rules.getTeamStatus(team, 5, 0.5)).toBe('danger');
    });
  });

  describe('getBidRestrictionMessage', () => {
    it('returns appropriate messages for each rule', () => {
      const team = makeTeam();
      expect(rules.getBidRestrictionMessage(team, 10, 'RULE_001')).toContain('cannot bid');
      expect(rules.getBidRestrictionMessage(team, 10, 'RULE_003')).toContain('exhausted budget');
      expect(rules.getBidRestrictionMessage(team, 10, 'RULE_004')).toContain('full');
      expect(rules.getBidRestrictionMessage(team, 10, 'RULE_005')).toContain('insufficient');
      expect(rules.getBidRestrictionMessage(team, 10, 'RULE_009')).toContain('under-');
      expect(rules.getBidRestrictionMessage(team, 10, null)).toContain('cannot place');
    });
  });

  describe('config getters', () => {
    it('exposes config values', () => {
      expect(rules.minimumPlayerBasePrice).toBe(1);
      expect(rules.safeFundBufferPercent).toBe(1.2);
      expect(rules.underAgeLimit).toBe(19);
      expect(rules.maxUnderAgePlayers).toBe(2);
    });
  });
});
