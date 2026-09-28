import { describe, expect, it } from 'vitest';
import type { LiveComment } from '../types/scoring';
import { nextLiveComment, rankLiveComments } from '../utils/liveComments';

const comment = (id: string, upvotes: number, createdAt: number): LiveComment => ({
  id,
  name: id,
  message: `Message ${id}`,
  source: 'audience',
  upvotes,
  createdAt,
});

describe('rankLiveComments', () => {
  it('orders by most votes, then oldest first without mutating input', () => {
    const input = [comment('later', 2, 30), comment('popular', 9, 50), comment('early', 2, 10)];
    expect(rankLiveComments(input).map(item => item.id)).toEqual(['popular', 'early', 'later']);
    expect(input.map(item => item.id)).toEqual(['later', 'popular', 'early']);
  });
});

describe('nextLiveComment', () => {
  it('advances and wraps through a ranked queue', () => {
    const queue = [comment('top', 4, 1), comment('next', 2, 2)];
    expect(nextLiveComment(queue, 'top')?.id).toBe('next');
    expect(nextLiveComment(queue, 'next')?.id).toBe('top');
  });

  it('starts at the first comment if the current one was removed', () => {
    expect(nextLiveComment([comment('top', 4, 1)], 'removed')?.id).toBe('top');
    expect(nextLiveComment([], 'removed')).toBeNull();
  });
});
