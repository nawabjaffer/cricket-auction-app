import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateUrl,
  validatePlayerSale,
  validateBidAmount,
  validateTeamCanBid,
  validateRequired,
  validateRange,
  validatePositive,
  validateArrayNotEmpty,
  combineValidations,
  createValidation,
} from '../utils/validators';

// Helpers to create test objects matching IPlayer / ITeam
const makePlayer = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'P001',
  name: 'Test Player',
  imageUrl: '',
  role: 'Batsman',
  age: 25,
  matches: '10',
  runs: '500',
  wickets: '0',
  battingBestFigures: '100',
  bowlingBestFigures: 'N/A',
  basePrice: 5,
  ...overrides,
});

const makeTeam = (overrides: Partial<Record<string, unknown>> = {}) => ({
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
});

describe('validateEmail', () => {
  it('validates correct emails', () => {
    expect(validateEmail('test@example.com').valid).toBe(true);
    expect(validateEmail('user.name@domain.org').valid).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('invalid').valid).toBe(false);
    expect(validateEmail('@no-user.com').valid).toBe(false);
    expect(validateEmail('no-domain@').valid).toBe(false);
  });
});

describe('validateUrl', () => {
  it('validates correct URLs', () => {
    expect(validateUrl('https://example.com').valid).toBe(true);
    expect(validateUrl('http://localhost:3000').valid).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(validateUrl('not a url').valid).toBe(false);
    expect(validateUrl('').valid).toBe(false);
  });
});

describe('validatePlayerSale', () => {
  const config = { minimumBid: 5, maxUnderAge: 2 };

  it('validates a valid sale', () => {
    const result = validatePlayerSale(makePlayer() as never, makeTeam() as never, 10, config);
    expect(result.valid).toBe(true);
  });

  it('rejects when no player', () => {
    const result = validatePlayerSale(null, makeTeam() as never, 10, config);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('NO_PLAYER');
  });

  it('rejects when no team', () => {
    const result = validatePlayerSale(makePlayer() as never, null, 10, config);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('NO_TEAM');
  });

  it('rejects bid below minimum', () => {
    const result = validatePlayerSale(makePlayer() as never, makeTeam() as never, 1, config);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('BID_TOO_LOW');
  });

  it('rejects when team is full', () => {
    const team = makeTeam({ playersBought: 11, totalPlayerThreshold: 11 });
    const result = validatePlayerSale(makePlayer() as never, team as never, 10, config);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('TEAM_FULL');
  });

  it('rejects when bid exceeds purse capacity', () => {
    const team = makeTeam({ remainingPurse: 10, remainingPlayers: 6 });
    const result = validatePlayerSale(makePlayer() as never, team as never, 50, config);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('INSUFFICIENT_PURSE');
  });

  it('rejects under-age player when limit reached', () => {
    const player = makePlayer({ age: 17 });
    const team = makeTeam({ underAgePlayers: 2 });
    const result = validatePlayerSale(player as never, team as never, 10, config);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('UNDERAGE_LIMIT');
  });
});

describe('validateBidAmount', () => {
  it('validates correct bid', () => {
    expect(validateBidAmount(15, 10, 5, 0.5).valid).toBe(true);
  });

  it('rejects bid below minimum', () => {
    const result = validateBidAmount(2, 0, 5, 0.5);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('BELOW_MINIMUM');
  });

  it('rejects bid not higher than current', () => {
    const result = validateBidAmount(10, 10, 5, 0.5);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('NOT_HIGHER');
  });

  it('rejects bid below increment', () => {
    const result = validateBidAmount(10.1, 10, 5, 0.5);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('BELOW_INCREMENT');
  });
});

describe('validateTeamCanBid', () => {
  it('allows eligible teams to bid', () => {
    const team = makeTeam();
    expect(validateTeamCanBid(team as never, 5).valid).toBe(true);
  });

  it('rejects full teams', () => {
    const team = makeTeam({ playersBought: 11, totalPlayerThreshold: 11 });
    expect(validateTeamCanBid(team as never, 5).valid).toBe(false);
    expect(validateTeamCanBid(team as never, 5).code).toBe('TEAM_FULL');
  });

  it('rejects teams with no budget', () => {
    const team = makeTeam({ remainingPurse: 5, remainingPlayers: 6 });
    expect(validateTeamCanBid(team as never, 5).valid).toBe(false);
    expect(validateTeamCanBid(team as never, 5).code).toBe('NO_BUDGET');
  });
});

describe('validateRequired', () => {
  it('passes for non-empty strings', () => {
    expect(validateRequired('hello', 'field').valid).toBe(true);
  });

  it('fails for null/undefined/empty', () => {
    expect(validateRequired(null, 'field').valid).toBe(false);
    expect(validateRequired(undefined, 'field').valid).toBe(false);
    expect(validateRequired('', 'field').valid).toBe(false);
    expect(validateRequired('  ', 'field').valid).toBe(false);
  });
});

describe('validateRange', () => {
  it('passes for values in range', () => {
    expect(validateRange(5, 1, 10, 'val').valid).toBe(true);
    expect(validateRange(1, 1, 10, 'val').valid).toBe(true);
    expect(validateRange(10, 1, 10, 'val').valid).toBe(true);
  });

  it('fails for values out of range', () => {
    expect(validateRange(0, 1, 10, 'val').valid).toBe(false);
    expect(validateRange(11, 1, 10, 'val').valid).toBe(false);
  });
});

describe('validatePositive', () => {
  it('passes for positive numbers', () => {
    expect(validatePositive(1, 'val').valid).toBe(true);
    expect(validatePositive(0.5, 'val').valid).toBe(true);
  });

  it('fails for zero and negative', () => {
    expect(validatePositive(0, 'val').valid).toBe(false);
    expect(validatePositive(-1, 'val').valid).toBe(false);
  });
});

describe('validateArrayNotEmpty', () => {
  it('passes for non-empty arrays', () => {
    expect(validateArrayNotEmpty([1], 'arr').valid).toBe(true);
  });

  it('fails for null/undefined/empty', () => {
    expect(validateArrayNotEmpty(null, 'arr').valid).toBe(false);
    expect(validateArrayNotEmpty(undefined, 'arr').valid).toBe(false);
    expect(validateArrayNotEmpty([], 'arr').valid).toBe(false);
  });
});

describe('combineValidations', () => {
  it('returns valid when all pass', () => {
    expect(combineValidations(
      { valid: true },
      { valid: true },
    ).valid).toBe(true);
  });

  it('returns first failure', () => {
    const result = combineValidations(
      { valid: true },
      { valid: false, message: 'fail1' },
      { valid: false, message: 'fail2' },
    );
    expect(result.valid).toBe(false);
    expect(result.message).toBe('fail1');
  });
});

describe('createValidation', () => {
  it('creates validation result', () => {
    expect(createValidation(true)).toEqual({ valid: true, message: undefined, code: undefined });
    expect(createValidation(false, 'err', 'E01')).toEqual({ valid: false, message: 'err', code: 'E01' });
  });
});
