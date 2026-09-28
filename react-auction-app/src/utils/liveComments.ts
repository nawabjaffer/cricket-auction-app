import type { LiveComment } from '../types/scoring';

export function rankLiveComments(comments: LiveComment[]): LiveComment[] {
  return [...comments].sort((a, b) =>
    b.upvotes - a.upvotes || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

export function nextLiveComment(comments: LiveComment[], currentId: string): LiveComment | null {
  if (comments.length === 0) return null;
  const currentIndex = comments.findIndex(comment => comment.id === currentId);
  return comments[(currentIndex + 1 + comments.length) % comments.length];
}
