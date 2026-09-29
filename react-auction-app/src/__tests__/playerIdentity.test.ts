import { describe, it, expect } from 'vitest';
import { createPlayerBlocker } from '../utils/playerIdentity';

describe('createPlayerBlocker', () => {
  const sold = [{ id: 'csv-1', name: 'ravi kumar', age: 25 }];

  it('blocks the same ID', () => {
    expect(createPlayerBlocker(sold)({ id: 'csv-1', name: 'Someone Else' })).toBe(true);
  });

  it('blocks the same person imported again under a different ID', () => {
    expect(createPlayerBlocker(sold)({ id: 'PLAYER-9', name: '  Ravi   Kumar ', age: 25 })).toBe(true);
    expect(createPlayerBlocker(sold)({ id: 'PLAYER-9', name: 'Ravi Kumar', age: null })).toBe(true);
  });

  it('keeps a same-named player with a different age or phone', () => {
    expect(createPlayerBlocker(sold)({ id: 'X', name: 'Ravi Kumar', age: 31 })).toBe(false);
    const withPhone = createPlayerBlocker([{ id: 'a', name: 'Ravi Kumar', phone: '98450 11111' }]);
    expect(withPhone({ id: 'b', name: 'Ravi Kumar', phone: '9845022222' })).toBe(false);
    expect(withPhone({ id: 'b', name: 'Ravi Kumar', phone: '+91 98450 11111' })).toBe(true);
    expect(withPhone({ id: 'b', name: 'Ravi Kumar', phone: '9845011111' })).toBe(true);
  });

  it('does not block unrelated players', () => {
    expect(createPlayerBlocker(sold)({ id: 'Z', name: 'Another Person' })).toBe(false);
  });
});
