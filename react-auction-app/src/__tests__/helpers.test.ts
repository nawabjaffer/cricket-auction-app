import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  generateUUID,
  deepClone,
  shallowEqual,
  debounce,
  throttle,
  safeJsonParse,
  isEmpty,
  getNestedValue,
  setNestedValue,
  groupBy,
  sortBy,
  uniqueBy,
  shuffle,
  chunk,
  getPlayerAvatarUrl,
  getTeamLogoUrl,
  calculatePercentage,
  clamp,
  roundTo,
  sleep,
  retry,
  isBrowser,
  isMobile,
  getStorage,
  setStorage,
  removeStorage,
} from '../utils/helpers';

describe('generateId', () => {
  it('generates unique IDs with prefix', () => {
    const id = generateId('player');
    expect(id).toMatch(/^player_/);
  });

  it('generates different IDs on each call', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});

describe('generateUUID', () => {
  it('generates valid UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('deepClone', () => {
  it('creates a deep copy', () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = deepClone(original);
    clone.b.c = 3;
    expect(original.b.c).toBe(2);
  });

  it('handles arrays', () => {
    const original = [1, [2, 3]];
    const clone = deepClone(original);
    (clone[1] as number[])[0] = 9;
    expect((original[1] as number[])[0]).toBe(2);
  });
});

describe('shallowEqual', () => {
  it('returns true for identical objects', () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('returns false for different values', () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns false for different keys', () => {
    expect(shallowEqual({ a: 1 } as Record<string, unknown>, { b: 1 } as Record<string, unknown>)).toBe(false);
  });
});

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('throttle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('executes immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('ignores calls within limit', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('allows calls after limit', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
  });
});

describe('isEmpty', () => {
  it('returns true for null/undefined', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('returns true for empty strings', () => {
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
  });

  it('returns true for empty arrays and objects', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it('returns false for non-empty values', () => {
    expect(isEmpty('hello')).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });
});

describe('getNestedValue', () => {
  it('gets deeply nested values', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, 'a.b.c')).toBe(42);
  });

  it('returns default for missing paths', () => {
    const obj = { a: 1 };
    expect(getNestedValue(obj, 'a.b.c', 'fallback')).toBe('fallback');
  });
});

describe('setNestedValue', () => {
  it('sets deeply nested values', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 42);
    expect((obj.a as Record<string, unknown>)).toBeDefined();
    expect(getNestedValue(obj, 'a.b.c')).toBe(42);
  });
});

describe('groupBy', () => {
  it('groups items by key', () => {
    const arr = [
      { role: 'Batsman', name: 'A' },
      { role: 'Bowler', name: 'B' },
      { role: 'Batsman', name: 'C' },
    ];
    const result = groupBy(arr, 'role');
    expect(result['Batsman']).toHaveLength(2);
    expect(result['Bowler']).toHaveLength(1);
  });
});

describe('sortBy', () => {
  it('sorts ascending by default', () => {
    const arr = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const sorted = sortBy(arr, 'v');
    expect(sorted.map(i => i.v)).toEqual([1, 2, 3]);
  });

  it('sorts descending', () => {
    const arr = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const sorted = sortBy(arr, 'v', false);
    expect(sorted.map(i => i.v)).toEqual([3, 2, 1]);
  });

  it('handles null values', () => {
    const arr = [{ v: 2 }, { v: null }, { v: 1 }];
    const sorted = sortBy(arr, 'v');
    expect(sorted[2].v).toBeNull();
  });
});

describe('uniqueBy', () => {
  it('removes duplicates by key', () => {
    const arr = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
    const result = uniqueBy(arr, 'id');
    expect(result).toHaveLength(2);
    expect(result[0].v).toBe('a');
  });
});

describe('shuffle', () => {
  it('returns same length array', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr)).toHaveLength(5);
  });

  it('does not mutate original array', () => {
    const arr = [1, 2, 3];
    shuffle(arr);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('chunk', () => {
  it('splits array into chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk for small arrays', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('handles empty arrays', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('getPlayerAvatarUrl', () => {
  it('returns imageUrl when provided', () => {
    expect(getPlayerAvatarUrl('https://example.com/img.jpg', 'John')).toBe('https://example.com/img.jpg');
  });

  it('returns fallback URL when image is empty', () => {
    const url = getPlayerAvatarUrl(undefined, 'John Doe');
    expect(url).toContain('ui-avatars.com');
    expect(url).toContain('John%20Doe');
  });

  it('returns fallback for whitespace-only imageUrl', () => {
    const url = getPlayerAvatarUrl('   ', 'Test');
    expect(url).toContain('ui-avatars.com');
  });
});

describe('getTeamLogoUrl', () => {
  it('returns logoUrl when provided', () => {
    expect(getTeamLogoUrl('https://example.com/logo.png', 'Team')).toBe('https://example.com/logo.png');
  });

  it('returns fallback URL when logo is empty', () => {
    const url = getTeamLogoUrl(undefined, 'Mumbai Indians');
    expect(url).toContain('ui-avatars.com');
  });
});

describe('calculatePercentage', () => {
  it('calculates correct percentage', () => {
    expect(calculatePercentage(50, 200)).toBe(25);
    expect(calculatePercentage(3, 4)).toBe(75);
  });

  it('returns 0 for zero total', () => {
    expect(calculatePercentage(5, 0)).toBe(0);
  });
});

describe('clamp', () => {
  it('clamps value below min', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('clamps value above max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('returns value when in range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe('roundTo', () => {
  it('rounds to specified decimals', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(3.145, 2)).toBe(3.15);
    expect(roundTo(10.5, 0)).toBe(11);
  });
});

describe('sleep', () => {
  it('resolves after delay', async () => {
    vi.useFakeTimers();
    const p = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('retry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    vi.useFakeTimers();
    const p = retry(fn, 3, 1);
    await vi.advanceTimersByTimeAsync(10);
    const result = await p;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws after all retries fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    vi.useFakeTimers();
    const p = retry(fn, 2, 1);
    const rejection = expect(p).rejects.toThrow('always fail');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    vi.useRealTimers();
  });
});

describe('isBrowser', () => {
  it('returns true in jsdom', () => {
    expect(isBrowser()).toBe(true);
  });
});

describe('isMobile', () => {
  it('returns false for non-mobile user agent', () => {
    expect(isMobile()).toBe(false);
  });
});

describe('getStorage', () => {
  it('gets value from localStorage', () => {
    localStorage.setItem('testKey', 'testVal');
    expect(getStorage('testKey')).toBe('testVal');
    localStorage.removeItem('testKey');
  });

  it('returns null for missing key', () => {
    expect(getStorage('nonexistent')).toBeNull();
  });
});

describe('setStorage', () => {
  it('sets value in localStorage', () => {
    expect(setStorage('myKey', 'myVal')).toBe(true);
    expect(localStorage.getItem('myKey')).toBe('myVal');
    localStorage.removeItem('myKey');
  });
});

describe('removeStorage', () => {
  it('removes value from localStorage', () => {
    localStorage.setItem('toRemove', 'val');
    removeStorage('toRemove');
    expect(localStorage.getItem('toRemove')).toBeNull();
  });
});
